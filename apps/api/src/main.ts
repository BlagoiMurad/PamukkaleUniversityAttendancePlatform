import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function main() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app);
  const doc = new DocumentBuilder()
    .setTitle('University Attendance Platform API')
    .setDescription('QR join + rotating AprilTag 36h11 verification. All errors use { error: { code, message } }.')
    .setVersion('1.0')
    .addCookieAuth('pau_at')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://localhost:${port}/api (docs: /api/docs)`, 'Bootstrap');
}
main();
