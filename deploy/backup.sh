#!/usr/bin/env bash
# Daily backup of both databases (ADR-0022). Keeps 7 days in /var/backups/team-ops.
# Run by cron as root (docs/runbook/backup.md):
#   15 4 * * * /opt/team-ops/deploy/backup.sh >> /var/log/team-ops-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
umask 077

dir=${BACKUP_DIR:-/var/backups/team-ops}
mkdir -p "$dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)

for db in team_ops notify_relay; do
  file="$dir/${stamp}-${db}.sql.gz"
  # One consistent snapshot without locking the tables (InnoDB)
  docker compose -f compose.prod.yaml exec -T mysql sh -c \
    'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --no-tablespaces --databases "$0"' "$db" \
    | gzip > "$file.part"
  mv "$file.part" "$file"
  echo "$(date -u +%FT%TZ) saved $file ($(du -h "$file" | cut -f1))"
done

find "$dir" -name '*.sql.gz' -mtime +6 -print -delete
