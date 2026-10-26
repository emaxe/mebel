#!/bin/sh
# Ежесуточный дамп базы; хранятся последние 14 дней. Запускается контейнером backup.
set -eu
mkdir -p /backups
while :; do
  f="/backups/mebel-$(date +%F).sql.gz"
  if pg_dump -h postgres -U mebel mebel | gzip > "$f.tmp"; then mv "$f.tmp" "$f"; else rm -f "$f.tmp"; echo "pg_dump failed" >&2; fi
  find /backups -name 'mebel-*.sql.gz' -mtime +14 -delete
  sleep 86400
done
