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
                                                ▼
                                       ┌───────────────────┐
                                       │   SQLite DB        │
                                       │   (jobs, payments, │
                                       │    policies, otps) │
                                       └───────────────────┘
```

## Component Responsibilities

### Frontend (React/Vite)
- Email entry + OTP verification UI
- PDF file upload with print options (page range, paper size, copies, duplex, color)
- Real-time printer status display (via Socket.IO)
- Price preview and calculation display
- Razorpay checkout handoff
- Job tracking / status screen
- Admin dashboard (policy editor, queue view, health)

### Pi Backend (Node.js/TypeScript/Express)
- **API Layer**: REST endpoints for upload, payment, auth, printer status, admin
- **WebSocket Layer**: Socket.IO for real-time printer status push
- **Services**:
  - CUPS Adapter: print, cancel, status, list printers via CLI
  - PDF Service: validate PDFs, count pages, append identity page with QR code
  - Pricing Engine: calculate cost based on pages, color, duplex, copies
  - Job Queue: in-process FIFO queue with retry logic
  - Email/Policy Service: dynamic email validation against policy table
  - OTP Service: generate, store, verify one-time passwords
- **Database**: SQLite via better-sqlite3 (jobs, payments, otps, email_policies)
- **File Storage**: temporary PDF storage in `uploads/`, cleaned up after 24h

### CUPS (on Pi)
- Manages USB printer connection and driver
- Accepts print jobs with options (page range, media, sides, color model)
- Reports printer status (idle, printing, stopped, error)
- Handles print queue ordering

### Razorpay
- Creates payment orders (server-side)
- Handles payment UI (client-side SDK)
- Sends signed webhooks on payment completion (primary verification)
- Client-side signature verification (fallback)

### Cloudflare Tunnel
- Outbound-only connection from Pi to Cloudflare edge
- No router port forwarding needed
- HTTPS termination at Cloudflare edge
- Origin lockdown (only tunnel traffic accepted)

## Data Flow

### Happy Path: Upload → Pay → Print
1. User enters email → backend validates against policy → sends OTP
2. User verifies OTP → session established
3. User uploads PDF → backend validates (MIME, size, pages) → stores file → returns job ID + price
4. Frontend checks printer status (Socket.IO / REST fallback)
5. User initiates payment → backend creates Razorpay order
6. User completes payment in Razorpay checkout
7. Razorpay webhook → backend verifies signature → marks payment complete
8. Backend appends identity page (name, email, job ID, QR) to PDF
9. Backend submits to CUPS with user-selected options
10. CUPS prints document
11. Backend updates job status → frontend shows completion

### Job States
```
uploaded → payment_pending → paid → printing → completed
                                  ↘ failed → retry (max 3) → failed_permanent
```
