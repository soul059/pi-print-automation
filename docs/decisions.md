# Architecture Decision Records

## ADR-001: Runtime — Node.js over C/C++
**Status:** Accepted  
**Context:** Pi Zero 2W has limited resources (512MB RAM, quad-core ARM). Need to integrate with Razorpay SDK, PDF libraries, HTTP server, and CUPS.  
**Decision:** Node.js (TypeScript) — official Razorpay SDK, pdf-lib for PDF manipulation, Express for HTTP, exec for CUPS CLI. Development speed far outweighs the marginal performance gain of C/C++.  
**Consequences:** ~50MB RAM footprint for Node process. Acceptable for single-printer workload.

## ADR-002: Transport — Cloudflare Tunnel
**Status:** Accepted  
**Context:** Pi sits behind a home/campus router. Need secure HTTPS access from frontend without port forwarding or static IP.  
**Decision:** Cloudflare Tunnel (free tier). Outbound-only connection. HTTPS terminated at Cloudflare edge.  
**Consequences:** Depends on Cloudflare availability. No direct LAN access needed. Zero router configuration.

## ADR-003: Payment Provider — Razorpay
**Status:** Accepted  
**Context:** Target users are Indian university students. Need UPI, cards, wallets support.  
**Decision:** Razorpay with webhook-first verification. Client-side verify as fallback.  
**Consequences:** Razorpay test mode for development. 2% transaction fee in production.

## ADR-004: Database — SQLite
**Status:** Accepted  
**Context:** Single Pi, single printer, low concurrency (~10 concurrent users max).  
**Decision:** SQLite via better-sqlite3 (synchronous, fast, no server process). WAL mode for concurrent reads.  
**Consequences:** No separate database server. Backup via file copy. Migration system for schema changes.

## ADR-005: Printer Connection — USB-first via CUPS
**Status:** Accepted  
**Context:** Printer connected via USB to Pi. Need model-agnostic support.  
**Decision:** Use CUPS as abstraction layer. Probe capabilities via `lpoptions`, cache results. Safe fallback defaults for unknown printers.  
**Consequences:** Depends on CUPS driver availability. Most USB printers work with generic drivers.

## ADR-006: Access Control — Dynamic Email Policy
**Status:** Accepted  
**Context:** University has multiple departments. Need to allow/deny access by department without code changes.  
**Decision:** SQLite table `email_policies` with domain, regex pattern, department key, active flag. Admin UI for CRUD. No hardcoded department list.  
**Consequences:** Policy changes take effect immediately. No redeploy needed.

## ADR-007: Print-Later Semantics
**Status:** Accepted  
**Context:** Two modes — "print now" and "collect later". Question: does "later" mean defer printing?  
**Decision:** Both modes print immediately after payment. "Later" only changes the status label and identity page text (COLLECT LATER vs INSTANT). Student picks up printout at their convenience.  
**Consequences:** Simpler implementation. No deferred job scheduling needed.

## ADR-008: Identity Page — QR Code
**Status:** Accepted  
**Context:** Staff need to match printouts to students for "collect later" mode.  
**Decision:** Append a trailing page with student name, email, job ID, timestamp, mode, and QR code encoding the job ID. Staff can scan QR to look up job.  
**Consequences:** Requires `qrcode` npm package. One extra page printed per job.

## ADR-009: Status Gate Before Payment
**Status:** Accepted  
**Context:** Avoid taking payment when printer is offline or out of paper.  
**Decision:** Pre-payment status check required. Block Razorpay order creation if printer is offline or not accepting jobs. Paper availability: warn-and-allow for MVP (not all printers report paper level).  
**Consequences:** Reduces failed-print refund scenarios. May occasionally block unnecessarily if status stale.

## ADR-010: Monorepo with pnpm Workspaces
**Status:** Accepted  
**Context:** Frontend and backend are tightly coupled (shared API types, coordinated releases).  
**Decision:** Single repo with pnpm workspaces. `pi-server/` and `frontend/` as workspace packages.  
**Consequences:** Atomic commits. Shared tooling configs. Single CI pipeline.
