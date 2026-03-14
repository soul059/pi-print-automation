# Code Overview — Pi Print Automation

A high-level walkthrough of every module in the codebase. Read this to understand what each file does and how they connect.

---

## Project Structure

```
xy/
├── pi-server/              # Backend (Node.js / TypeScript / Express)
│   ├── src/
│   │   ├── server.ts           # Entry point — boots DB, runs migrations, starts HTTP
│   │   ├── app.ts              # Express + Socket.IO setup, route mounting
│   │   ├── config/
│   │   │   ├── env.ts          # All environment variables with defaults
│   │   │   └── logger.ts       # Pino structured logger
│   │   ├── db/
│   │   │   ├── connection.ts   # sql.js wrapper (WASM SQLite) with persistence
│   │   │   └── migrations/
│   │   │       └── index.ts    # Schema definitions + seed data
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT auth (user + admin), token generation
│   │   │   └── errorHandler.ts # Global Express error handler
│   │   ├── models/
│   │   │   ├── job.ts          # Job CRUD, state machine, query helpers
│   │   │   └── printer.ts      # Printer profile model (capability cache)
│   │   ├── routes/
│   │   │   ├── auth.ts         # Google Sign-In + OTP endpoints
│   │   │   ├── upload.ts       # PDF upload with multer + validation
│   │   │   ├── payment.ts      # Razorpay order, webhook, client verify
│   │   │   ├── printer.ts      # GET /printer/status
│   │   │   ├── jobs.ts         # User job list + detail
│   │   │   └── admin.ts        # Admin login, health, job mgmt, policies
│   │   ├── services/
│   │   │   ├── cups.ts         # CUPS CLI adapter (lp, lpstat, lpoptions)
│   │   │   ├── pdf.ts          # PDF validation + identity page generation
│   │   │   ├── pricing.ts      # Price calculator (pages × rate × copies)
│   │   │   ├── queue.ts        # In-process FIFO job queue with retries
│   │   │   ├── email.ts        # OTP generation + SMTP sending
│   │   │   ├── policy.ts       # Email policy CRUD + validation engine
│   │   │   └── printerStatus.ts # Socket.IO room-based lazy CUPS polling
│   │   └── types/
│   │       └── sql.js.d.ts     # Type declarations for sql.js
│   ├── scripts/
│   │   └── seed-admin.ts       # CLI: create admin user with bcrypt password
│   ├── tests/
│   │   ├── pricing.test.ts     # 12 tests — page range parsing, price calc
│   │   ├── job.test.ts         # 2 tests — state transitions
│   │   └── email.test.ts       # 6 tests — policy validation
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── frontend/               # Frontend (React / Vite / TailwindCSS)
│   ├── src/
│   │   ├── main.tsx            # React root + GoogleOAuthProvider + BrowserRouter
│   │   ├── App.tsx             # Route definitions (user + admin)
│   │   ├── index.css           # Tailwind imports + custom styles
│   │   ├── vite-env.d.ts       # Vite environment type declarations
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx       # Google Sign-In + OTP fallback
│   │   │   ├── UploadPage.tsx      # File upload + print options form
│   │   │   ├── PaymentPage.tsx     # Order summary + Razorpay checkout
│   │   │   ├── StatusPage.tsx      # Single job status tracker
│   │   │   ├── JobsPage.tsx        # User's job history list
│   │   │   └── admin/
│   │   │       ├── AdminLoginPage.tsx      # Admin username/password login
│   │   │       └── AdminDashboardPage.tsx  # Tabs: Overview, Jobs, Policies
│   │   ├── components/
│   │   │   ├── Layout.tsx              # Header + nav + footer wrapper
│   │   │   └── PrinterStatusBadge.tsx  # Green/yellow/red status indicator
│   │   ├── hooks/
│   │   │   ├── useAuth.tsx         # User auth context (token, email, name)
│   │   │   ├── useAdmin.tsx        # Admin auth context (sessionStorage)
│   │   │   └── usePrinterStatus.ts # Lazy Socket.IO + REST fallback
│   │   └── services/
│   │       └── api.ts              # All API calls (auth, upload, payment, admin)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── deploy/pi/              # Pi deployment scripts
│   ├── setup.sh                # Full Pi setup (Node, CUPS, cloudflared)
│   ├── print-server.service    # systemd service for the backend
│   ├── cloudflared.service     # systemd service for Cloudflare Tunnel
│   ├── config-template.yml     # Cloudflare Tunnel config template
│   ├── backup.sh               # SQLite backup script
│   └── cleanup.sh              # Old uploads cleanup script
│
├── docs/                   # Documentation
│   ├── architecture.md         # System diagram + data flows
│   ├── api-spec.md             # REST + WebSocket API reference
│   ├── decisions.md            # Architecture Decision Records (ADRs)
│   └── code-overview.md        # This file
│
├── package.json            # Root workspace config
├── pnpm-workspace.yaml     # pnpm workspace definition
├── pnpm-lock.yaml
├── .nvmrc                  # Node 20
├── .gitignore
└── pr.md                   # Original requirements document
```

