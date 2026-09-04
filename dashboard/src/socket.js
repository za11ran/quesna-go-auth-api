import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { apiBase, getToken } from './api';

let sock = null;
export function getSocket() {
  if (!sock) {
    sock = io(apiBase, { auth: { token: getToken() }, transports: ['websocket', 'polling'], autoConnect: true });
  }
  return sock;
}

// useLive('order:new', (payload) => reload())
export function useLive(event, handler) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, handler);
    return () => s.off(event, handler);
  }, [event, handler]);
}
