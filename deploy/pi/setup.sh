#!/bin/bash
# Pi Zero 2W Setup Script — Print Automation Server
# Run as root: sudo bash setup.sh

set -euo pipefail

echo "=== Pi Print Server Setup ==="

# Update system
echo "[1/7] Updating system packages..."
apt-get update && apt-get upgrade -y

# Install CUPS and printer utilities
echo "[2/7] Installing CUPS and printer utilities..."
apt-get install -y cups cups-client cups-bsd ghostscript poppler-utils
usermod -aG lpadmin pi
# Enable CUPS to accept network requests for setup
cupsctl --remote-admin --share-printers
systemctl enable cups
systemctl start cups

# Install Node.js LTS (v20)
echo "[3/7] Installing Node.js 20 LTS..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# Install pnpm
echo "[4/7] Installing pnpm..."
if ! command -v pnpm &> /dev/null; then
    npm install -g pnpm
fi

# Install cloudflared
echo "[5/7] Installing cloudflared..."
if ! command -v cloudflared &> /dev/null; then
    ARCH=$(dpkg --print-architecture)
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -o /tmp/cloudflared.deb
    dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
fi

# Create app directory
echo "[6/7] Setting up application directory..."
APP_DIR="/opt/print-server"
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/uploads"

# Copy systemd services
echo "[7/7] Installing systemd services..."
cp "$(dirname "$0")/print-server.service" /etc/systemd/system/
cp "$(dirname "$0")/cloudflared.service" /etc/systemd/system/

systemctl daemon-reload
systemctl enable print-server
# Note: cloudflared needs to be configured first before enabling

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy your project to $APP_DIR"
echo "  2. cd $APP_DIR/pi-server && pnpm install && pnpm build"
echo "  3. Copy .env.example to .env and configure"
echo "  4. Configure cloudflared: cloudflared tunnel login && cloudflared tunnel create printer-server"
echo "  5. Edit /etc/systemd/system/cloudflared.service with your tunnel ID"
echo "  6. sudo systemctl start print-server"
echo "  7. sudo systemctl enable --now cloudflared"
echo ""
echo "CUPS admin UI: https://$(hostname):631"
