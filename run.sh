#!/bin/sh
# Сборка и запуск конструктора мебели. Без аргументов — интерактивное меню.
# Режимы: serve | bg | stop | check | bump | build | test | all | servertest | full | dev | menu

cd "$(dirname "$0")" || exit 1
ROOT=$(pwd)
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$RUN_DIR/server.log"
PORT=${PORT:-8080}

say()  { printf '%s\n' "$*"; }
ok()   { printf '\033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
err()  { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; }
ask()  { printf '%s' "$1"; read -r REPLY; }

ask_port() {
  ask "Порт [$PORT]: "
  [ -n "$REPLY" ] && PORT=$REPLY
  case $PORT in
    ''|*[!0-9]*) err "Порт должен быть числом"; return 1 ;;
  esac
}

port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Команда статического сервера: python3 или npx serve
server_cmd() {
  if command -v python3 >/dev/null 2>&1; then
    SERVER="python3 -m http.server $PORT --directory web"
  elif command -v npx >/dev/null 2>&1; then
    SERVER="npx --yes serve -l $PORT web"
  else
    err "Нужен python3 или npx (Node.js)"; return 1
  fi
}

open_browser() {
  url="http://localhost:$PORT/index.html"
  if command -v open >/dev/null 2>&1; then open "$url"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1
  else say "Откройте в браузере: $url"; fi
}

do_serve() {
  ask_port || return 1
  port_busy "$PORT" && { err "Порт $PORT занят"; return 1; }
  server_cmd || return 1
  say "Сервер: http://localhost:$PORT/index.html (остановка — Ctrl+C)"
  # shellcheck disable=SC2086
  exec $SERVER
}

do_bg() {
  mkdir -p "$RUN_DIR"
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    warn "Фоновый сервер уже запущен (PID $(cat "$PID_FILE"))"; return 0
  fi
  ask_port || return 1
  port_busy "$PORT" && { err "Порт $PORT занят"; return 1; }
  server_cmd || return 1
  # shellcheck disable=SC2086
  nohup $SERVER >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 1
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    ok "Сервер запущен в фоне: http://localhost:$PORT/index.html (PID $(cat "$PID_FILE"), лог: $LOG_FILE)"
    ask "Открыть в браузере? [Y/n]: "
    case $REPLY in n|N) ;; *) open_browser ;; esac
  else
    err "Сервер не стартовал, см. $LOG_FILE"; rm -f "$PID_FILE"; return 1
  fi
}

do_stop() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")" && ok "Сервер остановлен (PID $(cat "$PID_FILE"))"
  else
    warn "Фоновый сервер не запущен"
  fi
  rm -f "$PID_FILE"
}

# Синтаксис всех модулей проекта (vendor не трогаем)
do_check() {
  command -v node >/dev/null 2>&1 || { err "Нужен Node.js"; return 1; }
  fail=0
  for f in web/*.js; do
    if node --check "$f" 2>/tmp/mebel_check.err; then
      printf '  %-22s ok\n' "$f"
    else
      printf '  %-22s ОШИБКА\n' "$f"; sed 's/^/    /' /tmp/mebel_check.err; fail=1
    fi
  done
  for f in server/src/*.js server/src/*/*.js server/test/*.js test/*.js; do
    [ -f "$f" ] || continue
    if node --check "$f" 2>/tmp/mebel_check.err; then :; else
      printf '  %-22s ОШИБКА\n' "$f"; sed 's/^/    /' /tmp/mebel_check.err; fail=1
    fi
  done
  rm -f /tmp/mebel_check.err
  # service worker: все файлы из ASSETS существуют, а каждый модуль web/*.js в нём есть (иначе офлайн-режим сломается)
  for a in $(sed -n '/^const ASSETS/,/^];/p' web/service-worker.js | grep -o "'[^']*'" | tr -d "'" | grep -v '^\./$'); do
    [ -e "web/$a" ] || { printf '  service-worker.js: нет файла web/%s\n' "$a"; fail=1; }
  done
  for f in web/*.js; do
    b=$(basename "$f")
    case $b in service-worker.js) continue ;; esac
    grep -q "'$b'" web/service-worker.js || { printf '  service-worker.js: %s не в ASSETS\n' "$b"; fail=1; }
  done
  [ "$fail" -eq 0 ] && ok "Синтаксис и список кеша в порядке" || { err "Есть ошибки"; return 1; }
}

# Тесты ядра (Vitest, папка test/)
do_test() {
  command -v npm >/dev/null 2>&1 || { err "Нужен Node.js (npm)"; return 1; }
  [ -d test/node_modules ] || (cd test && npm install --silent) || return 1
  (cd test && npm test)
}

# Тесты сервера (API и синхронизация) на настоящем Postgres: контейнер поднимается на время тестов, если он ещё не запущен
do_servertest() {
  command -v docker >/dev/null 2>&1 || { err "Нужен Docker: тестам сервера нужен Postgres"; return 1; }
  docker info >/dev/null 2>&1 || { err "Docker не запущен"; return 1; }
  command -v npm >/dev/null 2>&1 || { err "Нужен Node.js (npm)"; return 1; }
  name=mebel-pg-test; started=0
  if [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" != true ]; then
    port_busy 55432 && { err "Порт 55432 занят не нашим контейнером; задайте TEST_DATABASE_URL или освободите порт"; return 1; }
    docker rm -f "$name" >/dev/null 2>&1
    say "Поднимаю Postgres для тестов ($name)…"
    docker run -d --name "$name" -p 55432:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=mebel_test postgres:16-alpine >/dev/null || return 1
    started=1
  fi
  i=0
  until docker exec "$name" pg_isready -U postgres -d mebel_test >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 40 ] && { err "Postgres не ответил за 40 с"; [ "$started" = 1 ] && docker rm -f "$name" >/dev/null; return 1; }
    sleep 1
  done
  sleep 1 # pg_isready отвечает чуть раньше, чем БД принимает подключения после инициализации
  [ -d server/node_modules ] || (cd server && npm install --silent) || { [ "$started" = 1 ] && docker rm -f "$name" >/dev/null; return 1; }
  (cd server && npm test); rc=$?
  [ "$started" = 1 ] && { docker rm -f "$name" >/dev/null; say "Контейнер $name остановлен"; }
  return $rc
}

# Всё сразу: синтаксис, кеш service worker, тесты ядра
do_all() { do_check && do_test; }
# Всё и сервер
do_full() { do_all && do_servertest; }

# Новая версия кеша service worker — клиенты получат свежие файлы
do_bump() {
  cur=$(sed -n "s/^const VERSION = 'mebel-v\([0-9]*\)'.*/\1/p" web/service-worker.js)
  [ -z "$cur" ] && { err "VERSION не найден в service-worker.js"; return 1; }
  new=$((cur + 1))
  sed "s/^const VERSION = 'mebel-v$cur'/const VERSION = 'mebel-v$new'/" web/service-worker.js >web/service-worker.js.tmp \
    && mv web/service-worker.js.tmp web/service-worker.js
  ok "Версия кеша: mebel-v$cur → mebel-v$new"
}

