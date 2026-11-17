import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { ReportsService } from './reports.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function send(res: Response, out: { buffer: any; filename: string }) {
  res.setHeader('Content-Type', XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store'); // never cached by a shared CDN (spec 22.4)
  res.send(Buffer.from(out.buffer));
}

/** Teacher Excel reports (spec 22). Every download is authorised per course and audited. */
@ApiTags('reports')
@Roles('TEACHER', 'ADMIN')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('teacher')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('courses/:courseId/reports/summary')
  summary(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.courseSummary(user, courseId, from, to);
  }

  @Get('courses/:courseId/reports/attendance.xlsx')
  async course(@CurrentUser() user: AuthUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Query('from') from: string, @Query('to') to: string, @ReqMeta() meta: RequestMeta, @Res() res: Response) {
    send(res, await this.reports.courseXlsx(user, courseId, from, to, meta));
  }

  @Get('reports/weekly')
  weekly(@CurrentUser() user: AuthUser, @Query('weekStart') weekStart?: string, @Query('teacherId') teacherId?: string) {
    return this.reports.weeklySummary(user, weekStart, teacherId);
  }

  @Get('reports/weekly.xlsx')
  async weeklyXlsx(@CurrentUser() user: AuthUser, @Query('weekStart') weekStart: string, @Query('teacherId') teacherId: string, @ReqMeta() meta: RequestMeta, @Res() res: Response) {
    send(res, await this.reports.weeklyXlsx(user, weekStart, teacherId, meta));
  }

  @Get(['sessions/:id/report.xlsx', 'lessons/:id/report.xlsx'])
  async lesson(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta, @Res() res: Response) {
    send(res, await this.reports.lessonXlsx(user, id, meta));
  }
}
