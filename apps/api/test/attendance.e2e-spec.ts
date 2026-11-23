/**
 * API end-to-end tests for the mandatory flows (spec 13, 16.7, 21): E2E-02..06, EC-20-01..09, T04..T10.
 * Requires a PostgreSQL database (TEST_DATABASE_URL, default attendance_test) with migrations applied.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { hash, Algorithm } from '@node-rs/argon2';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClockService } from '../src/common/clock.service';
import { markerFor } from '../src/lessons/markers';

const PASSWORD = 'Test!Pass2026x';
let app: INestApplication;
let prisma: PrismaService;
let clock: ClockService;
let http: ReturnType<typeof request>;
let ids: Record<string, string> = {};
let key = 0;
const idem = () => `test-key-${Date.now()}-${++key}`;

/** The device cookie each account was bound to, so repeat logins look like the same browser. */
const deviceCookies: Record<string, string> = {};

/**
 * Signs in the way the web app does. Students are tied to one device, so the first login binds
 * this "browser" and later logins replay its cookie.
 */
async function login(email: string) {
  const req = http.post('/api/auth/login');
  if (deviceCookies[email]) req.set('Cookie', deviceCookies[email]);
  const res = await req.send({ email, password: PASSWORD });

  if (res.body?.deviceSetupRequired) {
    const bind = await http.post('/api/auth/device/bind').send({ setupToken: res.body.setupToken, label: 'test device' }).expect(200);
    const cookie = (bind.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('pau_device='));
    deviceCookies[email] = cookie?.split(';')[0] ?? '';
    return login(email);
  }
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/** Signs in from a browser that has never been seen for this account. */
function loginFromUnknownDevice(email: string) {
  return http.post('/api/auth/login').send({ email, password: PASSWORD });
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function startLesson(teacherToken: string, courseId: string) {
  const res = await http.post(`/api/courses/${courseId}/lessons/start-now`).set(auth(teacherToken)).set('Idempotency-Key', idem()).send({ durationMinutes: 90 }).expect(200);
  const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: res.body.id } });
  return lesson;
}
const currentMarker = (lesson: { id: string; sessionSecret: string | null; markerEpoch: Date | null; markerRotationSeconds: number }) =>
  markerFor(lesson.sessionSecret!, lesson.id, Math.floor((clock.nowMs() - lesson.markerEpoch!.getTime()) / (lesson.markerRotationSeconds * 1000)));

function challenge(token: string, lesson: { id: string; joinToken: string | null }) {
  return http.post(`/api/lessons/${lesson.id}/attendance-challenges`).set(auth(token)).send({ joinToken: lesson.joinToken });
}
function verify(token: string, lessonId: string, challengeId: string, markerId: number, key = idem()) {
  return http.post(`/api/lessons/${lessonId}/attendance/verify`).set(auth(token)).set('Idempotency-Key', key).send({ challengeId, markerFamily: 'tag36h11', markerId });
}

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
  clock = app.get(ClockService);
  http = request(app.getHttpServer()) as any;

  await prisma.$executeRawUnsafe(
    'TRUNCATE users, courses, lessons, attendances, attendance_events, attendance_challenges, attendance_requests, device_sessions, audit_logs, idempotency_records, settings, attendance_policies, one_time_tokens, import_batches CASCADE',
  );
  const passwordHash = await hash(PASSWORD, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const mk = (email: string, role: 'ADMIN' | 'TEACHER' | 'STUDENT', extra: any = {}) =>
    prisma.user.create({ data: { email, name: email.split('@')[0], role, status: 'ACTIVE', passwordHash, ...extra } });
  const admin = await mk('admin@t.edu', 'ADMIN');
  const teacher = await mk('teacher@t.edu', 'TEACHER');
  const other = await mk('other@t.edu', 'TEACHER');
  const s1 = await mk('s1@t.edu', 'STUDENT', { studentProfile: { create: { facultyNumber: 'F1' } } });
  const s2 = await mk('s2@t.edu', 'STUDENT', { studentProfile: { create: { facultyNumber: 'F2' } } });
  const s3 = await mk('s3@t.edu', 'STUDENT', { studentProfile: { create: { facultyNumber: 'F3' } } });
  const outsider = await mk('outsider@t.edu', 'STUDENT');
  const course = await prisma.course.create({ data: { code: 'T101', title: 'Test', term: 'T', ownerId: teacher.id, teachers: { create: { teacherId: teacher.id, role: 'OWNER' } } } });
  const course2 = await prisma.course.create({ data: { code: 'T102', title: 'Other', term: 'T', ownerId: other.id, teachers: { create: { teacherId: other.id, role: 'OWNER' } } } });
  const past = new Date(Date.now() - 86400_000);
  for (const s of [s1, s2, s3]) await prisma.enrollment.create({ data: { courseId: course.id, studentId: s.id, validFrom: past } });
  ids = { admin: admin.id, teacher: teacher.id, s1: s1.id, s2: s2.id, s3: s3.id, outsider: outsider.id, course: course.id, course2: course2.id };
});

