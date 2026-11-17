'use client';
import * as React from 'react';
import { getSocket } from './socket';

/** Subscribes to a lesson room and re-subscribes after every reconnect (spec 16.5: resync on reconnect). */
export function useLessonSocket(lessonId: string | undefined, handlers: Record<string, (payload: any) => void>, onReconnect?: () => void) {
  const [connected, setConnected] = React.useState(false);
  const ref = React.useRef(handlers);
  ref.current = handlers;
  const reconnectRef = React.useRef(onReconnect);
  reconnectRef.current = onReconnect;
  React.useEffect(() => {
    if (!lessonId) return;
    const s = getSocket();
    const subscribe = () => {
      s.emit('lesson.subscribe', { lessonId }, () => undefined);
      setConnected(true);
      reconnectRef.current?.();
    };
    const down = () => setConnected(false);
    const events = Object.keys(ref.current);
    const listeners = events.map((ev) => {
      const fn = (p: any) => ref.current[ev]?.(p);
      s.on(ev, fn);
      return [ev, fn] as const;
    });
    s.on('ready', subscribe);
    s.on('disconnect', down);
    s.on('connect_error', down);
    if (s.connected) subscribe();
    return () => {
      s.emit('lesson.unsubscribe', { lessonId });
      s.off('ready', subscribe);
      s.off('disconnect', down);
      s.off('connect_error', down);
      listeners.forEach(([ev, fn]) => s.off(ev, fn));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);
  return connected;
}
