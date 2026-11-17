import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { AppError } from '../common/errors';
import { ImportsService } from './imports.service';

@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin/users/import')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  list() {
    return this.imports.list();
  }

  @Get('template.csv')
  template(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="users-template.csv"');
    res.send('﻿' + this.imports.template('csv'));
  }

  @Post('preview')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  preview(@CurrentUser() user: AuthUser, @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined, @Body() body: { role?: string; courseCode?: string }) {
    if (!file) throw new AppError('VALIDATION_FAILED', 'Attach a file');
    return this.imports.preview(user, file, { role: body.role || undefined, courseCode: body.courseCode?.trim() || undefined });
  }

  @Post(':id/commit')
  @HttpCode(200)
  commit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { sendInvites?: boolean }, @ReqMeta() meta: RequestMeta) {
    return this.imports.commit(user, id, { sendInvites: body?.sendInvites !== false }, meta);
  }
}
