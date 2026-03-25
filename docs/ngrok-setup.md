# Ngrok Setup Guide for Pi Print Server

This guide covers setting up ngrok to expose your Pi print server to the internet for development/testing.

## Installation

```bash
# Download ngrok for ARM (Pi)
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Or download directly
curl -LO https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
tar -xzf ngrok-v3-stable-linux-arm64.tgz
sudo mv ngrok /usr/local/bin/
```

## Authentication

```bash
# Sign up at https://ngrok.com and get your authtoken
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

## Running Ngrok

### Basic Usage

```bash
# Expose port 3000 (print server)
ngrok http 3000
```

### With Custom Domain (Paid Plan)

```bash
ngrok http 3000 --domain=print.yourdomain.ngrok.io
```

### Skip Browser Warning (Important for API calls!)

Ngrok free tier shows a browser warning page that breaks API calls. Use:

```bash
# Option 1: Add header to skip warning
ngrok http 3000 --request-header-add "ngrok-skip-browser-warning:true"

# Option 2: Use configuration file (recommended)
```

## Configuration File

Create `~/.ngrok2/ngrok.yml`:

```yaml
version: "2"
authtoken: YOUR_AUTH_TOKEN
tunnels:
  print-server:
    proto: http
    addr: 3000
    inspect: false
    request_header:
      add:
        - "ngrok-skip-browser-warning:true"
```

Start with config:

```bash
ngrok start print-server
```

## Run as Systemd Service

Create `/etc/systemd/system/ngrok.service`:

```ini
[Unit]
Description=Ngrok Tunnel
After=network.target

[Service]
Type=simple
User=pi
ExecStart=/usr/local/bin/ngrok start print-server --config /home/pi/.ngrok2/ngrok.yml
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ngrok
sudo systemctl start ngrok

# Check status
sudo systemctl status ngrok

# View logs
sudo journalctl -u ngrok -f
```

## Getting the Public URL

```bash
# Via API (while ngrok is running)
curl -s http://localhost:4040/api/tunnels | jq -r '.tunnels[0].public_url'

# Or check the ngrok dashboard
# https://dashboard.ngrok.com/endpoints/status
```

## Frontend Configuration

Update `frontend/.env`:

```bash
# Use the ngrok URL
VITE_API_URL=https://your-subdomain.ngrok-free.dev
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

## Troubleshooting

### "Too Many Connections" Error

Free tier has limited connections. Upgrade or use Cloudflare Tunnel instead.

### CORS Errors

Our frontend already includes `ngrok-skip-browser-warning` header in all API calls. If you still see CORS errors:

1. Verify backend CORS_ORIGIN matches your frontend URL:
   ```bash
   # In pi-server/.env
   CORS_ORIGIN=http://localhost:5173
   ```

2. Restart the print server after changing CORS_ORIGIN.

### Tunnel Disconnects

Add reconnect logic to the service file:

```ini
Restart=always
RestartSec=5
```

### Webhook URLs

For Razorpay webhooks, use the ngrok URL:
- `https://your-subdomain.ngrok-free.dev/api/payments/webhook`

**Note:** Free ngrok URLs change on restart. Update webhook URL in Razorpay dashboard each time.

---

## Switching to Cloudflare Tunnel

**Recommended for production.** See `docs/pi-setup-guide.md` for Cloudflare Tunnel setup.

### Does Code Need to Change?

**No!** The code is tunnel-agnostic. You only need to:

1. Update `frontend/.env`:
   ```bash
   VITE_API_URL=https://print.yourdomain.com
   ```

2. Update `pi-server/.env`:
   ```bash
   CORS_ORIGIN=https://your-frontend-domain.com
   ```

3. Update Razorpay webhook URL in dashboard.

The `ngrok-skip-browser-warning` header is harmless with Cloudflare (just ignored).

---

## Ngrok vs Cloudflare Tunnel Comparison

| Feature | Ngrok Free | Ngrok Paid | Cloudflare Tunnel |
|---------|------------|------------|-------------------|
| **Cost** | Free | $8/mo+ | Free |
| **Custom domain** | ❌ Random subdomain | ✅ | ✅ |
| **Stable URL** | ❌ Changes on restart | ✅ | ✅ |
| **Browser warning** | ⚠️ Yes (needs header) | ❌ None | ❌ None |
| **Bandwidth** | Limited | Higher | Unlimited |
| **Setup complexity** | Easy | Easy | Medium |
| **Webhooks** | ⚠️ URL changes | ✅ Stable | ✅ Stable |

**Recommendation:** 
- **Development/Testing:** Ngrok free is fine
- **Production:** Use Cloudflare Tunnel (free, stable URLs, no warnings)
