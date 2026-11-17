import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';

/** Uniform error body: { error: { code, message, details }, requestId } */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    if (!res || typeof res.status !== 'function') return; // websocket context
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Unexpected server error';
    let details: unknown;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'RATE_LIMITED';
      message = 'Too many requests, please slow down';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      if (body && typeof body === 'object' && body.code) {
        code = body.code;
        message = body.message;
        details = body.details;
      } else {
        code = status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : status === 401 ? 'LOGIN_REQUIRED' : 'HTTP_' + status;
        message = typeof body === 'string' ? body : body?.message ?? exception.message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Not found';
    } else {
      this.logger.error(`[${req?.requestId}] ${(exception as Error)?.stack ?? exception}`);
    }
    res.status(status).json({ error: { code, message, details }, requestId: req?.requestId });
  }
}
