'use client';
import * as React from 'react';

export type CameraError = 'CAMERA_DENIED' | 'CAMERA_UNAVAILABLE' | 'INSECURE_CONTEXT';
export interface Detection {
  id: number;
  hammingDistance: number;
}

/**
 * Live camera + Web Worker AprilTag detection. Frames never leave the device (spec 1, 17.4):
 * there is no upload, no recording and no file input – only detected marker IDs are reported.
 */
export function useAprilTagScanner(onDetect: (d: Detection[]) => void) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const workerRef = React.useRef<Worker | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const busyRef = React.useRef(false);
  const timerRef = React.useRef<number | null>(null);
  const onDetectRef = React.useRef(onDetect);
  onDetectRef.current = onDetect;
  const [state, setState] = React.useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = React.useState<CameraError | null>(null);
  const [torch, setTorch] = React.useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });

  const stop = React.useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('idle');
  }, []);

  React.useEffect(() => stop, [stop]);

  const start = React.useCallback(async () => {
    setError(null);
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('INSECURE_CONTEXT');
      setState('error');
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('CAMERA_UNAVAILABLE');
      setState('error');
      return false;
    }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities?.() ?? {};
      setTorch({ supported: !!caps.torch, on: false });
      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      await video.play();

      const worker = new Worker('/workers/apriltag-worker.js');
      workerRef.current = worker;
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'result') {
          busyRef.current = false;
          const markers: Detection[] = msg.markers.map((m: any) => ({ id: m.id, hammingDistance: m.hammingDistance }));
          onDetectRef.current(markers);
        } else if (msg.type === 'error') busyRef.current = false;
      };
      canvasRef.current ??= document.createElement('canvas');
      timerRef.current = window.setInterval(() => {
        if (busyRef.current || !video.videoWidth) return;
        const targetW = Math.min(960, video.videoWidth);
        const scale = targetW / video.videoWidth;
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        const canvas = canvasRef.current!;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0, w, h);
        const frame = ctx.getImageData(0, 0, w, h);
        busyRef.current = true;
        worker.postMessage({ type: 'frame', width: w, height: h, buffer: frame.data.buffer, frameId: Date.now() }, [frame.data.buffer]);
      }, 110);
      setState('running');
      return true;
    } catch (e: any) {
      stop();
      setError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'CAMERA_DENIED' : 'CAMERA_UNAVAILABLE');
      setState('error');
      return false;
    }
  }, [stop]);

  const toggleTorch = React.useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on } as any] });
      setTorch((t) => ({ ...t, on: !t.on }));
    } catch {}
  }, [torch.on]);

  return { videoRef, start, stop, state, error, torch, toggleTorch };
}
