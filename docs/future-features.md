# Future Feature Ideas

Features identified for future implementation. These are not currently built but represent valuable enhancements to the print service.

---

## 1. Print Credits / Prepaid Balance
**Priority:** Medium  
**Effort:** Medium

Allow departments or admins to issue print credits to students (e.g., "100 free pages for CS department"). Credits would be deducted before wallet balance or Razorpay payment. Useful for lab classes or exam printing.

- Add `credits` table: `user_email`, `amount`, `source`, `expires_at`
- Deduction order: credits → wallet → Razorpay
- Admin UI to issue/revoke credits per student or department

---

## 2. Batch Printing / Multi-Document Jobs
**Priority:** Low  
**Effort:** Medium

Currently each file creates a separate job. Allow grouping multiple PDFs into a single batch with shared settings and a single payment.

- Batch job model: parent job + child jobs
- Single Razorpay order for the batch
- Progress tracking per document within batch
- Identity page only on last document or on each

---

## 3. Usage Analytics Dashboard (Student)
**Priority:** Low  
**Effort:** Small

Show students their printing history analytics: pages printed per month, spending trends, most-used settings.

- Chart components (use recharts or chart.js)
- Monthly/weekly breakdowns
- Export history as CSV

---

## 4. Recurring / Scheduled Bulk Prints
**Priority:** Low  
**Effort:** Large

For departments that print the same documents regularly (e.g., weekly attendance sheets). Upload once, schedule recurring prints.

- Cron-like scheduling
- Template storage (keep PDF beyond normal cleanup)
- Auto-payment from wallet balance
- Admin approval workflow

---

## 5. Print Preview
**Priority:** Medium  
**Effort:** Medium

Show a visual preview of the PDF before payment so students can verify they uploaded the right document and page range is correct.

- PDF.js viewer embedded in the payment page
- Page range highlighting
- Thumbnail grid view
- Mobile-optimized viewer

---

## 6. Printer Health Alerts
**Priority:** Medium  
**Effort:** Small

Proactive notifications when printer issues are detected (low ink, paper jam, offline) — push to admin via email/webhook and show banner to users.

- Threshold-based alerts (ink < 10%, paper out)
- Admin notification channel (email, Slack webhook, Discord)
- Auto-pause queue when critical issue detected
- Historical uptime tracking

---

## 7. Multi-Language Support Expansion
**Priority:** Low  
**Effort:** Small

The i18n system is already in place. Add more language translations beyond the current set (Hindi, Gujarati for DDU campus context).

- Add translation files for hi, gu locales
- Community-contributed translations
- Language auto-detection from browser

---

## 8. Printer Load Balancing
**Priority:** High (when multiple printers deployed)  
**Effort:** Medium

When "auto" printer is selected with multiple printers available, intelligently distribute jobs based on queue depth, printer speed, and current status.

- Weighted round-robin based on printer speed ratings
- Failover: if assigned printer goes offline, auto-reassign to next available
- Per-printer job history for speed estimation
- Admin-configurable priority/weight per printer

---

## 9. Student ID Card Integration
**Priority:** Low  
**Effort:** Large

Instead of email OTP, allow students to authenticate by tapping their campus ID card (NFC/RFID) at a reader connected to the Pi.

- USB RFID reader support
- Card-to-email mapping table
- Fallback to email OTP if card not registered
- Admin card registration workflow

---

## 10. Print Job Templates
**Priority:** Low  
**Effort:** Small

Save frequently used print configurations (e.g., "Assignment - B&W Duplex A4" or "Lab Report - Color Single-sided") for one-click reuse.

- User-saved templates with name + settings
- Quick-select on upload page
- Admin-defined default templates per department
