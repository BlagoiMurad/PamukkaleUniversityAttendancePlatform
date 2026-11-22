import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { parse as parseCsv } from 'papaparse';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';
import { AppError } from '../common/errors';
import { normaliseEmail, sha256 } from '../common/util';
import type { RequestMeta } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';

/** Header spellings we accept, so a registry export does not have to be re-typed. */
const COLUMNS: Record<string, string[]> = {
  email: ['email', 'e-mail', 'mail', 'имейл', 'и-мейл', 'eposta', 'e-posta'],
  name: ['name', 'full name', 'student', 'име', 'имена', 'ad', 'adi', 'ad soyad'],
  facultyNumber: ['faculty number', 'facultynumber', 'fn', 'student number', 'no', 'факултетен номер', 'фн', 'номер', 'ogrenci no', 'numara'],
  programme: ['programme', 'program', 'major', 'специалност', 'bolum', 'bölüm'],
  year: ['year', 'course', 'курс', 'година', 'sinif', 'sınıf'],
  group: ['group', 'група', 'grup'],
  role: ['role', 'роля', 'rol'],
};

/** The bits of a multer upload we use; avoids depending on the global Express.Multer namespace. */
export interface UploadedSpreadsheet {
  originalname?: string;
  mimetype?: string;
  buffer: Buffer;
}

export interface ImportRow {
  rowNumber: number;
  email: string;
  name: string;
  facultyNumber?: string;
  programme?: string;
  year?: number;
  group?: string;
  role: 'STUDENT' | 'TEACHER';
  /** Why this row cannot be imported. Empty means it is good to go. */
  issues: string[];
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  /** Maps the sheet's own header row onto our field names; unknown columns are ignored. */
  private mapHeaders(headers: string[]) {
    const map = new Map<number, string>();
    headers.forEach((raw, i) => {
      const h = String(raw ?? '').trim().toLowerCase();
      if (!h) return;
      for (const [field, aliases] of Object.entries(COLUMNS)) {
        if (aliases.includes(h)) {
          map.set(i, field);
          return;
        }
      }
    });
    return map;
  }

