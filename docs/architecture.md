# Architecture — Pi Paid Print Automation

## System Diagram

```
┌─────────────────┐       HTTPS        ┌───────────────────┐
│                 │  (Cloudflare Tunnel)│                   │
│   Frontend      │◄──────────────────►│  Cloudflare Edge  │
│  (React/Vite)   │                    │                   │
│  Vercel/Netlify │                    └────────┬──────────┘
│                 │                             │
└────────┬────────┘                             │ Tunnel (outbound only)
         │                                      │
         │  Razorpay JS SDK                     │
         ▼                                      ▼
┌─────────────────┐                    ┌───────────────────┐       USB/IPP       ┌───────────┐
│                 │                    │                   │◄───────────────────►│           │
│   Razorpay      │───── webhook ────►│   Pi Zero 2W      │        CUPS          │  Printer  │
│   Gateway       │                    │   (Node.js/TS)    │                     │  (USB)    │
│                 │                    │                   │                     │           │
└─────────────────┘                    └────────┬──────────┘                     └───────────┘
                                                │
                                       ┌────────┴─────────┐
                                       │                   │
                                       ▼                   ▼
                              ┌───────────────┐   ┌───────────────┐
                              │  SQLite (DB)  │   │  Google OAuth │
                              │  via sql.js   │   │  (ID verify)  │
                              └───────────────┘   └───────────────┘
```

## Component Responsibilities

### Frontend (React / Vite / TailwindCSS)

- **Auth**: Google Sign-In (primary, one-click), Email OTP (fallback). 30-day JWT sessions stored in localStorage.
- **Upload**: PDF file upload with print options — page range, paper size, copies, duplex, color, print mode (now / collect later).
- **Printer Status**: Real-time via Socket.IO, lazily connected only after a file is selected (not on page load) to save Pi resources.
- **Payment**: Razorpay checkout integration with order summary and price breakdown.
- **Job Tracking**: Status screen showing current print job progress.
- **Job History**: List of all past print jobs for the logged-in user.
- **Admin Dashboard**: Separate login, with Overview (system health), Jobs (manage queue), and Policies (email rules) tabs.

### Pi Backend (Node.js / TypeScript / Express)

- **API Layer**: REST endpoints for auth, upload, payment, printer status, jobs, admin.
- **WebSocket Layer**: Socket.IO for real-time printer status. Room-based (`printer-status` room) — CUPS polling only runs when ≥1 client is subscribed.
- **Services**:
  - **CUPS Adapter**: Print, cancel, get status, list printers via CLI (`lp`, `lpstat`, `lpoptions`).
  - **PDF Service**: Validate PDFs (magic bytes + pdf-lib load), count pages, append identity page with QR code.
  - **Pricing Engine**: Cost calculation — B&W ₹2/page, Color ₹5/page, 20% duplex discount. All amounts in paise.
  - **Job Queue**: In-process FIFO with retry logic (max 3 retries, 5s delay). Recovers interrupted paid jobs on reboot.
  - **Email Policy Service**: Dynamic email validation against regex-based policy table. No hardcoded departments.
  - **OTP Service**: 6-digit OTP, stored in SQLite, 5-minute expiry.
- **Database**: SQLite via sql.js (pure WASM — no native compilation needed, works on any platform).
- **Auth**: JWT tokens (jsonwebtoken), Google ID token verification (google-auth-library), admin auth (bcrypt passwords).
- **File Storage**: Temporary PDF storage in `uploads/`, automatically cleaned up after 24h.

### CUPS (on Pi)

- Manages USB printer connection and driver.
- Accepts print jobs with options (page range, media, sides, color model).
- Reports printer status (idle, printing, stopped, error).
- Handles print queue ordering.

### Razorpay

- Creates payment orders (server-side, amount in paise).
- Handles payment UI (client-side JS SDK).
- Sends signed webhooks on payment completion (primary verification).
- Client-side signature verification (fallback if webhook delayed).

### Cloudflare Tunnel

- Outbound-only connection from Pi to Cloudflare edge.
- No router port forwarding or static IP needed.
- HTTPS termination at Cloudflare edge.
- Origin lockdown (only tunnel traffic accepted).

---

## Data Flow

### Happy Path: Sign In → Upload → Pay → Print

1. User clicks **"Sign in with Google"** → backend verifies Google ID token → validates email against policy → returns 30-day JWT.
2. *(Or fallback)* User enters email + name → backend validates email against policy → sends OTP → user verifies → JWT issued.
3. User uploads PDF → backend validates (MIME type, magic bytes, pdf-lib load test) → stores file → creates job record → returns job ID + price.
4. User reviews print options → clicks **"Continue to Payment"**.
5. Socket.IO connects lazily → joins `printer-status` room → backend starts CUPS polling.
6. Frontend shows real-time printer status badge.
7. User clicks **"Pay"** → backend checks printer is online → creates Razorpay order.
8. User completes payment in Razorpay checkout popup.
9. Razorpay sends webhook → backend verifies HMAC signature → marks payment as `webhook_verified`.
10. Backend appends identity page (name, email, job ID, QR code, timestamp, mode) to PDF.
11. Backend submits to CUPS with user-selected options (`lp` command).
12. CUPS prints document → backend polls for completion → marks job `completed`.
13. Frontend shows **"Completed"** status.

### Job State Machine

```
uploaded → payment_pending → paid → printing → completed
                                  ↘ failed → retry (max 3) → failed_permanent
```

### Authentication Flow

```
                    ┌──── Google Sign-In (1 click) ────┐
                    │                                   │
User ───────────────┤                                   ├──► JWT (30 days)
                    │                                   │
                    └──── Email OTP (fallback) ─────────┘
                          1. Enter email + name
                          2. Receive 6-digit OTP
                          3. Verify OTP
```

### Socket.IO Lifecycle (Lazy Connection)

```
Page Load → No socket connection (saves Pi resources)
     │
File Selected → Socket connects → emits 'subscribe:printer-status'
     │
Backend → Joins client to room → Starts CUPS polling (if not running)
     │
Status Change → Emits 'printer:status' only to room members
     │
Page Leave → Socket disconnects → Backend stops polling if 0 subscribers
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `jobs` | Print jobs with status, file path, options, price |
| `payments` | Razorpay orders, payment IDs, webhook verification |
| `otps` | One-time passwords for email auth |
| `email_policies` | Domain/regex rules for allowed emails |
| `printer_profiles` | Cached printer capabilities |
| `admins` | Admin users with bcrypt password hashes |
| `migrations` | Applied schema migrations tracker |
