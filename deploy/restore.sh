#!/bin/sh
# Восстановление базы из дампа. Запуск из любого места: deploy/restore.sh [-y] [имя файла в томе backups | путь к локальному .sql.gz]
# Без аргумента берётся самый свежий дамп из тома. Текущие данные базы заменяются; перед этим останавливается api.
set -eu
cd "$(dirname "$0")"
dc="docker compose"
yes=0
if [ "${1:-}" = "-y" ]; then yes=1; shift; fi
src=${1:-}
if [ -n "$src" ] && [ -f "$src" ]; then
  label="локальный файл $src"
else
  if [ -z "$src" ]; then src=$($dc exec -T backup sh -c 'ls -1 /backups/mebel-*.sql.gz 2>/dev/null | sort | tail -n 1' | tr -d '\r'); fi
  case $src in /*) ;; *) src=/backups/$src ;; esac
  [ -n "$src" ] && $dc exec -T backup test -f "$src" || { echo "Дамп не найден: $src" >&2; exit 1; }
  label="дамп $src из тома backups"
fi
echo "Будет восстановлена база из: $label"
echo "Все текущие данные базы mebel будут заменены."
if [ "$yes" != 1 ]; then
  printf 'Продолжить? (введите yes): '
  read -r a
  [ "$a" = yes ] || { echo "Отменено"; exit 1; }
fi
$dc stop api
if [ -f "$src" ]; then feed="cat $src"; else feed="$dc exec -T backup cat $src"; fi
$dc exec -T backup psql -h postgres -U mebel -v ON_ERROR_STOP=1 mebel -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
if $feed | gunzip -c | $dc exec -T backup psql -h postgres -U mebel -v ON_ERROR_STOP=1 -q mebel; then
  $dc start api
  echo "Готово: база восстановлена, api запущен"
else
  echo "Ошибка восстановления: api остановлен, проверьте дамп и повторите" >&2
  exit 1
fi
