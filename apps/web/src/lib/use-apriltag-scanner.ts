'use client';
import * as React from 'react';

export type CameraError = 'CAMERA_DENIED' | 'CAMERA_UNAVAILABLE' | 'INSECURE_CONTEXT';
export interface Detection {
  id: number;
  hammingDistance: number;
}

/** Upper bound for the crop-based fallback; beyond this the marker turns to mush. */
const MAX_DIGITAL_ZOOM = 4;

export interface ZoomState {
  /** There is always a slider: hardware zoom when the camera exposes it, cropping otherwise. */
  supported: boolean;
  hardware: boolean;
  min: number;
  max: number;
  step: number;
  value: number;
}

/**
 * Live camera + Web Worker AprilTag detection. Frames never leave the device (spec 1, 17.4):
 * there is no upload, no recording and no file input – only detected marker IDs are reported.
 *
 * Zoom helps a lot when the projector is far away. Where the camera exposes a real zoom
 * capability we drive that, because it keeps the full sensor resolution. Otherwise we crop a
 * centred window out of each frame before handing it to the detector, which costs resolution
 * but still makes a distant marker big enough to decode. `previewScale` is what the UI should
 * apply to the <video> so the picture matches what is actually being scanned.
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
  /** Read inside the frame loop, which must not be re-created when the slider moves. */
  const digitalZoomRef = React.useRef(1);
  const [state, setState] = React.useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [error, setError] = React.useState<CameraError | null>(null);
  const [torch, setTorch] = React.useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [zoom, setZoomState] = React.useState<ZoomState>({
    supported: false,
    hardware: false,
    min: 1,
    max: MAX_DIGITAL_ZOOM,
    step: 0.1,
    value: 1,
  });

  const stop = React.useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
    digitalZoomRef.current = 1;
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

      digitalZoomRef.current = 1;
      if (caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > (caps.zoom.min ?? 1)) {
        const min = caps.zoom.min ?? 1;
        const current = (track.getSettings?.() as any)?.zoom ?? min;
        setZoomState({
          supported: true,
          hardware: true,
          min,
          max: caps.zoom.max,
          step: caps.zoom.step || (caps.zoom.max - min) / 100 || 0.1,
          value: current,
        });
      } else {
        setZoomState({ supported: true, hardware: false, min: 1, max: MAX_DIGITAL_ZOOM, step: 0.1, value: 1 });
      }

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
        // Centred crop for the digital-zoom fallback; 1 means the whole frame.
        const z = Math.max(1, digitalZoomRef.current);
        const srcW = video.videoWidth / z;
        const srcH = video.videoHeight / z;
        const srcX = (video.videoWidth - srcW) / 2;
        const srcY = (video.videoHeight - srcH) / 2;
        const targetW = Math.min(960, srcW);
        const scale = targetW / srcW;
        const w = Math.round(srcW * scale);
        const h = Math.round(srcH * scale);
        const canvas = canvasRef.current!;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, w, h);
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

  const setZoom = React.useCallback(
    (value: number) => {
      setZoomState((z) => {
        const clamped = Math.min(z.max, Math.max(z.min, value));
        if (z.hardware) {
          const track = streamRef.current?.getVideoTracks()[0];
          // A camera can refuse a zoom it advertised; the slider then simply stays put.
          track?.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {});
        } else {
          digitalZoomRef.current = clamped;
        }
        return { ...z, value: clamped };
      });
    },
    [],
  );

  const toggleTorch = React.useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch.on } as any] });
      setTorch((t) => ({ ...t, on: !t.on }));
    } catch {}
  }, [torch.on]);

  return {
    videoRef,
    start,
    stop,
    state,
    error,
    torch,
    toggleTorch,
    zoom,
    setZoom,
    /** Hardware zoom already changes the picture; only the crop fallback needs a CSS scale. */
    previewScale: zoom.hardware ? 1 : zoom.value,
  };
}
