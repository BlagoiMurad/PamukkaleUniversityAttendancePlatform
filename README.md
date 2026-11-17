# Pamukkale University Attendance Platform

Students check in by scanning a QR code on the projector with their phone and then pointing the camera
at a rotating AprilTag marker (new marker every 20 seconds). Everything is verified on the server:
enrollment, the single active phone, the current marker and the 10-minute late rule.

- `apps/api`: NestJS + Prisma + PostgreSQL, Socket.IO for live updates. Swagger at `/api/docs`.
- `apps/web`: Next.js (App Router) + Tailwind. English and Bulgarian, light and dark theme.
- Spec: `University_Attendance_Platform_FINAL_BG_v2_1.docx`. Decisions on the open questions: [docs/DECISIONS.md](docs/DECISIONS.md). Status: [docs/PLAN.md](docs/PLAN.md).

## Run with Docker (recommended)

```bash
cp .env.example .env            # set JWT_ACCESS_SECRET (openssl rand -base64 48)
docker compose up --build
docker compose exec api npx ts-node --transpile-only prisma/seed.ts   # optional demo data
```

Open https://localhost:8443 (Caddy's local certificate; accept it once). E-mails go to Mailpit at http://localhost:8025.
To try it with a real phone on the same Wi-Fi, set `PUBLIC_WEB_URL=https://<your-LAN-IP>:8443`: cameras only work over HTTPS.

## Run for development

Requirements: Node 22, PostgreSQL 16 (Redis optional).

```bash
npm install
cp apps/api/.env.example apps/api/.env      # adjust DATABASE_URL
npm run db:migrate && npm run db:seed
npm run dev:api                              # http://localhost:4000
npm run dev:web                              # http://localhost:3000
```

The camera needs HTTPS on a phone; on the laptop itself `http://localhost:3000` works.

## Demo accounts (after seeding)

Password for all: `Demo!Pass2026`

| Role | E-mail |
|------|--------|
| Admin | admin@pau.edu.tr |
| Teacher | teacher@pau.edu.tr, teacher2@pau.edu.tr |
| Student | student@pau.edu.tr, student02@pau.edu.tr … student30@pau.edu.tr |

Try it: sign in as the teacher, open a course, press **Start lesson**, then **Open projector**. On a phone,
scan the QR, sign in as a student and point the camera at the AprilTag.

## Tests

```bash
createdb attendance_test && (cd apps/api && DATABASE_URL=postgresql://…/attendance_test npx prisma migrate deploy)
npm test
```

The API e2e tests cover the 10:00 boundary (exactly 10:00 is PRESENT, 10:00.001 LATE), the 2-second
marker grace, replay and concurrent scans, a revoked old phone, unenrolled and removed students, ending a
lesson mid-scan and a foreign teacher getting 403.