afterAll(async () => {
  clock.reset();
  await app.close();
});

afterEach(async () => {
  clock.reset();
  await prisma.lesson.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'ENDED', endedAt: new Date() } });
});

describe('E2E-02/03: check-in and the 10-minute rule (server time only)', () => {
  it('PRESENT at exactly 10:00, LATE at 10:00.001, regardless of the client', async () => {
    const t = await login('teacher@t.edu');
    const s1 = await login('s1@t.edu');
    const s2 = await login('s2@t.edu');
    const t0 = Date.now();
    clock.freeze(t0);
    const lesson = await startLesson(t, ids.course);
    expect(lesson.actualStartedAt!.getTime()).toBe(t0);

    // QR opened early (09:59) does not freeze the status (spec 16.4)
    clock.freeze(t0 + 599_000);
    const c1 = await challenge(s1, lesson).expect(201);
    const c2 = await challenge(s2, lesson).expect(201);

    clock.freeze(t0 + 600_000);
    const r1 = await verify(s1, lesson.id, c1.body.challengeId, currentMarker(lesson)).expect(200);
    expect(r1.body.status).toBe('PRESENT');

    clock.freeze(t0 + 600_001);
    const r2 = await verify(s2, lesson.id, c2.body.challengeId, currentMarker(lesson)).expect(200);
    expect(r2.body.status).toBe('LATE');
    expect(r2.body.latenessSeconds).toBe(600);
  });
});

describe('EC-20: marker windows, replay and concurrency', () => {
  it('rejects an expired marker (EC-20-02) and a random marker, accepts the current one', async () => {
    const t = await login('teacher@t.edu');
    const s = await login('s1@t.edu');
    const t0 = Date.now();
    clock.freeze(t0);
    const lesson = await startLesson(t, ids.course);
    const old = currentMarker(lesson);
    clock.freeze(t0 + 45_000); // slot 2
    const c = await challenge(s, lesson).expect(201);
    const now = currentMarker(lesson);
    const res = await verify(s, lesson.id, c.body.challengeId, old === now ? (old + 1) % 587 : old);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toMatch(/MARKER_(EXPIRED|INVALID)/);
    const ok = await verify(s, lesson.id, c.body.challengeId, now).expect(200);
    expect(ok.body.status).toBe('PRESENT');
  });

  it('EC-20-01: previous marker accepted within 2 s only when the attempt began before the boundary', async () => {
    const t = await login('teacher@t.edu');
    const s = await login('s2@t.edu');
    const t0 = Date.now();
    clock.freeze(t0);
    const lesson = await startLesson(t, ids.course);
    clock.freeze(t0 + 19_500);
    const prev = currentMarker(lesson);
    const c = await challenge(s, lesson).expect(201);
    clock.freeze(t0 + 21_500); // 1.5 s after rotation
    const ok = await verify(s, lesson.id, c.body.challengeId, prev).expect(200);
    expect(ok.body.status).toBe('PRESENT');
    const att = await prisma.attendance.findUniqueOrThrow({ where: { id: ok.body.attendanceId } });
    expect(att.graceUsed).toBe(true);
  });

  it('EC-20-05/T07: concurrent verifies create exactly one row', async () => {
    const t = await login('teacher@t.edu');
    const s = await login('s3@t.edu');
    const lesson = await startLesson(t, ids.course);
    const c = await challenge(s, lesson).expect(201);
    const m = currentMarker(lesson);
    const results = await Promise.all(Array.from({ length: 6 }, () => verify(s, lesson.id, c.body.challengeId, m)));
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    results.filter((r) => r.status !== 200).forEach((r) => expect(r.body.error.code).toMatch(/CHALLENGE_USED|CHALLENGE_ATTEMPTS_EXCEEDED|IDEMPOTENCY_IN_PROGRESS/));
    expect(await prisma.attendance.count({ where: { lessonId: lesson.id, studentId: ids.s3 } })).toBe(1);
    // replay with the same challenge returns the stored result, never a duplicate
    const replay = await verify(s, lesson.id, c.body.challengeId, m).expect(200);
    expect(replay.body.alreadyRecorded).toBe(true);
  });

  it('EC-20-08: a challenge is personal and cannot be used by another student', async () => {
    const t = await login('teacher@t.edu');
    const s1 = await login('s1@t.edu');
    const s2 = await login('s2@t.edu');
    const lesson = await startLesson(t, ids.course);
    const c = await challenge(s1, lesson).expect(201);
    const res = await verify(s2, lesson.id, c.body.challengeId, currentMarker(lesson));
    expect(res.body.error.code).toBe('CHALLENGE_NOT_FOUND');
  });

  it('CHALLENGE_EXPIRED after the TTL', async () => {
    const t = await login('teacher@t.edu');
    const s = await login('s1@t.edu');
    const t0 = Date.now();
    clock.freeze(t0);
    const lesson = await startLesson(t, ids.course);
    const c = await challenge(s, lesson).expect(201);
    clock.freeze(t0 + 61_000);
    const res = await verify(s, lesson.id, c.body.challengeId, currentMarker(lesson));
    expect(res.body.error.code).toBe('CHALLENGE_EXPIRED');
  });
});

