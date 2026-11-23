# Pamukkale University Attendance Platform

**Languages:** [English](README.en.md) · [Türkçe](README.tr.md) · [Български](../README.md)

A web platform that records attendance in university classes. A student joins a lesson by
scanning a QR code with their phone camera, then proves they are in the room by pointing the
browser camera at a **Check-In Tag** shown on the projector — a square marker that changes every
10 seconds on server time.

---

## Contents

- [What the platform does](#what-the-platform-does)
- [What it does not guarantee](#what-it-does-not-guarantee)
- [Running it](#running-it)
- [Demo accounts](#demo-accounts)
- [Roles](#roles)
- [How check-in works](#how-check-in-works)
- [Business rules](#business-rules)
- [Device binding](#device-binding)
- [Importing students](#importing-students)
- [Reports](#reports)
- [Architecture](#architecture)
- [Settings](#settings)
- [Security and privacy](#security-and-privacy)
- [Tests](#tests)

---

## What the platform does

| | |
|---|---|
| **Goal** | Trustworthy attendance records for university classes |
| **Roles** | Administrator, teacher, student |
| **Verification** | Step 1: QR with the phone's own camera → Step 2: Check-In Tag read by the browser camera |
| **Rotation** | The marker changes every **10 seconds**, timed by the server |
| **Lateness** | `verified_at ≤ start + 10:00` → **PRESENT**, otherwise **LATE** |
| **Devices** | A student's account is tied to one device; changing it needs approval |
| **Privacy** | No photos, video or biometrics are stored. Recognition happens in the browser |
| **Reports** | Excel (.xlsx) per course, per week and per lesson |
| **Languages** | English, Turkish, Bulgarian |

## What it does not guarantee

Be honest about this with anyone evaluating the system.

A QR code on its own does not prove attendance. A Check-In Tag ID is not a secret and not a
cryptographic signature. The 10-second rotation makes an old photograph useless, but it does
**not** stop a live relay (someone pointing a second phone at the projector for a friend), a
virtual camera, or a tampered client.

What the platform does give you is a complete, auditable record of who checked in, when, from
which device, and who changed anything afterwards and why.

---

## Running it

### With Docker

```bash
cp .env.example .env            # set JWT_ACCESS_SECRET (openssl rand -base64 48)
docker compose up --build
docker compose exec api npx ts-node --transpile-only prisma/seed.ts   # demo data, optional
```

Open <https://localhost:8443> and accept Caddy's local certificate once. Outgoing e-mail appears
in Mailpit at <http://localhost:8025>.

### Without Docker

Node 22 and PostgreSQL 16 are required. Redis is optional.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # check DATABASE_URL
npm run db:migrate && npm run db:seed
npm run dev                                  # API on :4000, web on :3000
```

With an empty `REDIS_URL` the API uses an in-memory rate limiter and skips the e-mail queue.
With an empty `SMTP_URL`, e-mails are written to `apps/api/.outbox` instead of being sent.

### Testing on a real phone

The camera needs a secure context. `localhost` counts as one, a LAN address does not, so a
certificate is required:

```bash
brew install mkcert && mkcert -install
cd apps/web/certificates
mkcert -cert-file localhost.pem -key-file localhost-key.pem "$(scutil --get LocalHostName).local" "$(ipconfig getifaddr en0)" localhost 127.0.0.1 ::1
npm run dev:lan                              # serves HTTPS on :3000
```

Point `PUBLIC_WEB_URL` at the `.local` hostname rather than the IP address — the hostname
survives a DHCP change, an IP does not. On the phone, install the CA from
`https://<hostname>.local:3000/rootCA.crt`; on iOS also enable it under
*Settings → General → About → Certificate Trust Settings*.

---

## Demo accounts

Password for all of them: `Demo!Pass2026`

| Role | E-mail |
|------|--------|
| Administrator | `admin@pau.edu.tr` |
| Teacher | `teacher@pau.edu.tr`, `teacher2@pau.edu.tr` |
| Student | `student@pau.edu.tr`, `student02@pau.edu.tr` … `student30@pau.edu.tr` |

---

## Roles

**Student** — sees their own attendance history and attendance rate, scans to check in, and can
ask for a correction or a manual check-in when the camera fails. Cannot change their own name.

**Teacher** — creates and manages their own courses, enrols students from the central directory,
starts and ends lessons, watches the roster fill in live, corrects attendance with a reason,
exports Excel reports, and approves or rejects student requests, including device changes.

**Administrator** — everything a teacher can do across all courses, plus user management,
spreadsheet import, platform settings, and the audit log.

---

## How check-in works

The two scans are deliberately different:

| Step | Camera | What it does | What it never does |
|------|--------|--------------|--------------------|
| **1. QR** | The phone's own camera app | Opens the lesson link | — |
| **2. Check-In Tag** | The browser camera (`getUserMedia`, HTTPS) | Recognises the current marker locally from the live video | No file upload, no photograph, no stored frames |

The flow:

1. The teacher starts a lesson and opens the projector screen.
2. The projector shows a QR code and the current Check-In Tag with a countdown.
3. The student scans the QR with their phone camera and signs in if asked.
4. The student taps **Scan Check-In Tag** and points at the projector.
5. The browser recognises the marker and sends only its **ID** to the server.
6. The server checks the ID against the slot that is valid at that moment and records the result.

Nothing from the camera leaves the phone. Only a number does.

---

## Business rules

### Lesson lifecycle

```
DRAFT ──start──▶ ACTIVE ──end──▶ ENDED ──lock──▶ LOCKED
  └──────────────── cancel ────────────────▶ CANCELLED
```

- A lesson can be scheduled for later or started immediately.
- Starting a lesson asks for the date and the time range; those bounds decide lateness.
- When a lesson ends, everyone who has not checked in is recorded as **ABSENT**.
- A locked lesson can only be corrected by an administrator, unless policy says otherwise.

### Attendance statuses

| Status | Meaning |
|--------|---------|
| `PRESENT` | Verified within the lateness threshold |
| `LATE` | Verified after it |
| `ABSENT` | Never verified; written when the lesson ends |
| `MANUAL_PRESENT` / `MANUAL_LATE` | Set by a teacher, always with a reason |
| `EXCUSED` | Excused absence |
| `REMOVED_FROM_SESSION` | Removed from this lesson by the teacher; history is kept |

### The marker window

The marker changes every 10 seconds. A scan that **began** before the boundary is still accepted
for up to 2 seconds afterwards, so a student who starts scanning just before a change is not
punished for it. A scan that began after the boundary gets no such grace.

All timing is server time. The phone's clock is never trusted.

### Who counts

Only students enrolled in the course can check in. Un-enrolling a student keeps their past
attendance but blocks future lessons.

---

## Device binding

A student's account is tied to one device, so one phone cannot check in for several people.

**How it is proved.** A long-lived `httpOnly` cookie identifies the browser. A coarse fingerprint
(user agent, screen, timezone) is stored alongside it, but it is only ever used to restore a
cookie that was cleared, and only for someone who has already supplied the correct password. It
is never a credential on its own.

**First sign-in** asks *"Is this your phone?"* before binding anything. Nothing is bound silently.

**A different device** is refused, and the student is offered a link to request a change with a
reason. A teacher or administrator reviews it; approving moves the account to the new device and
signs the old one out.

**A second account on the same device** is refused outright.

**Teachers and administrators are exempt.** They work from lecture-room PCs, laptops and their own
phones, and locking them to one browser would create requests with nobody left to approve them.

> **Known limit.** Browsers do not share storage, so a different browser on the same phone counts
> as a different device. True cross-browser device identity is not possible in a web application;
> it would need a native app. In practice this makes the rule stricter, not weaker.

---

## Importing students

Administrators can create accounts in bulk from the registry's own spreadsheet
(`.xlsx`, `.csv` or `.tsv`).

Column headers are recognised in English, Turkish and Bulgarian. Matching ignores case and
accents, so `Öğrenci No`, `Ogrenci No` and `ÖĞRENCİ NO` all work:

| Field | Accepted headers |
|-------|------------------|
| Name *(required)* | `Name`, `Ad Soyad`, `Име` |
| E-mail *(required)* | `E-mail`, `E-posta`, `Имейл` |
| Student number | `Faculty number`, `Öğrenci No`, `Факултетен номер` |
| Programme | `Programme`, `Bölüm`, `Специалност` |
| Year | `Year`, `Sınıf`, `Курс` |
| Group | `Group`, `Grup`, `Група` |

The import runs in two steps. The **preview** parses the file and flags every problem — invalid
e-mail, duplicate inside the file, already exists — without writing anything. Only after the
administrator confirms are accounts created, one row at a time, so a single bad row cannot throw
away a successful import of two hundred others. The report says exactly what happened to each.

A ready-made example lives at [`students-template.xlsx`](students-template.xlsx).

Every new account receives a generated password that must be changed at first sign-in.

---

## Reports

| Report | Where |
|--------|-------|
| Per course | Course → Attendance & reports |
| Per week | Reports (teacher sees their courses, admin sees all) |
| Per lesson | Course → Lessons → download icon |

All exports are `.xlsx` and are protected against formula injection. Every export is recorded in
the audit log.

---

## Architecture

```
apps/
  api/   NestJS + Prisma + PostgreSQL + Socket.IO
  web/   Next.js (App Router) + React Query + Tailwind
```

| Layer | Choice | Why |
|-------|--------|-----|
| API | NestJS 11 | Modules map cleanly onto the domain |
| Database | PostgreSQL 16 via Prisma | Relational history, migrations in the repo |
| Live updates | Socket.IO | Roster fills in without polling; sessions revoke instantly |
| Passwords | Argon2id | Memory-hard |
| Sessions | httpOnly cookies, rotating refresh tokens with reuse detection | Nothing readable from JavaScript |
| Marker | AprilTag 36h11, derived per slot with HMAC | IDs cannot be predicted without the lesson secret |
| Detection | `js-aruco2` + the tag36h11 dictionary, in a Web Worker | Runs on the phone; no frames leave it, and no WASM build is needed |
| Reports | ExcelJS | Formula-injection safe |

The lesson secret used to derive markers is never sent to any client. The projector receives only
the current marker ID.

---

## Settings

An administrator can change platform behaviour at runtime, without touching code:

- Lateness threshold, check-in close time, automatic end
- Marker grace, scan validity, maximum attempts per scan
- Onboarding mode: generated password, or activation link
- One session per student, maximum sessions per teacher
- Which fields a student may edit
- Automatic locking of lessons, whether corrections need approval
- Data retention per category

Changing a rule never re-grades a lesson that already ran: each lesson stores a snapshot of the
policy it was held under.

---

## Security and privacy

- No photographs, video or biometric data are ever stored. Recognition happens in the browser
  and only a marker ID is transmitted.
- Passwords are hashed with Argon2id. Tokens live in `httpOnly` cookies with CSRF protection.
- A refresh token that is reused invalidates the whole family — a stolen token is detectable.
- Every action that changes data is written to the audit log with the actor, the target and,
  where it matters, the reason.
- Retention periods are configurable per category and enforced by a scheduled job.

---

## Tests

```bash
createdb attendance_test
(cd apps/api && DATABASE_URL=postgresql://…/attendance_test npx prisma migrate deploy)
npm test
```

The end-to-end suite covers the parts that are easy to get wrong: the exact 10:00 boundary
(10:00 is present, 10:00.001 is late), the 2-second marker grace, replayed and concurrent scans,
a revoked old phone, an un-enrolled and a removed student, a lesson ending mid-scan, device
binding refusals, and a 403 for a teacher reaching into another teacher's course.
