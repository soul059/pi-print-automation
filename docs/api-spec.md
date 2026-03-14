# API Specification — Pi Print Automation

Base URL: `https://printer.yourdomain.com/api` (or `http://localhost:3000/api` in development)

All authenticated endpoints require: `Authorization: Bearer <jwt-token>`

---

## Authentication

### POST /api/auth/google
Authenticate via Google Sign-In. **Primary method — one click.**

**Request:**
```json
{
  "credential": "google-id-token-from-frontend"
}
```

**Response (200):**
```json
{
  "token": "jwt-session-token-30-day-expiry",
  "email": "23itub017@ddu.ac.in",
  "name": "Keval Patel",
  "department": "IT Undergraduate B",
  "year": "2023",
  "picture": "https://lh3.googleusercontent.com/..."
}
```

**Response (403):** Email not in allowed policy.
```json
{
  "error": "Email not authorized",
  "reason": "Department not allowed",
  "email": "someone@gmail.com"
}
```

### POST /api/auth/validate-email
Validate email against policy and send OTP. **Fallback method.**

**Request:**
```json
{
  "email": "23itub017@ddu.ac.in",
  "name": "Keval Patel"
}
```

**Response (200):**
```json
{
  "valid": true,
  "department": "IT Undergraduate B",
  "year": "2023",
  "message": "OTP sent to email"
}
```

**Response (403):**
```json
{
  "valid": false,
  "reason": "Department not allowed"
}
```

### POST /api/auth/verify-otp
Verify OTP and get session token. **Fallback method.**

**Request:**
```json
{
  "email": "23itub017@ddu.ac.in",
  "otp": "123456",
  "name": "Keval Patel"
}
```

**Response (200):**
```json
{
  "verified": true,
  "token": "jwt-session-token-30-day-expiry"
}
```

---

## Upload

### POST /api/upload
Upload a PDF file for printing. **Requires auth.**

**Request:** `multipart/form-data`
- `file`: PDF file (max 10 MB)
- `config`: JSON string with print options

```json
{
  "pageRange": "1-5",
  "paperSize": "A4",
  "copies": 1,
  "duplex": false,
  "color": "grayscale",
  "printMode": "now"
}
```

**Response (201):**
```json
{
  "jobId": "job_abc123xyz",
  "fileName": "document.pdf",
  "totalPages": 10,
  "printPages": 5,
  "price": 1000,
  "currency": "INR",
  "status": "uploaded",
  "estimatedWait": "2 minutes"
}
```

Note: `price` is in **paise** (1000 paise = ₹10.00).

---

## Printer

### GET /api/printer/status
Get current printer status. **Public endpoint** (no auth required).

**Response (200):**
```json
{
  "online": true,
  "status": "idle",
  "accepting": true,
  "printerName": "HP_LaserJet",
  "capabilities": {
    "color": true,
    "duplex": true,
    "paperSizes": ["A4", "Letter", "Legal"]
  }
}
```

### WebSocket Events (Socket.IO)

**Client → Server:**
- `subscribe:printer-status` — Join the printer status room (starts CUPS polling)
- `unsubscribe:printer-status` — Leave the room (stops polling if 0 subscribers)

**Server → Client:**
- `printer:status` — Emitted only to `printer-status` room members when status changes:
```json
{
  "online": true,
  "status": "printing",
  "accepting": true,
  "printerName": "HP_LaserJet",
  "queueDepth": 3,
  "estimatedWait": "5 minutes"
}
```

---

## Payment

### POST /api/payment/create
Create a Razorpay payment order. **Requires auth.** Blocks if printer is offline.

**Request:**
```json
{
  "jobId": "job_abc123xyz"
}
```

**Response (200):**
```json
{
  "orderId": "order_xyz789",
  "amount": 1000,
  "currency": "INR",
  "keyId": "rzp_test_xxxxx",
  "jobId": "job_abc123xyz"
}
```

**Response (503):** Printer offline.
```json
{
  "error": "Printer is not available",
  "message": "Printer is offline or not accepting jobs"
}
```

### POST /api/payment/verify
Client-side payment verification (fallback). **Requires auth.**

**Request:**
```json
{
  "razorpay_order_id": "order_xyz789",
  "razorpay_payment_id": "pay_abc123",
  "razorpay_signature": "signature_hex"
}
```

**Response (200):**
```json
{
  "success": true,
  "jobId": "job_abc123xyz",
  "status": "paid"
}
```

### POST /api/payment/webhook
Razorpay webhook endpoint. **Called by Razorpay servers, not frontend.**
Verifies HMAC-SHA256 signature from `x-razorpay-signature` header.
Returns `200` on success to acknowledge receipt.

---

## Jobs

### GET /api/jobs
List jobs for the authenticated user. **Requires auth.**

**Response (200):**
```json
{
  "jobs": [
    {
      "id": "job_abc123xyz",
      "status": "completed",
      "file_name": "document.pdf",
      "total_pages": 10,
      "price": 1000,
      "print_mode": "now",
      "created_at": "2026-03-14T09:00:00Z"
    }
  ]
}
```

### GET /api/jobs/:jobId
Get single job details. **Requires auth.** Only returns jobs owned by the authenticated user.

---

## Admin

### POST /api/admin/login
Admin login. **Public — no auth required.**

**Request:**
```json
{
  "username": "admin",
  "password": "your-password"
}
```

**Response (200):**
```json
{
  "token": "admin-jwt-24h-expiry",
  "admin": {
    "id": 1,
    "username": "admin",
    "displayName": "Admin User",
    "role": "admin"
  }
}
```

### All Admin Endpoints Below
Require `Authorization: Bearer <admin-jwt>` or legacy `x-admin-token` header.

### GET /api/admin/health
System health dashboard data.

**Response (200):**
```json
{
  "printer": { "online": true, "status": "idle", "accepting": true, "printerName": "HP_LaserJet" },
  "queue": { "depth": 2, "uploaded": 5, "paid": 1, "printing": 0, "completed": 45, "failed": 1 },
  "system": {
    "memoryUsage": "45%",
    "totalMemory": "512 MB",
    "freeMemory": "280 MB",
    "uptime": "3 hours",
    "uploadDirSize": "15 MB",
    "platform": "linux",
    "arch": "arm"
  },
  "lastSuccessfulPrint": "2026-03-14T08:55:00Z"
}
```

### GET /api/admin/jobs?status=failed&limit=50&offset=0
List all jobs with optional filters.

### POST /api/admin/jobs/:jobId/retry
Retry a failed job (resets to `paid` status and re-enqueues).

### POST /api/admin/jobs/:jobId/cancel
Cancel a job (sets to `failed_permanent`).

### GET /api/admin/policies
List all email policies.

### POST /api/admin/policies
Create a new email policy.

**Request:**
```json
{
  "name": "IT Department",
  "domain": "ddu.ac.in",
  "pattern": "^\\d{2}itub\\d{3}$",
  "departmentKey": "itub",
  "active": true
}
```

### PUT /api/admin/policies/:id
Update an email policy (partial update supported).

### DELETE /api/admin/policies/:id
Delete an email policy.

---

## Health Check

### GET /health
Basic health check. **Public, no auth.**

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-14T09:00:00.000Z",
  "uptime": 3600.5
}
```
