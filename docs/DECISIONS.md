# Product decisions for the open questions (spec section 15)

The specification lists eight questions that had to be answered before development. Each one has a
default below. Defaults live in `apps/api/src/settings/settings.defaults.ts` and every value marked
"setting" can be changed at runtime by an administrator (`PATCH /api/admin/settings`, Admin → Settings).
Changes to attendance rules create a new `AttendancePolicy` version; each lesson keeps the policy it
started with, so old lessons are never re-evaluated.

| # | Question | Default | Setting(s) |
|---|----------|---------|------------|
| 1 | Integration with SSO / LDAP / SIS? | Stand-alone. Local accounts (Argon2id), admin-created users, CSV/XLSX import. SSO is a future adapter behind `authProvider`. | `authProvider` |
| 2 | Can a teacher create courses freely? | Yes. Teachers create their own courses and become the owner; admins can create, reassign and archive any course. | `teacherCanCreateCourses` |
| 3 | Is there a limit after which a student is ABSENT instead of LATE? | No limit: check-in stays open until the lesson ends. Up to 10:00 is PRESENT, after that LATE. An admin can close check-in after N minutes; students who did not check in become ABSENT when the lesson ends. | `lateAfterMinutes` (10), `checkinCloseAfterMinutes` (off) |
| 4 | May a teacher change a status after LOCKED, and who approves? | No. Lessons lock 72 h after they end. After that only an admin may correct, with a mandatory reason, and it is audited. Optionally every teacher correction can require admin approval. | `lockAfterHours` (72), `teacherCanEditAfterLock` (false), `teacherCorrectionsNeedApproval` (false) |
| 5 | No camera, a disability, or no smartphone? | Supported through a manual check-in request from the join page ("I can't scan"); the teacher approves or rejects it in the live roster. Teachers can also mark a student manually with a reason. | `allowManualCheckinRequests` (true) |
| 6 | One active phone, or one active device of any kind? Lost phone? | One active session of any kind per student. A new login signs the old device out immediately (and cancels its scans). A lost phone is handled by signing in on the new device, or by an admin revoking all sessions. Teachers may stay signed in on several devices (laptop + projector + phone). | `studentSingleSession` (true), `teacherMaxSessions` (0 = unlimited) |
| 7 | How long are attendance, logs and correction requests kept? | 5 years for attendance, audit log and requests; 30 days for technical data (expired challenges, idempotency keys, old sessions). A nightly job deletes data past retention. | `attendanceRetentionDays`, `auditRetentionDays`, `requestRetentionDays` (1825), `technicalRetentionDays` (30) |
| 8 | Many simultaneous lessons, expected scale? | Designed for a whole faculty at once: markers are computed (HMAC of the slot), not stored, so a lesson costs nothing between scans; one ACTIVE lesson per course is enforced by a database index; verify is a single atomic transaction. Realtime uses Socket.IO rooms per lesson; with `REDIS_URL` set, e-mail runs on a BullMQ queue. Horizontal scaling of the realtime gateway needs the Socket.IO Redis adapter (not yet enabled). | — |

## Other defaults worth knowing

- University time zone `Europe/Istanbul` for display and reports. All data is stored in UTC.
- Marker rotation 20 s, previous-slot tolerance 2 s (only when the scan started before the boundary), scan challenge 60 s, 20 attempts per challenge.
- Lessons left running auto-end 15 minutes after their scheduled end (`autoEndAfterScheduledMinutes`).
- Onboarding uses an activation link valid for 72 h; admins can switch to temporary passwords (`onboardingMode`).
- Reports count LATE as attended and leave EXCUSED out of the denominator (`lateCountsAsPresent`, `excusedCountsInDenominator`).
- MFA (TOTP) is optional for staff; it can be made mandatory with `mfaRequiredForStaff`.
- Where the spec contradicts itself, section 18 wins (e.g. the student profile is read-only except preferred name, phone and language).
