import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** URL-safe CSPRNG token. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/** Coarse IP for audit logs (spec 3: ip_coarse) – IPv4 /24, IPv6 /48. */
export function coarseIp(ip?: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4.split('.').slice(0, 3).join('.') + '.0/24';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::/48';
  return null;
}

/** Neutralise spreadsheet formula injection (spec 22.4). */
export function spreadsheetSafe(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();
