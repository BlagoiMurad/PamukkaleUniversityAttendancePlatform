import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthUser } from '../common/auth-user';
import { CoursesService } from './courses.service';

export const courseSchema = z.object({
  code: z.string().trim().min(2).max(30),
  title: z.string().trim().min(2).max(200),
  term: z.string().trim().min(2).max(40),
  faculty: z.string().trim().max(120).optional().nullable(),
  ownerId: z.string().uuid().optional(),
});
const coursePatchSchema = courseSchema.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() });
const enrollSchema = z.object({
  studentIds: z.array(z.string().uuid()).max(2000).optional(),
  // e-mails, faculty numbers or university IDs pasted by the teacher
  identifiers: z.array(z.string().trim().min(1).max(200)).max(2000).optional(),
});
const teacherSchema = z.object({ teacherId: z.string().uuid(), role: z.enum(['CO_TEACHER', 'ASSISTANT']).default('CO_TEACHER'), canManageRoster: z.boolean().default(true) });

@ApiTags('courses')
@Controller()
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get('courses')
  list(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('status') status?: string, @Query('teacherId') teacherId?: string) {
    return this.courses.list(user, { q, status, teacherId });
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('courses')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(courseSchema)) body: z.infer<typeof courseSchema>, @ReqMeta() meta: RequestMeta) {
    return this.courses.create(user, body, meta);
  }

  @Get('courses/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.courses.get(user, id);
  }

  @Roles('ADMIN', 'TEACHER')
  @Patch('courses/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(coursePatchSchema)) body: z.infer<typeof coursePatchSchema>, @ReqMeta() meta: RequestMeta) {
    return this.courses.update(user, id, body, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('courses/:id/enrollments')
  enrollments(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('includeWithdrawn') includeWithdrawn?: string) {
    return this.courses.enrollments(user, id, includeWithdrawn === 'true');
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('courses/:id/enrollments')
  enroll(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(enrollSchema)) body: z.infer<typeof enrollSchema>, @ReqMeta() meta: RequestMeta) {
    return this.courses.enroll(user, id, body, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('courses/:id/enrollments/:studentId')
  unenroll(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string, @ReqMeta() meta: RequestMeta) {
    return this.courses.unenroll(user, id, studentId, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @Post('courses/:id/teachers')
  addTeacher(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(teacherSchema)) body: z.infer<typeof teacherSchema>, @ReqMeta() meta: RequestMeta) {
    return this.courses.addTeacher(user, id, body, meta);
  }

  @Roles('ADMIN', 'TEACHER')
  @Delete('courses/:id/teachers/:teacherId')
  removeTeacher(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('teacherId', ParseUUIDPipe) teacherId: string, @ReqMeta() meta: RequestMeta) {
    return this.courses.removeTeacher(user, id, teacherId, meta);
  }

  /** Central student directory for picking students (teachers cannot edit global profiles). */
  @Roles('ADMIN', 'TEACHER')
  @Get('directory/students')
  searchStudents(
    @Query('q') q = '',
    @Query('take') take?: string,
    @Query('year') year?: string,
    @Query('programme') programme?: string,
  ) {
    const parsedYear = year !== undefined && year !== '' ? Number(year) : undefined;
    return this.courses.searchStudents(q, Math.min(Number(take) || 50, 200), {
      year: Number.isInteger(parsedYear) ? parsedYear : undefined,
      programme: programme?.trim() || undefined,
    });
  }

  @Roles('ADMIN', 'TEACHER')
  @Get('directory/teachers')
  searchTeachers(@Query('q') q = '') {
    return this.courses.searchTeachers(q);
  }
}