describe('Device binding: one student, one device', () => {
  it('refuses a student signing in from a device that is not theirs', async () => {
    await login('s3@t.edu'); // binds the first device
    const res = await loginFromUnknownDevice('s3@t.edu');
    expect(res.status).toBe(200);
    expect(res.body.deviceBlocked).toBe(true);
    expect(res.body.code).toBe('DEVICE_NOT_RECOGNISED');
    // A refused login must not issue anything.
    expect(res.body.accessToken).toBeUndefined();
  });

  it('refuses a second account on a device that already belongs to someone', async () => {
    await login('s1@t.edu');
    const res = await http
      .post('/api/auth/login')
      .set('Cookie', deviceCookies['s1@t.edu'])
      .send({ email: 's2@t.edu', password: PASSWORD });
    expect(res.body.deviceBlocked).toBe(true);
    expect(res.body.code).toBe('DEVICE_BOUND_TO_OTHER_ACCOUNT');
  });

  it('does not tie teachers or admins to a device', async () => {
    await login('teacher@t.edu');
    const res = await loginFromUnknownDevice('teacher@t.edu');
    expect(res.status).toBe(200);
    expect(res.body.deviceBlocked).toBeUndefined();
    expect(res.body.accessToken).toBeTruthy();
  });

  it('a blocked login leaves the real device signed in', async () => {
    const phone = await login('s3@t.edu');
    await loginFromUnknownDevice('s3@t.edu');
    await http.get('/api/auth/me').set(auth(phone)).expect(200);
  });
});

describe('E2E-04 / EC-20-06 / T08: one active phone per student', () => {
  it('a new login revokes the old device and its challenges', async () => {
    const t = await login('teacher@t.edu');
    const oldPhone = await login('s2@t.edu');
    const lesson = await startLesson(t, ids.course);
    const c = await challenge(oldPhone, lesson).expect(201);
    const newPhone = await login('s2@t.edu');
    const res = await verify(oldPhone, lesson.id, c.body.challengeId, currentMarker(lesson));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
    await http.get('/api/auth/me').set(auth(oldPhone)).expect(401);
    await http.get('/api/auth/me').set(auth(newPhone)).expect(200);
    const ch = await prisma.attendanceChallenge.findUniqueOrThrow({ where: { id: c.body.challengeId } });
    expect(ch.status).toBe('REVOKED');
  });

  it('teachers may stay signed in on laptop + projector + phone', async () => {
    const a = await login('teacher@t.edu');
    await login('teacher@t.edu');
    await http.get('/api/auth/me').set(auth(a)).expect(200);
  });
});

