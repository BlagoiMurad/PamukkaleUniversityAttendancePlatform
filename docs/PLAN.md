# Implementation plan and status

Legend: ✅ done · 🟡 partial · ⬜ next

## Core flow (first PR)
| Area | Item | Status |
|------|------|--------|
| BE | Data model (users, profiles, courses, enrollment history, lessons, challenges, attendance, events, requests, audit, settings, policy versions) | ✅ |
| BE | Auth: Argon2id, HttpOnly cookies, rotating refresh tokens with reuse detection, CSRF, activation and reset links, optional TOTP | ✅ |
| BE | One active device per student, instant revoke over Socket.IO | ✅ |
| BE | Lesson lifecycle DRAFT → ACTIVE → ENDED → LOCKED / CANCELLED, auto-end and auto-lock jobs, ABSENT on end | ✅ |
| BE | 20 s AprilTag 36h11 marker (HMAC per slot), 2 s grace, QR join token, display-state without secrets | ✅ |
| BE | Challenge → verify: atomic, idempotent, one row per student, 10:00 rule on server time | ✅ |
| BE | Live roster, manual marks and corrections with reason, removal from lesson, history | ✅ |
| BE | Excel reports (course, weekly, single lesson; formula-injection safe) | ✅ |
| BE | Disputes, manual check-in requests, approve / reject | ✅ |
| BE | Audit log with filters; settings with runtime edits | ✅ |
| FE | Sign-in, activation, reset, forced password change, session-ended screen | ✅ |
| FE | Teacher: dashboard, courses, course detail (lessons, students, co-teachers, reports), live lesson roster | ✅ |
| FE | Projector screen: big QR, AprilTag, countdown, live count, "temporarily unavailable" when offline | ✅ |
| FE | Student: join page with live camera scanner (in-browser detector, no photo upload), history, disputes | ✅ |
| FE | Admin: dashboard, users, courses | ✅ |
| FE | English + Bulgarian, light + dark theme, mobile layout | ✅ |
| QA | Unit tests (marker, detector round-trip) and API e2e tests (10:00 boundary, grace, replay, concurrency, revoked phone, unenrolled, removed, end mid-scan, foreign teacher 403) | ✅ |
| Ops | Dockerfiles, docker-compose with Caddy HTTPS + Mailpit, CI workflow | ✅ |

## Second batch (same PR)
| Area | Item | Status |
|------|------|--------|
| BE | User import from CSV / XLSX: preview with per-row validation, commit, course enrollment, activation links, template (`/admin/users/import/*`) | ✅ |
| FE | Admin: import wizard, settings editor, audit log viewer, requests queue, reports (weekly + per course) | ✅ |
| FE | Teacher: weekly report page and requests inbox; student: my requests | ✅ |
| QA | Import e2e test (preview, commit, double commit 409, teacher 403) | ✅ |

## Next
| Area | Item | Status |
|------|------|--------|
| QA | Playwright E2E in CI with a fake camera feed | 🟡 (works locally, not yet in CI) |
| Ops | Socket.IO Redis adapter for multiple API instances | ⬜ |
| BE | SSO / LDAP adapter (if the university wants it) | ⬜ |
