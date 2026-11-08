#!/usr/bin/env bash
# Restores one database from a backup made by backup.sh (docs/runbook/backup.md).
#   ./restore.sh /var/backups/team-ops/20261108T041500Z-team_ops.sql.gz
# The API, worker, scheduler and relay are stopped during the restore and started again after it.
set -euo pipefail
cd "$(dirname "$0")"

file=${1:?give the backup file (…-team_ops.sql.gz or …-notify_relay.sql.gz)}
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }
case "$file" in
  *-team_ops.sql.gz) db=team_ops ;;
  *-notify_relay.sql.gz) db=notify_relay ;;
  *) echo "The file name must end in -team_ops.sql.gz or -notify_relay.sql.gz" >&2; exit 1 ;;
esac

compose() { docker compose -f compose.prod.yaml "$@"; }

read -r -p "Replace the ${db} database with ${file}? Type yes: " answer
[ "$answer" = "yes" ] || { echo "Stopped."; exit 1; }

compose stop api api-worker api-scheduler notify-relay web
# The dump has CREATE DATABASE and USE, so it rebuilds the whole schema
compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$0\`"' "$db"
gunzip -c "$file" | compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
compose up -d --wait
echo "Restored ${db} from ${file}."
