import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthUser } from '../common/auth-user';
import { UsersService } from './users.service';
import { ImportService, type UploadedSpreadsheet } from './import.service';
import { AppError } from '../common/errors';

const opt = (s: z.ZodString) => s.optional().nullable();
export const createUserSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(2).max(200),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT']),
  universityId: opt(z.string().trim().max(50)),
  facultyNumber: opt(z.string().trim().max(50)),
  programme: opt(z.string().trim().max(120)),
  year: z.number().int().min(1).max(10).optional().nullable(),
  group: opt(z.string().trim().max(40)),
  department: opt(z.string().trim().max(120)),
  faculty: opt(z.string().trim().max(120)),
  title: opt(z.string().trim().max(60)),
  sendInvite: z.boolean().optional(),
});
const updateUserSchema = z.object({
  email: z.string().trim().email().max(200).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  role: z.enum(['ADMIN', 'TEACHER', 'STUDENT']).optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  universityId: opt(z.string().trim().max(50)),
  preferredName: opt(z.string().trim().max(100)),
  phone: opt(z.string().trim().max(40)),
  studentProfile: z
    .object({ facultyNumber: opt(z.string().trim().max(50)), programme: opt(z.string().trim().max(120)), year: z.number().int().min(1).max(10).optional().nullable(), group: opt(z.string().trim().max(40)) })
    .optional(),
  teacherProfile: z.object({ department: opt(z.string().trim().max(120)), faculty: opt(z.string().trim().max(120)), title: opt(z.string().trim().max(60)) }).optional(),
});

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin/users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly imports: ImportService,
  ) {}

  @Get()
  list(@Query('q') q?: string, @Query('role') role?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.users.list({ q, role, status, page: Number(page) || 1, pageSize: Number(pageSize) || 25 });
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body(new ZodPipe(createUserSchema)) body: z.infer<typeof createUserSchema>, @ReqMeta() meta: RequestMeta) {
    return this.users.create(body, actor, meta);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Patch(':id')
  update(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(updateUserSchema)) body: z.infer<typeof updateUserSchema>, @ReqMeta() meta: RequestMeta) {
    return this.users.update(id, body, actor, meta);
  }

  @HttpCode(200)
  @Post(':id/revoke-sessions')
  revoke(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.revokeSessions(id, actor, meta);
  }

  @HttpCode(200)
  @Post(':id/resend-invite')
  resend(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    return this.users.resendInvite(id, actor, meta);
  }

  /**
   * Bulk import of students from the registry's own spreadsheet. Admin only: it creates accounts
   * and hands out passwords, which is not something a teacher should be able to do.
   */
  @HttpCode(200)
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  previewImport(@UploadedFile() file: UploadedSpreadsheet, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    if (!file) throw new AppError('VALIDATION_FAILED', 'Attach an .xlsx or .csv file');
    return this.imports.preview(file, user, meta);
  }

  @HttpCode(200)
  @Post('import/:batchId/commit')
  commitImport(@Param('batchId', ParseUUIDPipe) batchId: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.imports.commit(batchId, user, meta);
  }
}
