'use client';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: any,
    public requestId?: string,
  ) {
    super(message);
  }
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(name + '='))
    ?.split('=')[1];
}

async function ensureCsrf() {
  let token = readCookie('pau_csrf');
  if (!token) {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' });
    token = (await res.json()).csrfToken;
  }
  return token!;
}

let refreshing: Promise<boolean> | null = null;
function refreshSession() {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (r) => {
      if (r.ok) return true;
      const body = await r.json().catch(() => null);
      if (body?.error?.code === 'SESSION_REVOKED') window.dispatchEvent(new CustomEvent('auth:revoked', { detail: body.error.details }));
      return false;
    })
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  form?: FormData;
}

export async function api<T = any>(path: string, opts: ApiOptions = {}, retried = false): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrf();
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  opts.signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      headers,
      credentials: 'include',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (e: any) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ApiError('NETWORK_OFFLINE', 'You are offline', 0);
    throw new ApiError(e?.name === 'AbortError' ? 'SERVER_TIMEOUT' : 'NETWORK_OFFLINE', 'Network problem, please retry', 0);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && !retried) {
    const body = await res.clone().json().catch(() => null);
    const code = body?.error?.code;
    if (code === 'TOKEN_EXPIRED' || (code === 'LOGIN_REQUIRED' && readCookie('pau_csrf'))) {
      if (await refreshSession()) return api<T>(path, opts, true);
    }
    if (code === 'SESSION_REVOKED') window.dispatchEvent(new CustomEvent('auth:revoked', { detail: body?.error?.details }));
  }
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new CustomEvent('auth:password-change'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? res.statusText, res.status, body?.error?.details, body?.requestId);
  }
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  return (await res.blob()) as unknown as T;
}

/** Authenticated file download (Excel reports, spec 22). */
export async function download(path: string, fallbackName: string) {
  const res = await fetch('/api' + path, { credentials: 'include' });
  if (res.status === 401 && (await refreshSession())) return download(path, fallbackName);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? res.statusText, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name ? decodeURIComponent(name) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
