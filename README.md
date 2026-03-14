# Pi Print Automation 🖨️

A self-hosted print service for university campuses. Students authenticate with their college Google account, upload a PDF, pay via Razorpay, and the document prints on a USB printer connected to a Raspberry Pi Zero 2W — all through a Cloudflare Tunnel with no port forwarding.

## Features

- **One-click Google Sign-In** with college account (OTP fallback available)
- **PDF upload** with print options — page range, paper size, copies, duplex, color
- **Razorpay payments** — UPI, cards, wallets. Pre-payment printer check blocks payment if printer is offline
- **Real-time printer status** via Socket.IO (lazy — only connects when needed)
- **Identity page** — appended to every print with student name, email, job ID, QR code
- **Two print modes** — "Print Now" and "Collect Later" (both print immediately, label differs)
- **Admin dashboard** — system health, job queue management, email policy editor
- **Dynamic access control** — regex-based email policies, editable via admin UI
- **Auto-recovery** — paid jobs survive Pi reboots and resume printing

## Quick Start (Development)

### Prerequisites

- Node.js 20+ ([.nvmrc](.nvmrc) included)
- pnpm (`npm install -g pnpm`)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

```bash
cp pi-server/.env.example pi-server/.env
# Edit .env with your values (Razorpay keys, SMTP, Google Client ID)
```

### 3. Create admin user

```bash
cd pi-server
pnpm seed:admin admin YourPassword123 "Admin Name"
```

### 4. Start backend

```bash
cd pi-server
pnpm dev
# Server starts at http://localhost:3000
```

### 5. Start frontend

```bash
cd frontend
pnpm dev
# Frontend starts at http://localhost:5173
```

### 6. Access

- **Print Service**: http://localhost:5173
- **Admin Dashboard**: http://localhost:5173/admin/login
- **Health Check**: http://localhost:3000/health

## Environment Variables

### Backend (`pi-server/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `DB_PATH` | `./data/print.db` | SQLite database path |
| `RAZORPAY_KEY_ID` | — | Razorpay test/live key ID |
| `RAZORPAY_SECRET` | — | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | — | Razorpay webhook secret |
| `SMTP_HOST` | — | SMTP server (empty = log OTP to console) |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `JWT_SECRET` | `dev-secret...` | **Change in production** |
| `JWT_EXPIRY` | `30d` | Session duration |
| `GOOGLE_CLIENT_ID` | — | Google OAuth Client ID |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `PRICE_BW_PER_PAGE` | `200` | B&W price in paise (₹2) |
| `PRICE_COLOR_PER_PAGE` | `500` | Color price in paise (₹5) |
| `DUPLEX_DISCOUNT` | `0.8` | 20% discount for duplex |

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL (empty = same origin) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth Client ID |

## Pi Deployment

See [deploy/pi/setup.sh](deploy/pi/setup.sh) for the full setup script. Summary:

```bash
# On the Pi:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs cups ghostscript poppler-utils
npm install -g pnpm

# Clone, install, build
git clone <repo> && cd xy
pnpm install
cd pi-server && pnpm build

# Create admin and start
pnpm seed:admin admin SecurePass123
sudo systemctl enable print-server cloudflared
sudo systemctl start print-server cloudflared
```

## Project Structure

```
xy/
├── pi-server/          # Backend — Node.js / TypeScript / Express / SQLite
├── frontend/           # Frontend — React / Vite / TailwindCSS
├── deploy/pi/          # Pi setup scripts + systemd services
├── docs/               # Architecture, API spec, ADRs, code overview
├── pnpm-workspace.yaml # Monorepo config
└── pr.md               # Original requirements
```

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/architecture.md](docs/architecture.md) | System diagram, data flows, component responsibilities |
| [docs/api-spec.md](docs/api-spec.md) | Full REST + WebSocket API reference |
| [docs/decisions.md](docs/decisions.md) | 14 Architecture Decision Records (ADRs) |
| [docs/code-overview.md](docs/code-overview.md) | High-level code walkthrough — every file explained |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, TypeScript, Express, Socket.IO |
| **Database** | SQLite via sql.js (WASM, no native build) |
| **Frontend** | React 18, Vite, TailwindCSS |
| **Auth** | Google Sign-In, JWT (jsonwebtoken), bcrypt |
| **Payment** | Razorpay (webhook-first verification) |
| **PDF** | pdf-lib, qrcode |
| **Printing** | CUPS (via CLI: lp, lpstat, lpoptions) |
| **Transport** | Cloudflare Tunnel |
| **Logging** | Pino (structured JSON logs) |
| **Validation** | Zod |
| **Testing** | Vitest |

## Scripts

### Backend (`pi-server/`)
```bash
pnpm dev            # Start dev server (tsx watch)
pnpm build          # TypeScript compile
pnpm start          # Run compiled JS
pnpm test           # Run tests (vitest)
pnpm seed:admin     # Create admin user
```

### Frontend (`frontend/`)
```bash
pnpm dev            # Vite dev server
pnpm build          # Production build
pnpm preview        # Preview production build
```

## License

Private — University campus use.
