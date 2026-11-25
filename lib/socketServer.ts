import type { Server } from 'socket.io';

declare global {
  // eslint-disable-next-line no-var
  var io: Server | undefined;
}

export function emitQueueUpdate(doctorId: number, date: string) {
  global.io?.to(`queue:${doctorId}:${date}`).emit('queue-update', {
    doctorId,
    date,
    timestamp: Date.now(),
  });
}
