import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

export interface MailJob {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Transactional e-mail. Uses a BullMQ queue when REDIS_URL is set (retries + backoff), otherwise sends
 * in-process. Without SMTP_URL, messages are written to apps/api/.outbox for local development.
 * Mail bodies are never logged (they may contain one-time links).
 */
@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Mail');
  private transporter: nodemailer.Transporter | null = null;
  private queue: Queue<MailJob> | null = null;
  private worker: Worker<MailJob> | null = null;
  private connection: IORedis | null = null;

  onModuleInit() {
    if (process.env.SMTP_URL) this.transporter = nodemailer.createTransport(process.env.SMTP_URL);
    if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
      this.connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
      this.queue = new Queue<MailJob>('mail', { connection: this.connection });
      this.worker = new Worker<MailJob>('mail', (job) => this.deliver(job.data), { connection: this.connection });
      this.worker.on('failed', (job, err) => this.logger.warn(`mail job ${job?.id} failed: ${err.message}`));
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async send(job: MailJob) {
    if (this.queue) {
      await this.queue.add('send', job, { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000 });
      return;
    }
    // fire-and-forget so API latency does not depend on SMTP
    this.deliver(job).catch((e) => this.logger.warn(`mail delivery failed: ${e.message}`));
  }

  private async deliver(job: MailJob) {
    const from = process.env.MAIL_FROM || 'Attendance Platform <no-reply@example.edu>';
    if (this.transporter) {
      await this.transporter.sendMail({ from, ...job });
      this.logger.log(`mail sent (subject="${job.subject}")`);
      return;
    }
    if (process.env.NODE_ENV === 'test') return;
    const dir = join(process.cwd(), '.outbox');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${Date.now()}-${job.to.replace(/[^a-z0-9@.]/gi, '_')}.txt`);
    writeFileSync(file, `From: ${from}\nTo: ${job.to}\nSubject: ${job.subject}\n\n${job.text}\n`);
    this.logger.log(`dev mail written to .outbox (subject="${job.subject}")`);
  }
}
