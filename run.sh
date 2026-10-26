#!/bin/sh
# Сборка и запуск конструктора мебели. Без аргументов — интерактивное меню.
# Режимы: serve | bg | stop | check | bump | build | menu

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
    SERVER="python3 -m http.server $PORT"
  elif command -v npx >/dev/null 2>&1; then
    SERVER="npx --yes serve -l $PORT ."
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
  for f in *.js; do
    if node --check "$f" 2>/tmp/mebel_check.err; then
      printf '  %-22s ok\n' "$f"
    else
      printf '  %-22s ОШИБКА\n' "$f"; sed 's/^/    /' /tmp/mebel_check.err; fail=1
    fi
  done
  rm -f /tmp/mebel_check.err
  [ "$fail" -eq 0 ] && ok "Синтаксис в порядке" || { err "Есть ошибки"; return 1; }
}

# Новая версия кеша service worker — клиенты получат свежие файлы
do_bump() {
  cur=$(sed -n "s/^const VERSION = 'mebel-v\([0-9]*\)'.*/\1/p" service-worker.js)
  [ -z "$cur" ] && { err "VERSION не найден в service-worker.js"; return 1; }
  new=$((cur + 1))
  sed "s/^const VERSION = 'mebel-v$cur'/const VERSION = 'mebel-v$new'/" service-worker.js >service-worker.js.tmp \
    && mv service-worker.js.tmp service-worker.js
  ok "Версия кеша: mebel-v$cur → mebel-v$new"
}

# Статический пакет для публикации (GitHub Pages, Netlify, Vercel)
do_build() {
  do_check || return 1
  out="$ROOT/dist"
  rm -rf "$out"; mkdir -p "$out"
  cp index.html production.html manifest.webmanifest service-worker.js pwa.js ./*.js "$out"/ 2>/dev/null
  cp -R icons vendor "$out"/
  ok "Пакет собран: $out"
  if command -v zip >/dev/null 2>&1; then
    stamp=$(date +%Y%m%d-%H%M)
    (cd "$out" && zip -qr "../mebel-$stamp.zip" .) && ok "Архив: $ROOT/mebel-$stamp.zip"
  else
    warn "zip не найден — архив не создан"
  fi
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
    printf '  0) Выход\n'
    ask "Выбор: "
    case $REPLY in
      1) do_serve ;;
      2) do_bg ;;
      3) do_stop ;;
      4) do_check ;;
      5) do_bump ;;
      6) do_build ;;
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
  menu)  menu ;;
  *) printf 'Использование: %s [serve|bg|stop|check|bump|build|menu]\n' "$0"; exit 2 ;;
esac
