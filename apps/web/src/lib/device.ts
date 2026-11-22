/**
 * A coarse description of the browser + hardware, used by the server only to restore a device
 * cookie that was cleared, and only for someone who has already supplied the right password.
 *
 * It is deliberately built from stable, low-entropy signals. It is NOT a reliable device
 * identifier: two identical phones produce the same string, and it is trivial to forge from the
 * console. Nothing is ever granted on the strength of this value alone.
 */
export function deviceFingerprint(): string {
  if (typeof window === 'undefined') return '';
  const n = window.navigator as Navigator & { deviceMemory?: number };
  const parts = [
    n.userAgent,
    n.platform ?? '',
    n.language,
    String(n.hardwareConcurrency ?? ''),
    String(n.deviceMemory ?? ''),
    `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
    // The pixel ratio distinguishes phone models that otherwise report the same size.
    String(window.devicePixelRatio),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  ];
  return parts.join('|');
}

/** Short human label for the device list a teacher sees, e.g. "iPhone · Safari". */
export function deviceLabel(): string {
  if (typeof window === 'undefined') return '';
  const ua = window.navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}
