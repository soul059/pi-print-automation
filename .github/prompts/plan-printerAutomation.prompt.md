## Plan: Pi Paid Print Automation Blueprint

Build a Pi Zero 2W print service using Node.js + CUPS + SQLite, expose it securely through Cloudflare Tunnel, and add a frontend workflow that checks printer readiness before payment, takes Razorpay payment, then prints immediately (for both "now" and "later collect" modes) with a trailing identity page. Email authorization will be policy-driven (editable config) so departments can be added/removed without code changes.

**Steps**
1. Define architecture and boundaries (*blocks all later steps*): finalize responsibilities across frontend, Pi backend, CUPS, payment gateway, and admin config so no business logic is duplicated.
2. Phase 1 - Pi base platform setup (*depends on 1*): install Raspberry Pi OS Lite, Node LTS, CUPS, Ghostscript/poppler utilities, and cloudflared; configure CUPS for USB discovery and print queue control; create systemd services for backend and tunnel.
3. Phase 2 - Backend core services (*depends on 2*): implement Express API, SQLite schema, file upload pipeline, PDF validation, CUPS adapter, and a deterministic print job state machine.
4. Phase 3 - Printer capability abstraction (*parallel with 3, then merge*): implement a profile model to support “unknown USB printer” safely by using common CUPS options first, plus optional capability probing via lpoptions where available.
5. Phase 4 - Pre-payment status gate (*depends on 3 and 4*): implement /printer/status endpoint that verifies USB printer reachable, queue accepting jobs, and paper-availability signal (best effort from CUPS/SNMP fallback); block checkout when gate fails.
6. Phase 5 - Payment and job orchestration (*depends on 3 and 5*): Razorpay order creation, signed webhook verification, idempotent payment updates, and payment-to-print transition. Ensure print is triggered only after verified payment.
7. Phase 6 - Print modes and identity page (*depends on 6*): support “Print right away” and “Print later (collect later)” as fulfillment labels. Both print post-payment, but status labels differ for operations. Append one extra generated page at end of PDF containing student name, email, job ID, timestamp, and mode.
8. Phase 7 - Dynamic email access policy (*depends on 3*): create admin-editable config table/file for allowed domains, regex patterns, and department keys; enforce in auth/checkout flow (e.g., 23itub017@ddu.ac.in) without hardcoding departments.
9. Phase 8 - Frontend integration (*depends on 4, 6, 7*): build upload + print-options form (page range, paper size, copies, duplex, color), realtime printer status indicator, email validation feedback, Razorpay checkout handoff, and job-tracking screen.
10. Phase 9 - Observability and operations (*depends on 3+*): structured logs, failed-job retry policy, admin queue view, storage cleanup for uploaded files, backups for SQLite, and startup health checks.
11. Phase 10 - Hardening (*depends on 8 and 9*): API auth between frontend and Pi, rate limiting, max upload size, MIME validation, webhook replay protection, and Cloudflare Tunnel origin lock-down.

**Relevant files**
- Existing: c:/Users/keval/Downloads/xy/pr.md — requirements source to keep updated with accepted architecture decisions.
- New backend root: /pi-server
- New frontend root: /frontend
- New policy/config root: /pi-server/config
- New ops/deploy root: /deploy/pi

**Verification**
1. Connectivity: submit test request through Cloudflare hostname and confirm it reaches Pi API; verify no direct open router ports required.
2. Printer readiness gate: simulate printer unplugged/out-of-paper states and confirm checkout is blocked with actionable error.
3. Payment safety: run paid-flow tests with Razorpay test mode; verify only webhook-verified payments transition to printable state.
4. Queue behavior: submit concurrent jobs and validate FIFO handling, stable job IDs, and no duplicate prints on retries.
5. Print fidelity: verify page range, size, duplex/color options map correctly to CUPS options on at least two different USB printer models.
6. Identity page requirement: verify trailing page appears after original PDF pages with correct name/email metadata.
7. Access control: update policy dynamically (add/remove department regex) and verify without redeploy.
8. Recovery: reboot Pi and ensure backend + cloudflared auto-start; confirm pending paid jobs recover correctly.

**Decisions**
- Runtime: Node.js preferred over C/C++ for faster integration with Razorpay, PDF tooling, and web APIs on Pi Zero 2W.
- Transport: Frontend <-> Pi over Cloudflare Tunnel.
- Payment provider: Razorpay.
- Printer connection: USB-first, printer-model-agnostic capability profile.
- Status gate before payment: require online + paper-availability signal.
- Access control: dynamic policy config, not hardcoded department list.
- Print-later semantics: still printed immediately after payment; “later” means deferred pickup by student.

**Further Considerations**
1. Capability fallback policy: when paper-level telemetry is unavailable for a printer, choose strict fail-closed vs warn-and-allow. Recommendation: warn-and-allow with visible risk banner for MVP, then move to fail-closed after supported printer list is established.
2. Identity privacy: decide whether to include full email or masked email on trailing page. Recommendation: full email for campus operations, but configurable masking toggle.
3. Admin workflow: decide whether policy edits happen via UI or config file + restart. Recommendation: simple admin UI backed by SQLite to avoid SSH-based updates.