---

## Backend Deep Dive

### Entry Point: `server.ts`

The main boot sequence (async):
1. Creates `uploads/` and `data/` directories if missing.
2. Calls `initDb()` — loads sql.js WASM binary, reads existing `print.db` from disk (or creates empty DB).
3. Runs `runMigrations()` — applies any pending schema changes.
4. Calls `startJobRecovery()` — finds any jobs stuck in `paid` or `printing` status from a previous crash and re-enqueues them.
5. Starts HTTP server on `PORT` (default 3000).
6. Registers `SIGINT`/`SIGTERM` handlers for graceful shutdown (closes DB, stops server).

### App Setup: `app.ts`

Creates the Express app + HTTP server + Socket.IO server:
- Applies `helmet` (security headers), `cors`, and `express.json()` middleware.
- Mounts all API routers under `/api/*`.
- Sets up global error handler.
- Calls `setupPrinterStatusBroadcast(io)` — registers Socket.IO connection handlers.

### Database: `db/connection.ts`

Wraps sql.js (WASM SQLite) with a synchronous-looking API via `DbWrapper`:
- `initDb()` — async, loads WASM, reads DB file from disk if it exists.
- `getDb()` — sync, returns the wrapper. Throws if called before init.
- `saveDb()` — exports DB from memory and writes to disk. Called after every write operation.
- `closeDb()` — saves and nullifies the DB reference.

The wrapper provides `.prepare()`, `.run()`, `.exec()` methods that match the better-sqlite3 API, making migration seamless.

### Migrations: `db/migrations/index.ts`

Runs on every boot. Tracks applied migrations in a `migrations` table. Each migration is an object with a `name` and an array of SQL `statements` (sql.js requires individual statements, not multi-statement strings).

**Tables created:**
- `jobs` — Print jobs with all options, status, timestamps.
- `payments` — Razorpay order/payment tracking with webhook verification flag.
- `otps` — One-time passwords (email, code, expiry).
- `email_policies` — Allowed email patterns (domain, regex, department key).
- `printer_profiles` — Cached printer capabilities.
- `admins` — Admin users with bcrypt password hashes.

### Auth: `middleware/auth.ts`

Two auth systems:
1. **User auth** — `generateToken(email, name)` creates a 30-day JWT. `requireAuth` middleware extracts and verifies the token from `Authorization: Bearer <token>`.
2. **Admin auth** — `generateAdminToken(id, username, role)` creates a 24h JWT. `requireAdmin` middleware accepts either admin JWT or legacy `x-admin-token` header.

### Routes

| File | Endpoints | Purpose |
|------|-----------|---------|
| `auth.ts` | `POST /google`, `POST /validate-email`, `POST /verify-otp` | Google Sign-In + OTP auth |
| `upload.ts` | `POST /upload` | PDF upload with multer, validation, job creation, price calculation |
| `payment.ts` | `POST /create`, `POST /verify`, `POST /webhook` | Razorpay order creation, client verify, webhook handler |
| `printer.ts` | `GET /status` | Current printer status via CUPS |
| `jobs.ts` | `GET /`, `GET /:jobId` | User's own jobs |
| `admin.ts` | `POST /login`, `GET /health`, `GET /jobs`, `POST /.../retry`, `POST /.../cancel`, CRUD `/policies` | Admin dashboard API |

### Services

