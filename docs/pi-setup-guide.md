# Pi Zero 2W Setup Guide — Print Automation Server

Complete guide to setting up the print automation server on a Raspberry Pi Zero 2W.

## Prerequisites

- Raspberry Pi Zero 2W with power supply
- MicroSD card (16GB+ recommended)
- USB OTG adapter (for connecting printer)
- USB printer
- WiFi network access
- Computer for initial setup
- Cloudflare account (free tier works)

---

## Part 1: Raspberry Pi OS Installation

### Step 1: Download and Flash OS

1. Download **Raspberry Pi Imager** from https://www.raspberrypi.com/software/
2. Insert microSD card into your computer
3. Open Raspberry Pi Imager:
   - **OS:** Raspberry Pi OS Lite (64-bit) — no desktop needed
   - **Storage:** Select your microSD card
   - **Settings** (gear icon):
     - Set hostname: `print-server`
     - Enable SSH: Yes, with password or SSH key
     - Set username/password: `pi` / your-secure-password
     - Configure WiFi: Enter your SSID and password
     - Set locale: Your timezone
4. Click **Write** and wait for completion

### Step 2: First Boot

1. Insert microSD into Pi Zero 2W
2. Connect power
3. Wait 2-3 minutes for first boot
4. Find Pi's IP address:
   ```bash
   # From another computer on same network
   ping print-server.local
   # Or check your router's DHCP clients list
   ```

### Step 3: SSH into Pi

```bash
ssh pi@print-server.local
# Or use IP address: ssh pi@192.168.x.x
```

---

## Part 2: Run Setup Script

### Step 1: Copy Project to Pi

**Option A: Clone from Git (Recommended)**
```bash
# On Pi
cd /opt
sudo git clone https://github.com/your-repo/xy.git print-server
sudo chown -R pi:pi /opt/print-server
```

**Option B: Copy via SCP**
```bash
# From your development machine
scp -r ./pi-server ./frontend ./deploy pi@print-server.local:/tmp/
ssh pi@print-server.local "sudo mv /tmp/pi-server /tmp/frontend /tmp/deploy /opt/print-server/"
```

### Step 2: Run Automated Setup

```bash
cd /opt/print-server/deploy/pi
sudo bash setup.sh
```

This installs:
- System updates
- CUPS (print server)
- Ghostscript & Poppler (PDF utilities)
- Node.js 20 LTS
- pnpm
- cloudflared (Cloudflare Tunnel)
- Systemd services

---

## Part 3: Configure Printer

### Step 1: Connect USB Printer

1. Connect printer to Pi via USB OTG adapter
2. Power on printer
3. Verify detection:
   ```bash
   lsusb
   # Should show your printer
   
   lpstat -p -d
   # Shows CUPS detected printers
   ```

### Step 2: Configure via CUPS Web UI

1. Access CUPS admin: `https://print-server.local:631`
2. Accept security warning (self-signed certificate)
3. Go to **Administration** → **Add Printer**
4. Login with pi credentials
5. Select your USB printer
6. Set name (e.g., `office-printer`), note this name
7. Choose appropriate driver (PPD)
8. Set as default if desired

### Step 3: Test Print

```bash
echo "Test print from Pi" | lp -d office-printer
```

---

## Part 4: Configure Backend

### Step 1: Install Dependencies

```bash
cd /opt/print-server/pi-server
pnpm install
pnpm build
```

### Step 2: Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required changes for production:**

```bash
# Server
NODE_ENV=production
PORT=3000

# Database (auto-created)
DB_PATH=/opt/print-server/pi-server/data/print.db

# Uploads
UPLOAD_DIR=/opt/print-server/pi-server/uploads
MAX_FILE_SIZE=10485760

# Razorpay (LIVE keys for production)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_SECRET=your_live_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# SMTP (required for OTP emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com

# Security (CHANGE THESE!)
JWT_SECRET=generate-a-long-random-string-here
ADMIN_TOKEN=generate-another-random-string

# Printer
DEFAULT_PRINTER=office-printer

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# CORS - your Cloudflare Tunnel domain
CORS_ORIGIN=https://print.yourdomain.com
```

**Generate secure secrets:**
```bash
# Generate random strings
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 24  # For ADMIN_TOKEN
```

### Step 3: Test Backend

```bash
cd /opt/print-server/pi-server
node dist/index.js
# Should see "Server running on port 3000"
# Ctrl+C to stop
```

---

## Part 5: Configure Frontend

