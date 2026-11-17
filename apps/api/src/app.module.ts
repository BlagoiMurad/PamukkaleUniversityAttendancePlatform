import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.service';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { ClockService } from './common/clock.service';
import { AccessService } from './common/access.service';
import { IdempotencyService } from './common/idempotency.service';
import { SettingsService } from './settings/settings.service';
import { SettingsController } from './settings/settings.controller';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { RealtimeService } from './realtime/realtime.service';
import { RealtimeGateway } from './realtime/realtime.gateway';
import { MailService } from './mail/mail.service';
import { PasswordService } from './auth/password.service';
import { TokenService } from './auth/token.service';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';
import { MeController } from './me/me.controller';
import { CoursesService } from './courses/courses.service';
import { CoursesController } from './courses/courses.controller';
import { LessonsService } from './lessons/lessons.service';
import { LessonsController } from './lessons/lessons.controller';
import { AttendanceService } from './attendance/attendance.service';
import { HealthController } from './health/health.controller';
import { JobsService } from './jobs/jobs.service';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { RequestsService } from './requests/requests.service';
import { RequestsController } from './requests/requests.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 600 }], skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_IN_TESTS !== '1' }),
    ScheduleModule.forRoot(),
    PrismaModule,
  ],
  controllers: [
    AuthController,
    MeController,
    UsersController,
    CoursesController,
    LessonsController,
    SettingsController,
    AuditController,
    HealthController,
    ReportsController,
    RequestsController,
  ],
  providers: [
    ClockService,
    AccessService,
    IdempotencyService,
    SettingsService,
    AuditService,
    RealtimeService,
    RealtimeGateway,
    MailService,
    PasswordService,
    TokenService,
    AuthService,
    UsersService,
    CoursesService,
    LessonsService,
    AttendanceService,
    JobsService,
    ReportsService,
    RequestsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
