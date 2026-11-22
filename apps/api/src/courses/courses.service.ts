import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../common/access.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ClockService } from '../common/clock.service';
import { AppError } from '../common/errors';
import type { AuthUser } from '../common/auth-user';
import type { RequestMeta } from '../common/decorators';

const studentSelect = {
  id: true,
  name: true,
  email: true,
  universityId: true,
  status: true,
  studentProfile: { select: { facultyNumber: true, programme: true, year: true, group: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  async list(user: AuthUser, f: { q?: string; status?: string; teacherId?: string }) {
    const where: Prisma.CourseWhereInput = {};
    if (f.status === 'ACTIVE' || f.status === 'ARCHIVED') where.status = f.status;
    if (f.q) where.OR = [{ code: { contains: f.q, mode: 'insensitive' } }, { title: { contains: f.q, mode: 'insensitive' } }];
    if (user.role === 'TEACHER') where.id = { in: await this.access.teacherCourseIds(user.id) };
    if (user.role === 'STUDENT') where.enrollments = { some: { studentId: user.id, state: 'ACTIVE' } };
    if (user.role === 'ADMIN' && f.teacherId) where.OR = [{ ownerId: f.teacherId }, { teachers: { some: { teacherId: f.teacherId } } }];

    const courses = await this.prisma.course.findMany({
      where,
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
      include: {
        owner: { select: { id: true, name: true } },
        teachers: { include: { teacher: { select: { id: true, name: true } } } },
        _count: { select: { enrollments: { where: { state: 'ACTIVE' } }, lessons: true } },
        lessons: { where: { status: 'ACTIVE' }, select: { id: true, startsAt: true } },
      },
      take: 500,
    });
    return {
      items: courses.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        term: c.term,
        faculty: c.faculty,
        status: c.status,
        owner: c.owner,
        teachers: c.teachers.map((t) => ({ ...t.teacher, role: t.role })),
        studentCount: c._count.enrollments,
        lessonCount: c._count.lessons,
        activeLessonId: c.lessons[0]?.id ?? null,
      })),
    };
  }

  async create(user: AuthUser, body: { code: string; title: string; term: string; faculty?: string | null; ownerId?: string }, meta: RequestMeta) {
    if (user.role === 'TEACHER' && !(await this.settings.get()).teacherCanCreateCourses) {
      throw new AppError('FORBIDDEN', 'Course creation is reserved for administrators');
    }
    const ownerId = user.role === 'ADMIN' && body.ownerId ? body.ownerId : user.id;
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner || owner.role === 'STUDENT') throw new AppError('VALIDATION_FAILED', 'Owner must be a teacher or admin');
    try {
      const course = await this.prisma.course.create({
        data: {
          code: body.code.toUpperCase(),
          title: body.title,
          term: body.term,
          faculty: body.faculty ?? null,
          ownerId,
          teachers: owner.role === 'TEACHER' ? { create: { teacherId: ownerId, role: 'OWNER' } } : undefined,
        },
      });
      await this.audit.log({ actor: user, action: 'course.created', targetType: 'course', targetId: course.id, metadata: { code: course.code, term: course.term }, ip: meta.ip });
      return course;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'A course with this code already exists in this term');
      throw e;
    }
  }

  async get(user: AuthUser, id: string) {
    if (user.role === 'STUDENT') {
      const enrolled = await this.prisma.enrollment.findFirst({ where: { courseId: id, studentId: user.id } });
      if (!enrolled) throw new AppError('FORBIDDEN');
    } else {
      await this.access.assertCourseStaff(user, id);
    }
    const course = await this.prisma.course.findUniqueOrThrow({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        teachers: { include: { teacher: { select: { id: true, name: true, email: true } } } },
        _count: { select: { enrollments: { where: { state: 'ACTIVE' } } } },
      },
    });
    const link = user.role === 'TEACHER' ? await this.access.teacherLink(user.id, id) : null;
    return {
      ...course,
      teachers: course.teachers.map((t) => ({ ...t.teacher, role: t.role, canManageRoster: t.canManageRoster })),
      studentCount: course._count.enrollments,
      permissions: {
        manage: user.role === 'ADMIN' || !!link,
        manageRoster: user.role === 'ADMIN' || !!link?.canManageRoster,
        manageTeachers: user.role === 'ADMIN' || !!link?.isOwner,
      },
    };
  }

  async update(user: AuthUser, id: string, body: any, meta: RequestMeta) {
    const link = await this.access.assertCourseStaff(user, id);
    if (user.role !== 'ADMIN' && !link.isOwner) throw new AppError('FORBIDDEN', 'Only the course owner can edit the course');
    if (body.ownerId && user.role !== 'ADMIN') delete body.ownerId;
    const course = await this.prisma.course.update({
      where: { id },
      data: { ...body, ...(body.code ? { code: body.code.toUpperCase() } : {}) },
    });
    await this.audit.log({ actor: user, action: 'course.updated', targetType: 'course', targetId: id, metadata: { fields: Object.keys(body) }, ip: meta.ip });
    return course;
  }

  async enrollments(user: AuthUser, courseId: string, includeWithdrawn: boolean) {
    await this.access.assertCourseStaff(user, courseId);
    const rows = await this.prisma.enrollment.findMany({
      where: { courseId, ...(includeWithdrawn ? {} : { state: 'ACTIVE' }) },
      include: { student: { select: studentSelect } },
      orderBy: { student: { name: 'asc' } },
    });
    return { items: rows.map((r) => ({ id: r.id, state: r.state, validFrom: r.validFrom, validTo: r.validTo, student: r.student })) };
  }

  async enroll(user: AuthUser, courseId: string, body: { studentIds?: string[]; identifiers?: string[] }, meta: RequestMeta) {
    const link = await this.access.assertCourseStaff(user, courseId);
    if (!link.canManageRoster) throw new AppError('FORBIDDEN', 'You have no roster rights for this course');
    const ids = new Set(body.studentIds ?? []);
    const notFound: string[] = [];
    if (body.identifiers?.length) {
      const ident = [...new Set(body.identifiers.map((s) => s.trim()).filter(Boolean))];
      const found = await this.prisma.user.findMany({
        where: {
          role: 'STUDENT',
          OR: [
            { email: { in: ident.map((s) => s.toLowerCase()) } },
            { universityId: { in: ident } },
            { studentProfile: { facultyNumber: { in: ident } } },
          ],
        },
        select: { id: true, email: true, universityId: true, studentProfile: { select: { facultyNumber: true } } },
      });
      for (const s of ident) {
        const hit = found.find((u) => u.email === s.toLowerCase() || u.universityId === s || u.studentProfile?.facultyNumber === s);
        if (hit) ids.add(hit.id);
        else notFound.push(s);
      }
    }
    const students = await this.prisma.user.findMany({ where: { id: { in: [...ids] }, role: 'STUDENT' }, select: { id: true } });
    const now = this.clock.now();
    let added = 0;
    let already = 0;
    for (const s of students) {
      const active = await this.prisma.enrollment.findFirst({ where: { courseId, studentId: s.id, state: 'ACTIVE' } });
      if (active) {
        already++;
        continue;
      }
      await this.prisma.enrollment.create({ data: { courseId, studentId: s.id, validFrom: now } });
      added++;
    }
    await this.audit.log({ actor: user, action: 'course.students_enrolled', targetType: 'course', targetId: courseId, metadata: { added, already, notFound: notFound.length }, ip: meta.ip });
    return { added, alreadyEnrolled: already, notFound };
  }

  async unenroll(user: AuthUser, courseId: string, studentId: string, meta: RequestMeta) {
    const link = await this.access.assertCourseStaff(user, courseId);
    if (!link.canManageRoster) throw new AppError('FORBIDDEN', 'Removing students needs delegated roster rights');
    const now = this.clock.now();
    const result = await this.prisma.$transaction(async (tx) => {
      const r = await tx.enrollment.updateMany({ where: { courseId, studentId, state: 'ACTIVE' }, data: { state: 'WITHDRAWN', validTo: now } });
      // Any running scan attempt for this course is cancelled immediately (EC-20-09).
      await tx.attendanceChallenge.updateMany({ where: { userId: studentId, status: 'ACTIVE', lesson: { courseId } }, data: { status: 'REVOKED' } });
      return r;
    });
    if (!result.count) throw new AppError('NOT_FOUND', 'Student is not enrolled');
    await this.audit.log({ actor: user, action: 'course.student_unenrolled', targetType: 'course', targetId: courseId, metadata: { studentId }, ip: meta.ip });
    return { ok: true };
  }

  async addTeacher(user: AuthUser, courseId: string, body: { teacherId: string; role: 'CO_TEACHER' | 'ASSISTANT'; canManageRoster: boolean }, meta: RequestMeta) {
    const link = await this.access.assertCourseStaff(user, courseId);
    if (user.role !== 'ADMIN' && !link.isOwner) throw new AppError('FORBIDDEN', 'Only the owner can add teachers');
    const t = await this.prisma.user.findUnique({ where: { id: body.teacherId } });
    if (!t || t.role !== 'TEACHER') throw new AppError('VALIDATION_FAILED', 'User is not a teacher');
    await this.prisma.courseTeacher.upsert({
      where: { courseId_teacherId: { courseId, teacherId: body.teacherId } },
      create: { courseId, teacherId: body.teacherId, role: body.role, canManageRoster: body.canManageRoster },
      update: { role: body.role, canManageRoster: body.canManageRoster },
    });
    await this.audit.log({ actor: user, action: 'course.teacher_added', targetType: 'course', targetId: courseId, metadata: body, ip: meta.ip });
    return { ok: true };
  }

  async removeTeacher(user: AuthUser, courseId: string, teacherId: string, meta: RequestMeta) {
    const link = await this.access.assertCourseStaff(user, courseId);
    if (user.role !== 'ADMIN' && !link.isOwner) throw new AppError('FORBIDDEN');
    const course = await this.prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    if (course.ownerId === teacherId) throw new AppError('CONFLICT', 'Transfer ownership before removing the owner');
    await this.prisma.courseTeacher.deleteMany({ where: { courseId, teacherId } });
    await this.audit.log({ actor: user, action: 'course.teacher_removed', targetType: 'course', targetId: courseId, metadata: { teacherId }, ip: meta.ip });
    return { ok: true };
  }

  /**
   * Student picker behind "add students to a course": free-text search plus the
   * year / programme filters the teacher narrows the list with. `years` and
   * `programmes` are the facets the UI renders its filter dropdowns from, so they
   * describe the whole directory and are deliberately not narrowed by the filters.
   */
  async searchStudents(q: string, take: number, filters: { year?: number; programme?: string } = {}) {
    const term = q.trim();
    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
      status: { in: ['ACTIVE', 'INVITED'] },
      ...(filters.year !== undefined || filters.programme
        ? {
            studentProfile: {
              ...(filters.year !== undefined ? { year: filters.year } : {}),
              ...(filters.programme ? { programme: { equals: filters.programme, mode: 'insensitive' as const } } : {}),
            },
          }
        : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
              { universityId: { contains: term } },
              { studentProfile: { facultyNumber: { contains: term } } },
              { studentProfile: { group: { equals: term, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [items, total, facets] = await Promise.all([
      this.prisma.user.findMany({ where, select: studentSelect, orderBy: { name: 'asc' }, take }),
      this.prisma.user.count({ where }),
      this.prisma.studentProfile.findMany({
        where: { user: { role: 'STUDENT', status: { in: ['ACTIVE', 'INVITED'] } } },
        select: { year: true, programme: true },
      }),
    ]);

    const years = [...new Set(facets.map((f) => f.year).filter((y): y is number => y !== null))].sort((a, b) => a - b);
    const programmes = [...new Set(facets.map((f) => f.programme).filter((p): p is string => !!p))].sort();
    return { items, total, truncated: total > items.length, years, programmes };
  }

  async searchTeachers(q: string) {
    const items = await this.prisma.user.findMany({
      where: { role: 'TEACHER', status: { in: ['ACTIVE', 'INVITED'] }, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, name: true, email: true, teacherProfile: { select: { department: true } } },
      orderBy: { name: 'asc' },
      take: 30,
    });
    return { items };
  }
}