### Step 1: Set Environment

```bash
cd /opt/print-server/frontend
cp .env.example .env
nano .env
```

```bash
# Leave empty for production (same-origin)
VITE_API_URL=

# Google OAuth (same as backend)
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Razorpay public key
VITE_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
```

### Step 2: Build Frontend

```bash
cd /opt/print-server/frontend
pnpm install
pnpm build
```

### Step 3: Configure Backend to Serve Frontend

The backend already serves the frontend from `../frontend/dist`. Verify path in backend config or symlink:

```bash
# If needed, create symlink
ln -s /opt/print-server/frontend/dist /opt/print-server/pi-server/frontend-dist
```

---

## Part 6: Configure Cloudflare Tunnel

### Step 1: Login to Cloudflare

```bash
cloudflared tunnel login
# Opens browser - login and authorize
```

### Step 2: Create Tunnel

```bash
cloudflared tunnel create print-server
# Note the tunnel ID (UUID format)
```

### Step 3: Configure Tunnel

```bash
mkdir -p ~/.cloudflared
nano ~/.cloudflared/config.yml
```

```yaml
tunnel: YOUR-TUNNEL-ID
credentials-file: /home/pi/.cloudflared/YOUR-TUNNEL-ID.json

ingress:
  - hostname: print.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### Step 4: Add DNS Record

```bash
cloudflared tunnel route dns print-server print.yourdomain.com
```

### Step 5: Update Systemd Service

```bash
sudo nano /etc/systemd/system/cloudflared.service
```

Update the `ExecStart` line:
```ini
ExecStart=/usr/bin/cloudflared tunnel --config /home/pi/.cloudflared/config.yml run
```

---

## Part 7: Configure Razorpay Webhooks

### Step 1: Get Webhook URL

Your webhook URL will be: `https://print.yourdomain.com/api/payments/webhook`

### Step 2: Configure in Razorpay Dashboard

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add new webhook:
   - **URL:** `https://print.yourdomain.com/api/payments/webhook`
   - **Secret:** Generate one and save to `.env` as `RAZORPAY_WEBHOOK_SECRET`
   - **Events:** Select:
     - `payment.captured`
     - `payment.failed`
     - `refund.created`
3. Save and activate

---

## Part 8: Start Services

### Step 1: Start Print Server

```bash
sudo systemctl start print-server
sudo systemctl status print-server
# Should show "active (running)"

# View logs
sudo journalctl -u print-server -f
```

### Step 2: Start Cloudflare Tunnel

```bash
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

### Step 3: Verify

Open `https://print.yourdomain.com` in browser — should see login page!

---

## Part 9: Configure Google OAuth

### Step 1: Create Google Cloud Project

1. Go to https://console.cloud.google.com
2. Create new project: "Print Service"
3. Go to **APIs & Services** → **OAuth consent screen**
   - Choose External
   - Fill app name, email, logo
   - Add scope: `email`, `profile`
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: Web application
   - Authorized JavaScript origins:
     - `https://print.yourdomain.com`
     - `http://localhost:5173` (for dev)
   - Authorized redirect URIs:
     - `https://print.yourdomain.com`
5. Copy **Client ID** to both:
   - `pi-server/.env` → `GOOGLE_CLIENT_ID`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID`

### Step 2: Restart Services

```bash
sudo systemctl restart print-server
```

---

## Part 10: Final Checklist

### Services Running
```bash
sudo systemctl status print-server   # Active
sudo systemctl status cloudflared    # Active
sudo systemctl status cups           # Active
```

### Printer Working
```bash
lpstat -p                            # Printer listed
echo "Test" | lp                     # Test print succeeds
```

### API Responding
```bash
curl http://localhost:3000/api/printer/status
# Should return JSON with printer info
```

### External Access
```bash
curl https://print.yourdomain.com/api/printer/status
# Should work through tunnel
```

### Frontend Loading
- Open `https://print.yourdomain.com`
- Google login works
- Printer status shows online

---

## Maintenance

### View Logs

```bash
# Print server logs
sudo journalctl -u print-server -f

# Cloudflare tunnel logs
sudo journalctl -u cloudflared -f

# CUPS logs
sudo tail -f /var/log/cups/error_log
```

### Restart Services

```bash
sudo systemctl restart print-server
sudo systemctl restart cloudflared
```

### Update Code

```bash
cd /opt/print-server
git pull
cd pi-server && pnpm install && pnpm build
cd ../frontend && pnpm install && pnpm build
sudo systemctl restart print-server
```