describe('E2E-05 / T04 / T09 / T10: blocked check-ins', () => {
  it('T04: a forwarded QR does not help a student who is not enrolled', async () => {
    const t = await login('teacher@t.edu');
    const o = await login('outsider@t.edu');
    const lesson = await startLesson(t, ids.course);
    const ctx = await http.get(`/api/join/${lesson.joinToken}/context`).set(auth(o)).expect(200);
    expect(ctx.body.canCheckIn).toBe(false);
    expect(ctx.body.reason).toBe('STUDENT_NOT_ENROLLED');
    const res = await challenge(o, lesson);
    expect(res.body.error.code).toBe('STUDENT_NOT_ENROLLED');
  });

  it('end mid-scan: the open challenge dies and absences are created (spec 4.4)', async () => {
    const t = await login('teacher@t.edu');
    const s = await login('s1@t.edu');
    const lesson = await startLesson(t, ids.course);
    const c = await challenge(s, lesson).expect(201);
    await http.post(`/api/lessons/${lesson.id}/end`).set(auth(t)).expect(200);
    const res = await verify(s, lesson.id, c.body.challengeId, currentMarker(lesson));
    expect(res.body.error.code).toMatch(/CHALLENGE_REVOKED|LESSON_ENDED/);
    expect(await prisma.attendance.count({ where: { lessonId: lesson.id, status: 'ABSENT' } })).toBe(3);
    const join = await http.get(`/api/join/${lesson.joinToken}/context`).set(auth(s)).expect(200);
    expect(join.body.reason).toBe('LESSON_ENDED');
  });

  it('E2E-06/T09: removal needs a reason, keeps history, blocks scanning and is audited', async () => {
    const t = await login('teacher@t.edu');
    const s = await login('s2@t.edu');
    const lesson = await startLesson(t, ids.course);
    const c = await challenge(s, lesson).expect(201);
    await http.post(`/api/lessons/${lesson.id}/attendance/${ids.s2}/remove`).set(auth(t)).send({ reason: '' }).expect(400);
    await http.post(`/api/lessons/${lesson.id}/attendance/${ids.s2}/remove`).set(auth(t)).send({ reason: 'Left the room' }).expect(200);
    const res = await verify(s, lesson.id, c.body.challengeId, currentMarker(lesson));
    expect(res.body.error.code).toMatch(/STUDENT_REMOVED|CHALLENGE_REVOKED/);
    const a = await login('admin@t.edu');
    const audit = await http.get('/api/audit-events?action=attendance.removed').set(auth(a)).expect(200);
    expect(audit.body.items[0]).toMatchObject({ reason: 'Left the room', actorEmail: 'teacher@t.edu' });
    const mine = await http.get('/api/me/attendance').set(auth(s)).expect(200);
    expect(mine.body.items.find((x: any) => x.lessonId === lesson.id).status).toBe('REMOVED_FROM_SESSION');
  });

  it('un-enrolled during the scan: ENROLLMENT_REVOKED, no attendance (EC-20-09)', async () => {
    const t = await login('teacher@t.edu');
    const s = await login('s3@t.edu');
    const lesson = await startLesson(t, ids.course);
    const c = await challenge(s, lesson).expect(201);
    await http.delete(`/api/courses/${ids.course}/enrollments/${ids.s3}`).set(auth(t)).expect(200);
    const res = await verify(s, lesson.id, c.body.challengeId, currentMarker(lesson));
    expect(res.body.error.code).toMatch(/ENROLLMENT_REVOKED|CHALLENGE_REVOKED/);
    expect(await prisma.attendance.count({ where: { lessonId: lesson.id, studentId: ids.s3 } })).toBe(0);
    await http.post(`/api/courses/${ids.course}/enrollments`).set(auth(t)).send({ studentIds: [ids.s3] }).expect(201);
  });
});

describe('Authorization and reports', () => {
  it('a teacher of another course gets 403 and no data', async () => {
    const t = await login('teacher@t.edu');
    const other = await login('other@t.edu');
    const lesson = await startLesson(t, ids.course);
    await http.get(`/api/lessons/${lesson.id}/display-state`).set(auth(other)).expect(403);
    await http.get(`/api/lessons/${lesson.id}/attendance`).set(auth(other)).expect(403);
    await http.get(`/api/teacher/courses/${ids.course}/reports/attendance.xlsx`).set(auth(other)).expect(403);
    const s = await login('s1@t.edu');
    await http.get(`/api/lessons/${lesson.id}/display-state`).set(auth(s)).expect(403);
  });

  it('display-state never leaks the session secret and is not cacheable', async () => {
    const t = await login('teacher@t.edu');
    const lesson = await startLesson(t, ids.course);
    const res = await http.get(`/api/lessons/${lesson.id}/display-state`).set(auth(t)).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(JSON.stringify(res.body)).not.toContain(lesson.sessionSecret!);
    expect(res.body.marker.family).toBe('tag36h11');
  });

  it('teacher downloads a valid XLSX and the download is audited', async () => {
    const t = await login('teacher@t.edu');
    const res = await http.get(`/api/teacher/courses/${ids.course}/reports/attendance.xlsx`).set(auth(t)).buffer(true).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(await prisma.auditLog.count({ where: { action: 'report.exported', targetId: ids.course } })).toBeGreaterThan(0);
  });

  it('starting twice is idempotent: one ACTIVE lesson per course', async () => {
    const t = await login('teacher@t.edu');
    const k = idem();
    const a = await http.post(`/api/courses/${ids.course}/lessons/start-now`).set(auth(t)).set('Idempotency-Key', k).send({ durationMinutes: 90 }).expect(200);
    const b = await http.post(`/api/courses/${ids.course}/lessons/start-now`).set(auth(t)).set('Idempotency-Key', k).send({ durationMinutes: 90 }).expect(200);
    const c = await http.post(`/api/courses/${ids.course}/lessons/start-now`).set(auth(t)).set('Idempotency-Key', idem()).send({ durationMinutes: 90 }).expect(200);
    expect(a.body.id).toBe(b.body.id);
    expect(c.body.id).toBe(a.body.id);
    expect(await prisma.lesson.count({ where: { courseId: ids.course, status: 'ACTIVE' } })).toBe(1);
  });
});
