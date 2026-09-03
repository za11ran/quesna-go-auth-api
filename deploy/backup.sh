#!/usr/bin/env bash
# باك أب يومي لقاعدة البيانات.
# ثبّته في الكرون:  sudo crontab -e
#   0 3 * * * /opt/quesna-go-auth-api/deploy/backup.sh >> /var/log/quesnago-backup.log 2>&1
set -euo pipefail
DB_NAME="${DB_NAME:-quesnago}"
OUT_DIR="${OUT_DIR:-/var/backups/quesnago}"
KEEP_DAYS="${KEEP_DAYS:-14}"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/${DB_NAME}-${STAMP}.dump"

sudo -u postgres pg_dump -Fc "$DB_NAME" > "$FILE"
find "$OUT_DIR" -name "${DB_NAME}-*.dump" -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is)  backup -> $FILE  ($(du -h "$FILE" | cut -f1))"

# استرجاع لاحقًا:
#   sudo -u postgres pg_restore -c -d quesnago /var/backups/quesnago/quesnago-XXXX.dump
