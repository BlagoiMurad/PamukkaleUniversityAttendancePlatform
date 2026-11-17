'use client';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
    socket.on('auth.session.revoked', (detail) => window.dispatchEvent(new CustomEvent('auth:revoked', { detail })));
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}
