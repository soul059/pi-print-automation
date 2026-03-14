#!/bin/bash
# Clean up uploaded files older than 24 hours
# Add to crontab: 0 * * * * /opt/print-server/deploy/pi/cleanup.sh

UPLOAD_DIR="/opt/print-server/pi-server/uploads"
RETENTION_HOURS=${1:-24}

find "$UPLOAD_DIR" -type f -name "*.pdf" -mmin +$((RETENTION_HOURS * 60)) -delete
find "$UPLOAD_DIR" -type f -name "*_print.pdf" -mmin +$((RETENTION_HOURS * 60)) -delete

echo "Cleanup completed: removed files older than ${RETENTION_HOURS} hours"