#### `cups.ts` — CUPS Adapter
Calls CUPS command-line tools via `child_process.exec`:
- `getPrinterStatus()` — runs `lpstat -p` to check if printer is online.
- `printFile(filePath, options)` — runs `lp` with page range, media size, sides, copies, color model.
- `cancelJob(cupsJobId)` — runs `cancel`.
- `getCapabilities(printerName)` — runs `lpoptions -l` to probe color/duplex/paper sizes.

On non-Linux systems (Windows/macOS dev), these gracefully return "offline/unknown" since CUPS commands don't exist.

#### `pdf.ts` — PDF Service
- `validatePdf(filePath)` — checks magic bytes (`%PDF-`), loads with pdf-lib to verify structure, returns page count.
- `getPageCount(filePath)` — quick page count.
- `appendIdentityPage(filePath, metadata)` — appends a trailing page to the PDF with:
  - Student name and email
  - Job ID and timestamp
  - Print mode (INSTANT / COLLECT LATER)
  - QR code encoding the job ID (scannable by staff)

Uses `pdf-lib` for PDF manipulation and `qrcode` for QR generation.

#### `pricing.ts` — Pricing Engine
- `calculatePrice({ totalPages, pageRange, color, duplex, copies })` — returns price breakdown.
- B&W: ₹2/page (200 paise), Color: ₹5/page (500 paise).
- Duplex: 20% discount (configurable via `DUPLEX_DISCOUNT` env var).
- All amounts in **paise** (multiply by copies at the end).
- `parsePageRange("1-5,8", totalPages)` — returns count of pages to print.

#### `queue.ts` — Job Queue
In-process FIFO queue:
- `enqueueJob(jobId)` — adds job to queue, processes sequentially.
- `processJob(job)` — appends identity page → submits to CUPS → updates status.
- Retry logic: on failure, retries up to 3 times with 5-second delay.
- `startJobRecovery()` — on boot, finds jobs stuck in `paid`/`printing` and re-enqueues them.
- `getQueueDepth()` and `getEstimatedWaitMinutes()` — for status display.

#### `printerStatus.ts` — Lazy Socket.IO Polling
Room-based subscription model:
- When a client emits `subscribe:printer-status`, it joins a Socket.IO room.
- Polling starts only when ≥1 client is subscribed.
- Polls CUPS every 5 seconds (configurable), emits `printer:status` only when status changes.
- Stops polling when the last client disconnects.

#### `policy.ts` — Email Policy Engine
- `validateEmail(email)` — splits into `localPart@domain`, checks against all active policies.
- Each policy has a `domain` (must match) and `pattern` (regex, tested against local part).
- Returns `{ valid, department, year, reason }`.
- CRUD functions: `getAllPolicies()`, `createPolicy()`, `updatePolicy()`, `deletePolicy()`.

#### `email.ts` — OTP Service
- `generateOtp()` — 6-digit random code.
- `sendOtp(email, otp)` — stores in DB with 5-min expiry, sends via SMTP (or logs to console in dev mode if SMTP not configured).
- `verifyOtp(email, otp)` — checks DB, marks as verified, deletes used OTPs.

---

## Frontend Deep Dive

### Entry: `main.tsx` → `App.tsx`

`main.tsx` wraps the app with:
- `GoogleOAuthProvider` — provides Google Sign-In context (needs `VITE_GOOGLE_CLIENT_ID`).
- `BrowserRouter` — React Router for client-side routing.
- `AuthProvider` / `AdminProvider` — nested context providers.

`App.tsx` defines routes:
- `/login` — LoginPage (public)
- `/` — UploadPage (requires user auth)
- `/payment/:jobId` — PaymentPage (requires user auth)
- `/status/:jobId` — StatusPage (requires user auth)
- `/jobs` — JobsPage (requires user auth)
- `/admin/login` — AdminLoginPage (public)
- `/admin` — AdminDashboardPage (requires admin auth)

### Pages

#### `LoginPage.tsx`
Three-state view:
1. **Main** — Google Sign-In button (primary) + "Sign in with Email OTP" link.
2. **OTP Email** — Name + email form → sends OTP.
3. **OTP Verify** — 6-digit code entry → verifies + logs in.

