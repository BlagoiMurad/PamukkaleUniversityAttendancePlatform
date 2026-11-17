import type { Response, CookieOptions } from 'express';

export const ACCESS_COOKIE = 'pau_at';
export const REFRESH_COOKIE = 'pau_rt';
export const CSRF_COOKIE = 'pau_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const secure = () => process.env.COOKIE_SECURE === 'true';

export function setAuthCookies(res: Response, access: string, refresh: string, accessTtlSec: number, refreshTtlDays: number) {
  const base: CookieOptions = { httpOnly: true, secure: secure(), sameSite: 'lax' };
  res.cookie(ACCESS_COOKIE, access, { ...base, path: '/', maxAge: accessTtlSec * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...base, sameSite: 'strict', path: '/api/auth', maxAge: refreshTtlDays * 86400_000 });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: secure(), sameSite: 'lax', path: '/', maxAge: 30 * 86400_000 });
}
