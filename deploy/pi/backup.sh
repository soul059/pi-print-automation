#!/bin/bash
# SQLite backup script — run via cron
# Add to crontab: 0 */6 * * * /opt/print-server/deploy/pi/backup.sh

set -euo pipefail

BACKUP_DIR="/opt/print-server/backups"
DB_PATH="/opt/print-server/pi-server/data/print.db"
MAX_BACKUPS=10

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/print_${TIMESTAMP}.db"

# sql.js writes the DB file atomically via writeFileSync, so a simple copy is safe
cp "$DB_PATH" "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Keep only latest N backups
ls -1t "$BACKUP_DIR"/print_*.db.gz | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm

echo "Backup completed: ${BACKUP_FILE}.gz"
