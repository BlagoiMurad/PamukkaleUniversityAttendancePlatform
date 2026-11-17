'use client';
import * as React from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = React.useState<string>('');
  React.useEffect(() => {
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } }).then(setSvg);
  }, [value]);
  return <div className={className} role="img" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
}
