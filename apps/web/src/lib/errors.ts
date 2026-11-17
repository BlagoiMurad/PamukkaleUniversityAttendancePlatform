import { ApiError } from './api';
import type { MessageKey } from './i18n';
import { en } from './i18n/messages';

/** Maps a stable API error code to a translated message (spec 19.3). */
export function errorMessage(e: unknown, t: (k: MessageKey, v?: any) => string) {
  const code = e instanceof ApiError ? e.code : (e as any)?.code;
  const key = `err.${code}` as MessageKey;
  if (code && key in en) return t(key);
  if (e instanceof ApiError && e.message && e.status < 500) return e.message;
  return t('err.generic');
}
