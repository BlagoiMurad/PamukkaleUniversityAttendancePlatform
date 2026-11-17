import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from './errors';
import type { AuthUser } from './auth-user';

/** Ownership checks (spec 2, 10: "the teacher sees only their own courses"). */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async teacherLink(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true, ownerId: true } });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
    if (course.ownerId === userId) return { isOwner: true, canManageRoster: true };
    const link = await this.prisma.courseTeacher.findUnique({ where: { courseId_teacherId: { courseId, teacherId: userId } } });
    if (!link) return null;
    return { isOwner: link.role === 'OWNER', canManageRoster: link.canManageRoster };
  }

  /** Admin, or a teacher of the course. Students never pass. */
  async assertCourseStaff(user: AuthUser, courseId: string) {
    if (user.role === 'ADMIN') {
      const exists = await this.prisma.course.count({ where: { id: courseId } });
      if (!exists) throw new AppError('NOT_FOUND', 'Course not found');
      return { isOwner: true, canManageRoster: true };
    }
    if (user.role !== 'TEACHER') throw new AppError('FORBIDDEN');
    const link = await this.teacherLink(user.id, courseId);
    if (!link) throw new AppError('FORBIDDEN', 'This is not one of your courses');
    return link;
  }

  async assertLessonStaff(user: AuthUser, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new AppError('LESSON_NOT_FOUND', 'Lesson not found');
    await this.assertCourseStaff(user, lesson.courseId);
    return lesson;
  }

  /** IDs of courses a teacher may access. */
  async teacherCourseIds(userId: string) {
    const [owned, linked] = await Promise.all([
      this.prisma.course.findMany({ where: { ownerId: userId }, select: { id: true } }),
      this.prisma.courseTeacher.findMany({ where: { teacherId: userId }, select: { courseId: true } }),
    ]);
    return [...new Set([...owned.map((c) => c.id), ...linked.map((c) => c.courseId)])];
  }
}