On success, stores JWT + user info in localStorage via `useAuth` hook.

#### `UploadPage.tsx`
1. Drag-and-drop or click-to-select PDF (max 10 MB, PDF only).
2. After file selected, shows print options: page range, paper size, copies, color, duplex, print mode.
3. Shows printer status badge (Socket.IO connects only now, not before).
4. Submit button disabled if printer is offline.
5. On submit, uploads to backend → redirects to `/payment/:jobId`.

#### `PaymentPage.tsx`
1. Fetches job details (file name, pages, price, options).
2. Shows order summary with price breakdown.
3. Loads Razorpay checkout SDK dynamically.
4. "Pay ₹X.XX" button → opens Razorpay popup → on success, verifies payment → redirects to `/status/:jobId`.

#### `StatusPage.tsx`
Polls job status and shows current state with appropriate icon/message.

#### `JobsPage.tsx`
Lists all jobs for the logged-in user with status badges.

#### `AdminLoginPage.tsx`
Simple username + password form → calls `POST /api/admin/login` → stores admin JWT in sessionStorage.

#### `AdminDashboardPage.tsx`
Three tabs:
- **Overview**: Printer status, job counts by status, system metrics (RAM, uptime, disk usage).
- **Jobs**: Filterable job list with retry/cancel actions.
- **Policies**: Email policy list with create/toggle/delete.

### Hooks

- `useAuth` — React context for user auth state. Persists to `localStorage`. Provides `login(token, email, name)` and `logout()`.
- `useAdmin` — React context for admin auth state. Persists to `sessionStorage` (cleared on tab close). Provides `login(token, username, displayName)` and `logout()`.
- `usePrinterStatus(enabled)` — Lazy Socket.IO hook. When `enabled=true`, connects socket + subscribes to `printer-status` room. When `enabled=false`, disconnects. Falls back to REST polling if WebSocket fails.

### API Service: `services/api.ts`

Single object with all API methods:
- Auth: `googleAuth()`, `validateEmail()`, `verifyOtp()`
- Upload: `uploadFile()`
- Payment: `createPayment()`, `verifyPayment()`
- Jobs: `getJob()`, `getJobs()`
- Printer: `getPrinterStatus()`
- Admin: `adminLogin()`, `adminGetHealth()`, `adminGetJobs()`, `adminRetryJob()`, `adminCancelJob()`, `adminGetPolicies()`, `adminCreatePolicy()`, `adminUpdatePolicy()`, `adminDeletePolicy()`

---

## Deploy Scripts

| File | Purpose |
|------|---------|
| `setup.sh` | Full Pi setup: installs Node 20, CUPS, Ghostscript, poppler, cloudflared. Enables systemd services. |
| `print-server.service` | systemd unit for the Node.js backend (auto-restart on crash). |
| `cloudflared.service` | systemd unit for Cloudflare Tunnel. |
| `config-template.yml` | Cloudflare Tunnel config template (hostname → localhost:3000). |
| `backup.sh` | Copies `print.db` to timestamped backup file. |
| `cleanup.sh` | Removes uploaded files older than 24h. |

---

## Testing

20 tests across 3 test files (run with `pnpm test` in `pi-server/`):

- **pricing.test.ts** (12 tests) — Page range parsing edge cases, price calculations for B&W/color/duplex/copies.
- **job.test.ts** (2 tests) — Job state machine transitions.
- **email.test.ts** (6 tests) — Email policy validation (accepts valid DDU emails, rejects non-matching emails, handles domain checking).

---

## Key Design Patterns

1. **Lazy Resource Loading** — Socket.IO connects only when needed; CUPS polling only when clients are watching.
2. **State Machine** — Jobs follow a deterministic state machine (`uploaded → paid → printing → completed`), preventing invalid transitions.
3. **Webhook-First Payment** — Razorpay webhook is the primary payment verification; client-side verify is fallback.
4. **Policy-Driven Access** — No hardcoded email rules. Admin can add/remove department regex patterns via UI without redeployment.
5. **Identity Page** — Every print gets a trailing page with student info + QR code for staff verification.
6. **Graceful Degradation** — CUPS adapter returns "offline" on non-Linux systems; Socket.IO falls back to REST polling; Google auth has OTP fallback.