# Статический пакет для публикации (GitHub Pages, Netlify, Vercel)
do_build() {
  do_check || return 1
  do_test || return 1
  out="$ROOT/dist"
  rm -rf "$out"; mkdir -p "$out"
  cp web/*.html web/manifest.webmanifest web/*.js "$out"/ 2>/dev/null
  cp -R web/icons web/vendor "$out"/
  ok "Пакет собран: $out"
  if command -v zip >/dev/null 2>&1; then
    stamp=$(date +%Y%m%d-%H%M)
    (cd "$out" && zip -qr "../mebel-$stamp.zip" .) && ok "Архив: $ROOT/mebel-$stamp.zip"
  else
    warn "zip не найден — архив не создан"
  fi
}

# Полный стек для разработки: postgres + mailpit + api + шлюз (deploy/docker-compose.dev.yml)
do_dev() {
  command -v docker >/dev/null 2>&1 || { err "Нужен Docker"; return 1; }
  say "Сервис: http://localhost:8088/  ·  почта (Mailpit): http://localhost:8025/"
  exec docker compose -f "$ROOT/deploy/docker-compose.dev.yml" up --build
}

status_line() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    printf 'Фоновый сервер: \033[32mзапущен\033[0m (PID %s)\n' "$(cat "$PID_FILE")"
  else
    printf 'Фоновый сервер: остановлен\n'
  fi
}

menu() {
  while :; do
    printf '\n\033[1mКонструктор корпусной мебели\033[0m\n'
    status_line
    printf '  1) Запустить сервер (на переднем плане)\n'
    printf '  2) Запустить в фоне и открыть в браузере\n'
    printf '  3) Остановить фоновый сервер\n'
    printf '  4) Проверить синтаксис JS\n'
    printf '  5) Поднять версию кеша service worker\n'
    printf '  6) Собрать пакет dist/ и zip для публикации\n'
    printf '  7) Тесты ядра (Vitest)\n'
    printf '  8) Всё: синтаксис + тесты ядра\n'
    printf '  9) Тесты сервера (нужен Docker)\n'
    printf ' 10) Полная проверка: ядро + сервер (нужен Docker)\n'
    printf ' 11) Локальный стек с API и БД (нужен Docker)\n'
    printf '  0) Выход\n'
    ask "Выбор: "
    case $REPLY in
      1) do_serve ;;
      2) do_bg ;;
      3) do_stop ;;
      4) do_check ;;
      5) do_bump ;;
      6) do_build ;;
      7) do_test ;;
      8) do_all ;;
      9) do_servertest ;;
      10) do_full ;;
      11) do_dev ;;
      0|q|Q) exit 0 ;;
      *) warn "Неизвестный пункт" ;;
    esac
  done
}

case ${1:-menu} in
  serve) do_serve ;;
  bg)    do_bg ;;
  stop)  do_stop ;;
  check) do_check ;;
  bump)  do_bump ;;
  build) do_build ;;
  test)  do_test ;;
  all)   do_all ;;
  servertest) do_servertest ;;
  full)  do_full ;;
  dev)   do_dev ;;
  menu)  menu ;;
  *) printf 'Использование: %s [serve|bg|stop|check|bump|build|test|all|servertest|full|dev|menu]\n' "$0"; exit 2 ;;
esac
