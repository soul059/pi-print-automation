# Architecture Decision Records

## ADR-001: Runtime — Node.js over C/C++
**Status:** Accepted
**Context:** Pi Zero 2W has limited resources (512 MB RAM, quad-core ARM). Need to integrate with Razorpay SDK, PDF libraries, HTTP server, and CUPS.
**Decision:** Node.js (TypeScript) — official Razorpay SDK, pdf-lib for PDF manipulation, Express for HTTP, child_process exec for CUPS CLI. Development speed far outweighs the marginal performance gain of C/C++.
**Consequences:** ~50 MB RAM footprint for Node process. Acceptable for single-printer workload.

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

## ADR-004: Database — SQLite via sql.js
**Status:** Accepted (amended)
**Context:** Single Pi, single printer, low concurrency (~10 concurrent users max). Originally used `better-sqlite3` (native C addon), but it requires a C++ toolchain to compile — fails on machines without Visual Studio Build Tools and on some ARM configurations.
**Decision:** Switched to `sql.js` — a pure WebAssembly (WASM) port of SQLite. No native compilation needed. Works identically on Windows, macOS, Linux, ARM.
**Trade-offs:**
- sql.js requires async initialization (WASM loading).
- Database lives in memory; must explicitly call `saveDb()` after every write to persist to disk.
- Cannot execute multiple SQL statements in a single `db.run()` call — migrations use arrays of individual statements.
**Consequences:** Zero-dependency database that works everywhere. ~2 MB WASM binary. File-based persistence via manual `fs.writeFileSync()`.

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
**Consequences:** Reduces failed-print refund scenarios. May occasionally block unnecessarily if status is stale.

## ADR-010: Monorepo with pnpm Workspaces
**Status:** Accepted
**Context:** Frontend and backend are tightly coupled (shared API types, coordinated releases).
**Decision:** Single repo with pnpm workspaces. `pi-server/` and `frontend/` as workspace packages.
**Consequences:** Atomic commits. Shared tooling configs. Single CI pipeline.

## ADR-011: Authentication — Google Sign-In + OTP Fallback
**Status:** Accepted
**Context:** Original design used OTP-only auth, requiring students to enter a 6-digit code every time they logged in (or after session expiry). This was inconvenient.
**Decision:** Google Sign-In as primary auth (one click — students already have college Google accounts). Email OTP kept as fallback. Sessions last 30 days (JWT `exp` claim).
**Implementation:**
- Backend: `google-auth-library` verifies Google ID tokens, checks `email_verified`, then validates against email policies.
- Frontend: `@react-oauth/google` provides the Sign-In button.
- Both methods produce identical JWT tokens with 30-day expiry.
**Consequences:** Near-zero friction for students. Google Cloud project + OAuth Client ID required for setup.

## ADR-012: JWT Authentication (jsonwebtoken)
**Status:** Accepted
**Context:** Initially used a custom HMAC-based token format (base64url payload + SHA256 signature). It worked but lacked standard JWT features like expiry claims, issuer validation, and library ecosystem compatibility.
**Decision:** Switched to `jsonwebtoken` package with standard JWT format. Tokens include `sub`, `iat`, `exp`, `iss` claims. Admin tokens use a separate 24h expiry.
**Consequences:** Standard JWT format, automatic expiry enforcement, compatible with any JWT library.

## ADR-013: Lazy Socket.IO — Room-Based Polling
**Status:** Accepted
**Context:** Original design connected all users to Socket.IO on page load and polled CUPS every 5 seconds regardless of whether anyone was watching. On a Pi Zero 2W with 512 MB RAM, unnecessary polling and connections waste resources.
**Decision:** Socket.IO uses a room-based subscription model:
1. No socket connection on page load.
2. Client connects and emits `subscribe:printer-status` only after a file is selected.
3. Backend only polls CUPS when ≥1 client is in the `printer-status` room.
4. When the last client disconnects, polling stops.
**Consequences:** Zero CUPS overhead when no users are active. Socket connections only exist during the upload→payment flow.

## ADR-014: Admin Authentication — JWT + bcrypt
**Status:** Accepted
**Context:** Original admin auth used a static `ADMIN_TOKEN` header — insecure, no audit trail, shared secret.
**Decision:** Admin users stored in `admins` table with bcrypt-hashed passwords. Login via `POST /api/admin/login` returns a 24h JWT. Legacy static token still accepted for backward compatibility with scripts.
**Consequences:** Admin users can be created via `pnpm seed:admin <username> <password>`. Password changes don't require env var updates.
