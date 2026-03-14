# API Specification — Pi Print Automation

## Base URL
`https://printer.yourdomain.com/api`

---

## Authentication

### POST /api/auth/validate-email
Validate email against policy and send OTP.

**Request:**
```json
{
  "email": "23itub017@ddu.ac.in"
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
Verify OTP and establish session.

**Request:**
```json
{
  "email": "23itub017@ddu.ac.in",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "verified": true,
  "token": "jwt-session-token"
}
```

---

## Upload

### POST /api/upload
Upload a PDF file for printing. Requires auth token.

**Request:** `multipart/form-data`
- `file`: PDF file (max 10MB)
- `config`: JSON string with print options

```json
{
  "pageRange": "1-5",
  "paperSize": "A4",
  "copies": 1,
  "duplex": false,
  "color": "grayscale",
  "printMode": "now",
  "userName": "Keval Patel",
  "userEmail": "23itub017@ddu.ac.in"
}
```

**Response (201):**
```json
{
  "jobId": "job_abc123",
  "fileName": "document.pdf",
  "totalPages": 10,
  "printPages": 5,
  "price": 10,
  "currency": "INR",
  "status": "uploaded",
  "estimatedWait": "2 minutes"
}
```

---

## Printer

### GET /api/printer/status
Get current printer status.

**Response (200):**
```json
{
  "online": true,
  "status": "idle",
  "accepting": true,
  "paperAvailable": true,
  "paperWarning": false,
  "queueDepth": 2,
  "estimatedWait": "3 minutes",
  "printerName": "HP_LaserJet",
  "capabilities": {
    "color": true,
    "duplex": true,
    "paperSizes": ["A4", "Letter", "Legal"]
  }
}
```

### WebSocket: `printer:status`
Real-time printer status updates via Socket.IO.

**Event:** `printer:status`
```json
{
  "online": true,
  "status": "printing",
  "queueDepth": 3
}
```

---

## Payment

### POST /api/payment/create
Create a Razorpay payment order. Requires printer to be online.

**Request:**
```json
{
  "jobId": "job_abc123"
}
```

**Response (200):**
```json
{
  "orderId": "order_xyz789",
  "amount": 1000,
  "currency": "INR",
  "jobId": "job_abc123"
}
```

### POST /api/payment/verify
Client-side payment verification (fallback).

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
  "jobId": "job_abc123",
  "status": "paid"
}
```

### POST /api/payment/webhook
Razorpay webhook endpoint (primary verification path).
Receives signed webhook from Razorpay. Not called by frontend.

---

## Jobs

### GET /api/jobs/:jobId
Get job status.

**Response (200):**
```json
{
  "jobId": "job_abc123",
  "status": "completed",
  "fileName": "document.pdf",
  "printMode": "now",
  "pages": 5,
  "copies": 1,
  "price": 10,
  "createdAt": "2026-03-14T09:00:00Z",
  "completedAt": "2026-03-14T09:01:30Z"
}
```

### GET /api/jobs
List jobs for authenticated user.

**Response (200):**
```json
{
  "jobs": [
    {
      "jobId": "job_abc123",
      "status": "completed",
      "fileName": "document.pdf",
      "createdAt": "2026-03-14T09:00:00Z"
    }
  ]
}
```

---

## Admin

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
Update an email policy.

### DELETE /api/admin/policies/:id
Delete an email policy.

### GET /api/admin/jobs
List all jobs with filters (status, date range).

### POST /api/admin/jobs/:jobId/retry
Retry a failed job.

### POST /api/admin/jobs/:jobId/cancel
Cancel a pending job.

### GET /api/admin/health
System health dashboard data.

**Response (200):**
```json
{
  "printer": { "online": true, "status": "idle" },
  "queue": { "pending": 2, "printing": 1, "completed": 45, "failed": 1 },
  "system": { "diskFree": "12.5 GB", "memoryUsage": "45%", "uptime": "3 days" },
  "tunnel": { "connected": true },
  "lastSuccessfulPrint": "2026-03-14T08:55:00Z"
}
```