### Backup Database

```bash
# Manual backup
cp /opt/print-server/pi-server/data/print.db ~/backups/print-$(date +%Y%m%d).db

# Automated backup (already configured via cron)
cat /etc/cron.d/print-backup
```

### Cleanup Old Files

```bash
# Run manually
bash /opt/print-server/deploy/pi/cleanup.sh

# Or it runs automatically via cron
```

---

## Troubleshooting

### Printer Not Detected

```bash
# Check USB connection
lsusb

# Restart CUPS
sudo systemctl restart cups

# Check CUPS logs
sudo tail -f /var/log/cups/error_log
```

### Tunnel Not Connecting

```bash
# Test tunnel manually
cloudflared tunnel --config ~/.cloudflared/config.yml run

# Check credentials file exists
ls -la ~/.cloudflared/
```

### Backend Crashes

```bash
# Check logs for error
sudo journalctl -u print-server -n 50

# Common issues:
# - Missing .env values
# - Wrong file permissions
# - Port already in use
```

### Payment Webhook Not Working

1. Check Razorpay dashboard for webhook delivery status
2. Verify webhook secret matches
3. Check CORS_ORIGIN matches your domain exactly
4. Test with Razorpay test mode first

---

## Security Hardening (Production)

### 1. Change Default Credentials
- Change `pi` user password
- Use SSH keys instead of password

### 2. Firewall
```bash
sudo apt install ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
# Don't open 3000 - access via tunnel only!
sudo ufw enable
```

### 3. Automatic Updates
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4. Disable Password SSH (after setting up keys)
```bash
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart sshd
```

---

## Environment Variables Reference

### Backend (`pi-server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `DB_PATH` | No | SQLite database path |
| `UPLOAD_DIR` | No | Upload directory path |
| `MAX_FILE_SIZE` | No | Max upload size in bytes |
| `RAZORPAY_KEY_ID` | Yes | Razorpay API key |
| `RAZORPAY_SECRET` | Yes | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Webhook signature secret |
| `SMTP_HOST` | Prod | SMTP server |
| `SMTP_PORT` | Prod | SMTP port |
| `SMTP_USER` | Prod | SMTP username |
| `SMTP_PASS` | Prod | SMTP password |
| `SMTP_FROM` | Prod | From email address |
| `ADMIN_TOKEN` | Yes | Admin API auth token |
| `DEFAULT_PRINTER` | No | CUPS printer name |
| `PRICE_BW_PER_PAGE` | No | B&W price in paise |
| `PRICE_COLOR_PER_PAGE` | No | Color price in paise |
| `DUPLEX_DISCOUNT` | No | Duplex multiplier (0.8 = 20% off) |
| `JWT_SECRET` | Yes | JWT signing secret |
| `JWT_EXPIRY` | No | JWT expiry (default: 30d) |
| `CORS_ORIGIN` | Yes | Frontend URL for CORS |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `OTP_EXPIRY_MINUTES` | No | OTP validity (default: 5) |
| `FILE_RETENTION_HOURS` | No | Keep uploads for N hours |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | API URL (empty = same origin) |
| `VITE_GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |

> Note: Razorpay key ID is provided by the backend API during payment flow, no frontend config needed.

---

## Quick Start Summary

```bash
# 1. Flash Raspberry Pi OS Lite to SD card with SSH/WiFi configured
# 2. SSH into Pi
ssh pi@print-server.local

# 3. Clone project
cd /opt && sudo git clone YOUR_REPO print-server && sudo chown -R pi:pi print-server

# 4. Run setup
cd /opt/print-server/deploy/pi && sudo bash setup.sh

# 5. Configure printer via CUPS UI (https://print-server.local:631)

# 6. Configure backend
cd /opt/print-server/pi-server
cp .env.example .env && nano .env  # Fill all values
pnpm install && pnpm build

# 7. Configure frontend
cd /opt/print-server/frontend
cp .env.example .env && nano .env  # Fill all values
pnpm install && pnpm build

# 8. Setup Cloudflare Tunnel
cloudflared tunnel login
cloudflared tunnel create print-server
cloudflared tunnel route dns print-server print.yourdomain.com
nano ~/.cloudflared/config.yml  # Configure

# 9. Start services
sudo systemctl start print-server
sudo systemctl enable --now cloudflared

# 10. Test: Open https://print.yourdomain.com
```

Done! 🎉
