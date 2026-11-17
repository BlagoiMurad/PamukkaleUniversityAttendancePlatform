/* Demo data for local development and pilots. Safe to re-run: it upserts by e-mail / course code. */
import { PrismaClient, AttendanceStatus } from '@prisma/client';
import { hash, Algorithm } from '@node-rs/argon2';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || 'Demo!Pass2026';

const FIRST = ['Ayşe', 'Mehmet', 'Elif', 'Can', 'Zeynep', 'Emre', 'Ivan', 'Maria', 'Georgi', 'Elena', 'Deniz', 'Burak', 'Selin', 'Nikolay', 'Petya', 'Kaan', 'Ece', 'Dimitar', 'Yusuf', 'Irem', 'Stefan', 'Gizem', 'Martin', 'Defne', 'Ali', 'Teodora', 'Oğuz', 'Viktoria', 'Mert', 'Lale'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Petrov', 'Ivanova', 'Georgiev', 'Dimitrova', 'Arslan', 'Doğan', 'Kılıç', 'Aydın', 'Todorov', 'Stoyanova', 'Öztürk', 'Koç', 'Nikolov', 'Kurt', 'Özdemir', 'Angelov', 'Polat', 'Popov', 'Erdem', 'Aksoy', 'Hristova', 'Güneş', 'Marinova', 'Bulut', 'Tekin'];

async function main() {
  const passwordHash = await hash(PASSWORD, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const base = { passwordHash, status: 'ACTIVE' as const, emailVerified: true, mustChangePassword: false };

  const admin = await prisma.user.upsert({
    where: { email: 'admin@pau.edu.tr' },
    update: {},
    create: { ...base, email: 'admin@pau.edu.tr', name: 'System Administrator', role: 'ADMIN', universityId: 'A-0001' },
  });
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@pau.edu.tr' },
    update: {},
    create: { ...base, email: 'teacher@pau.edu.tr', name: 'Dr. Selim Arslan', role: 'TEACHER', universityId: 'T-0001', teacherProfile: { create: { department: 'Computer Engineering', faculty: 'Engineering', title: 'Assoc. Prof.' } } },
  });
  const teacher2 = await prisma.user.upsert({
    where: { email: 'teacher2@pau.edu.tr' },
    update: {},
    create: { ...base, email: 'teacher2@pau.edu.tr', name: 'Dr. Elena Petrova', role: 'TEACHER', universityId: 'T-0002', teacherProfile: { create: { department: 'Mathematics', faculty: 'Science', title: 'Dr.' } } },
  });

  const students = [];
  for (let i = 0; i < 30; i++) {
    const n = String(i + 1).padStart(2, '0');
    const email = i === 0 ? 'student@pau.edu.tr' : `student${n}@pau.edu.tr`;
    students.push(
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          ...base,
          email,
          name: `${FIRST[i]} ${LAST[i]}`,
          role: 'STUDENT',
          universityId: `S-2026${n}`,
          studentProfile: { create: { facultyNumber: `2026${String(1000 + i)}`, programme: 'Computer Engineering', year: 2 + (i % 3), group: i % 2 ? 'B' : 'A' } },
        },
      }),
    );
  }

  const term = '2026-Fall';
  const course1 = await prisma.course.upsert({
    where: { code_term: { code: 'CENG301', term } },
    update: {},
    create: { code: 'CENG301', title: 'Software Engineering', term, faculty: 'Engineering', ownerId: teacher.id, teachers: { create: { teacherId: teacher.id, role: 'OWNER' } } },
  });
  const course2 = await prisma.course.upsert({
    where: { code_term: { code: 'CENG315', term } },
    update: {},
    create: { code: 'CENG315', title: 'Computer Networks', term, faculty: 'Engineering', ownerId: teacher.id, teachers: { create: [{ teacherId: teacher.id, role: 'OWNER' }, { teacherId: teacher2.id, role: 'CO_TEACHER' }] } },
  });
  const course3 = await prisma.course.upsert({
    where: { code_term: { code: 'MATH201', term } },
    update: {},
    create: { code: 'MATH201', title: 'Linear Algebra', term, faculty: 'Science', ownerId: teacher2.id, teachers: { create: { teacherId: teacher2.id, role: 'OWNER' } } },
  });

  const enrollFrom = new Date(Date.now() - 60 * 86400_000);
  for (const [course, list] of [
    [course1, students],
    [course2, students.slice(0, 20)],
    [course3, students.slice(10)],
  ] as const) {
    for (const s of list) {
      const has = await prisma.enrollment.findFirst({ where: { courseId: course.id, studentId: s.id } });
      if (!has) await prisma.enrollment.create({ data: { courseId: course.id, studentId: s.id, validFrom: enrollFrom } });
    }
  }

  // Past lessons with realistic attendance for history, statistics and reports
  const existingPast = await prisma.lesson.count({ where: { courseId: course1.id, status: { in: ['ENDED', 'LOCKED'] } } });
  if (!existingPast) {
    const policy = (await prisma.attendancePolicy.findFirst({ orderBy: { version: 'desc' } })) ?? (await prisma.attendancePolicy.create({ data: { lateAfterSeconds: 600, graceMs: 2000 } }));
    for (const [course, list] of [
      [course1, students],
      [course2, students.slice(0, 20)],
    ] as const) {
      for (let w = 6; w >= 1; w--) {
        const start = new Date();
        start.setUTCDate(start.getUTCDate() - w * 7 + (course === course1 ? 0 : 2));
        start.setUTCHours(7, 0, 0, 0);
        const end = new Date(start.getTime() + 90 * 60_000);
        const lesson = await prisma.lesson.create({
          data: {
            courseId: course.id,
            teacherId: teacher.id,
            title: `Week ${7 - w}`,
            room: course === course1 ? 'B-204' : 'Lab 3',
            startsAt: start,
            scheduledEndAt: end,
            actualStartedAt: start,
            endedAt: end,
            lockedAt: w > 3 ? end : null,
            status: w > 3 ? 'LOCKED' : 'ENDED',
            attendancePolicyVersion: policy.version,
            lateAfterSeconds: 600,
            graceMs: 2000,
          },
        });
        for (let i = 0; i < list.length; i++) {
          const r = (i * 7 + w * 13) % 20;
          const status: AttendanceStatus = r < 13 ? 'PRESENT' : r < 16 ? 'LATE' : r < 17 ? 'MANUAL_PRESENT' : 'ABSENT';
          const offset = status === 'PRESENT' ? 60 + ((i * 17) % 500) : status === 'LATE' ? 620 + ((i * 31) % 900) : 300;
          const a = await prisma.attendance.create({
            data: {
              lessonId: lesson.id,
              studentId: list[i].id,
              status,
              verifiedAt: status === 'ABSENT' ? null : new Date(start.getTime() + offset * 1000),
              latenessSeconds: status === 'ABSENT' ? null : offset,
              evidenceType: status === 'ABSENT' ? 'SYSTEM' : status === 'MANUAL_PRESENT' ? 'MANUAL' : 'APRILTAG',
              manuallyCorrected: status === 'MANUAL_PRESENT',
              lastReason: status === 'MANUAL_PRESENT' ? 'Camera not available, verified in class' : null,
              policyVersion: policy.version,
            },
          });
          await prisma.attendanceEvent.create({
            data: {
              attendanceId: a.id,
              actorId: status === 'MANUAL_PRESENT' ? teacher.id : status === 'ABSENT' ? null : list[i].id,
              action: status === 'ABSENT' ? 'ABSENT_ON_END' : status === 'MANUAL_PRESENT' ? 'MANUAL_CORRECTION' : 'VERIFIED',
              newStatus: status,
              reason: status === 'MANUAL_PRESENT' ? 'Camera not available, verified in class' : null,
            },
          });
        }
      }
    }
    // An upcoming draft lesson
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(7, 0, 0, 0);
    await prisma.lesson.create({ data: { courseId: course1.id, teacherId: teacher.id, title: 'Week 7', room: 'B-204', startsAt: next, scheduledEndAt: new Date(next.getTime() + 90 * 60_000) } });
  }

  console.log('Seed complete. Demo accounts (password: %s):', PASSWORD);
  console.log('  admin@pau.edu.tr   teacher@pau.edu.tr   teacher2@pau.edu.tr   student@pau.edu.tr, student02 … student30@pau.edu.tr');
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
