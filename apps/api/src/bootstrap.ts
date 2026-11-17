import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'crypto';

/** Shared HTTP setup for main.ts and the e2e tests. */
export function configureApp(app: INestApplication) {
  const express = app.getHttpAdapter().getInstance();
  if (process.env.TRUST_PROXY !== 'false') express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.setGlobalPrefix('api');
  // JSON API: CSP is set by the web app; Swagger UI needs inline assets.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.use((req: any, res: any, next: () => void) => {
    const incoming = req.headers['x-request-id'];
    req.requestId = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
  });
  app.enableShutdownHooks();
}