  private async readTable(file: UploadedSpreadsheet): Promise<string[][]> {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.tsv') || file.mimetype === 'text/csv') {
      const text = file.buffer.toString('utf8');
      const out = parseCsv<string[]>(text, { skipEmptyLines: true });
      return out.data as string[][];
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.buffer as any);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new AppError('VALIDATION_FAILED', 'The workbook has no sheets');
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values: string[] = [];
      // ExcelJS row values are 1-based with a leading hole at index 0.
      (row.values as any[]).slice(1).forEach((v, i) => {
        values[i] = v == null ? '' : typeof v === 'object' && 'text' in v ? String((v as any).text) : String(v);
      });
      rows.push(values);
    });
    return rows;
  }

  /** Parses and validates without writing anything, and stores the batch for a later commit. */
  async preview(file: UploadedSpreadsheet, actor: AuthUser, meta: RequestMeta) {
    const table = await this.readTable(file);
    if (table.length < 2) throw new AppError('VALIDATION_FAILED', 'The file needs a header row and at least one student');

    const headerMap = this.mapHeaders(table[0]);
    const fields = new Set(headerMap.values());
    if (!fields.has('email') || !fields.has('name')) {
      throw new AppError('VALIDATION_FAILED', 'The file must have an e-mail column and a name column');
    }

    const seenEmails = new Set<string>();
    const seenNumbers = new Set<string>();
    const rows: ImportRow[] = [];

    for (let r = 1; r < table.length; r++) {
      const raw = table[r];
      if (!raw || raw.every((c) => !String(c ?? '').trim())) continue;
      const get = (field: string) => {
        for (const [i, f] of headerMap) if (f === field) return String(raw[i] ?? '').trim();
        return '';
      };

      const email = normaliseEmail(get('email'));
      const name = get('name');
      const facultyNumber = get('facultyNumber') || undefined;
      const yearRaw = get('year');
      const roleRaw = get('role').toUpperCase();
      const issues: string[] = [];

      if (!email) issues.push('Missing e-mail');
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) issues.push('E-mail does not look valid');
      else if (seenEmails.has(email)) issues.push('Duplicated inside the file');
      if (!name) issues.push('Missing name');
      if (facultyNumber && seenNumbers.has(facultyNumber)) issues.push('Faculty number duplicated inside the file');

      const year = yearRaw ? Number(yearRaw.replace(/[^\d]/g, '')) : undefined;
      if (yearRaw && !Number.isInteger(year)) issues.push('Year is not a number');

      if (email) seenEmails.add(email);
      if (facultyNumber) seenNumbers.add(facultyNumber);

      rows.push({
        rowNumber: r + 1,
        email,
        name,
        facultyNumber,
        programme: get('programme') || undefined,
        year: Number.isInteger(year) ? year : undefined,
        group: get('group') || undefined,
        role: roleRaw === 'TEACHER' ? 'TEACHER' : 'STUDENT',
        issues,
      });
    }

    // Clashes with people already in the database.
    const emails = rows.map((r) => r.email).filter(Boolean);
    const existing = await this.prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
    const existingSet = new Set(existing.map((e) => e.email));
    for (const row of rows) if (existingSet.has(row.email)) row.issues.push('Already exists');

    const valid = rows.filter((r) => !r.issues.length);
    const batch = await this.prisma.importBatch.create({
      data: {
        createdById: actor.id,
        fileName: file.originalname?.slice(0, 200) || 'upload',
        fileHash: sha256(file.buffer.toString('base64')),
        status: 'PREVIEW',
        rows: rows as any,
        summary: { total: rows.length, valid: valid.length, skipped: rows.length - valid.length } as any,
      },
    });

    await this.audit.log({ actor, action: 'import.previewed', targetType: 'import_batch', targetId: batch.id, metadata: { rows: rows.length }, ip: meta.ip });
    return { batchId: batch.id, rows, summary: { total: rows.length, valid: valid.length, skipped: rows.length - valid.length } };
  }

  /**
   * Creates the valid rows. Each user is created on its own rather than in one transaction, so a
   * single bad row cannot throw away a successful import of two hundred others; the report says
   * exactly what happened to each one.
   */
  async commit(batchId: string, actor: AuthUser, meta: RequestMeta) {
    const batch = await this.prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new AppError('NOT_FOUND', 'Import not found');
    if (batch.status !== 'PREVIEW') throw new AppError('CONFLICT', 'This import has already been processed');
    await this.prisma.importBatch.update({ where: { id: batch.id }, data: { status: 'COMMITTING' } });

    const rows = batch.rows as unknown as ImportRow[];
    const created: { email: string; tempPassword: string | null }[] = [];
    const failed: { email: string; reason: string }[] = [];

    for (const row of rows) {
      if (row.issues?.length) continue;
      try {
        const r = await this.users.createUser(
          {
            email: row.email,
            name: row.name,
            role: row.role,
            facultyNumber: row.facultyNumber,
            programme: row.programme,
            year: row.year,
            group: row.group,
          } as any,
          actor,
          meta,
        );
        // Each new account gets a generated password it must change at first sign-in.
        await this.users.deliverOnboarding(r.user, r.activationUrl, r.tempPassword);
        created.push({ email: row.email, tempPassword: r.tempPassword });
      } catch (e: any) {
        failed.push({ email: row.email, reason: e?.message ?? 'Could not be created' });
      }
    }

    const report = { created: created.length, failed, skipped: rows.filter((r) => r.issues?.length).length };
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'COMMITTED', committedAt: new Date(), report: report as any },
    });
    await this.audit.log({ actor, action: 'import.committed', targetType: 'import_batch', targetId: batch.id, metadata: report as any, ip: meta.ip });
    return { ...report, createdUsers: created };
  }
}
