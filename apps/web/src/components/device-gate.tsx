'use client';
import * as React from 'react';
import { Smartphone, ShieldAlert, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Field, Textarea } from './ui/input';
import { Alert } from './ui/misc';
import { api } from '@/lib/api';
import { deviceFingerprint, deviceLabel } from '@/lib/device';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';

export type DeviceGateState =
  | { kind: 'bind'; setupToken: string }
  | { kind: 'blocked'; code: string; boundLabel: string | null; requestToken: string | null; pending: boolean };

/**
 * Stands between a correct password and a session when the device is not (yet) the one the
 * account is tied to. Either the student confirms this is the phone they will always check in
 * with, or they explain why they need a different one and wait for a teacher.
 */
export function DeviceGate({ state, onBound, onExpired }: { state: DeviceGateState; onBound: () => void; onExpired: () => void }) {
  const t = useT();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [sent, setSent] = React.useState(false);

  if (state.kind === 'bind') {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Smartphone className="size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t('device.bindTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('device.bindBody')}</p>
        </div>
        <Alert variant="warning">{t('device.bindWarning')}</Alert>
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium">{deviceLabel()}</p>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="space-y-2">
          <Button
            className="w-full"
            size="lg"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api('/auth/device/bind', { body: { setupToken: state.setupToken, fingerprint: deviceFingerprint(), label: deviceLabel() } });
                onBound();
              } catch (e) {
                // Setup tokens are short-lived; silently fetch a fresh one instead of dead-ending.
                if ((e as { code?: string })?.code === 'TOKEN_INVALID') return onExpired();
                setError(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('device.bindYes')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('device.bindNo')}</p>
        </div>
      </div>
    );
  }

  if (sent || state.pending) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          {sent ? <CheckCircle2 className="size-7" /> : <Clock className="size-7" />}
        </div>
        <h1 className="text-xl font-semibold">{t('device.requestSentTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('device.requestSentBody')}</p>
      </div>
    );
  }

  const shared = state.code === 'DEVICE_BOUND_TO_OTHER_ACCOUNT';
  return (
    <div className="space-y-5">
      <div className="space-y-3 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldAlert className="size-7" />
        </div>
        <h1 className="text-xl font-semibold">{t('device.blockedTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {shared ? t('device.blockedShared') : t('device.blockedBody', { device: state.boundLabel || t('device.unknownDevice') })}
        </p>
      </div>

      {shared ? (
        // Nothing to request: this browser is somebody else's device, not a new one of theirs.
        <Alert variant="warning">{t('device.blockedSharedHint')}</Alert>
      ) : !state.requestToken ? (
        <Alert variant="warning">{t('device.noToken')}</Alert>
      ) : (
        <>
          <Field label={t('device.reason')} hint={t('device.reasonHint')} htmlFor="reason">
            <Textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          {error && <Alert variant="destructive">{error}</Alert>}
          <Button
            className="w-full"
            size="lg"
            loading={busy}
            disabled={reason.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api('/auth/device/change-request', {
                  body: { setupToken: state.requestToken, reason, fingerprint: deviceFingerprint(), label: deviceLabel() },
                });
                setSent(true);
              } catch (e) {
                if ((e as { code?: string })?.code === 'TOKEN_INVALID') return onExpired();
                setError(errorMessage(e, t));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('device.requestSubmit')}
          </Button>
        </>
      )}
    </div>
  );
}
