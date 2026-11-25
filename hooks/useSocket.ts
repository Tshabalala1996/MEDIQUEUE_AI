'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export function useQueueSocket(doctorId: string | number, date: string, onUpdate: () => void) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!doctorId) return;

    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-queue', { doctorId: String(doctorId), date });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('queue-update', () => onUpdate());

    return () => {
      socket.emit('leave-queue', { doctorId: String(doctorId), date });
      socket.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, date]);

  return connected;
}

/**
 * Real-time queue updates for several doctors at once (a patient with more than one
 * appointment that day, or staff watching every queue). Calls `onUpdate` whenever the
 * server reports that any of those queues changed.
 */
export function useQueueSockets(doctorIds: (string | number)[], date: string, onUpdate: () => void) {
  const [connected, setConnected] = useState(false);
  const callback = useRef(onUpdate);
  useEffect(() => { callback.current = onUpdate; });

  const key = [...new Set(doctorIds.map(String))].sort().join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    const socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      setConnected(true);
      ids.forEach((id) => socket.emit('join-queue', { doctorId: id, date }));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('queue-update', () => callback.current());

    return () => {
      ids.forEach((id) => socket.emit('leave-queue', { doctorId: id, date }));
      socket.disconnect();
    };
  }, [key, date]);

  return connected;
}
