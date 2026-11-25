const { createServer } = require('http');
const { randomBytes } = require('crypto');
const { Server } = require('socket.io');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';

// Shared secret for the reminder scheduler below. Set CRON_SECRET yourself when an
// external scheduler also calls /api/cron/reminders; otherwise one is generated per boot.
// Must be set before Next starts so API routes see the same value.
if (!process.env.CRON_SECRET) process.env.CRON_SECRET = randomBytes(24).toString('hex');

const app = next({ dev });
const handle = app.getRequestHandler();

// How often to look for appointment reminders that have become due (FR05).
const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

function startReminderScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return; // never overlap runs
    running = true;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/cron/reminders`, {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET },
      });
      if (!res.ok) {
        console.error(`[Reminders] scheduler call failed: HTTP ${res.status}`);
      } else {
        const { data } = await res.json();
        if (data && (data.sent || data.failed || data.retried || data.emailSent || data.emailFailed)) {
          console.log(`[Reminders] SMS sent=${data.sent} failed=${data.failed} skipped=${data.skipped} retried=${data.retried} | Email sent=${data.emailSent} failed=${data.emailFailed}`);
        }
      }
    } catch (err) {
      console.error('[Reminders] scheduler error:', err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 30_000); // first run shortly after boot
  setInterval(tick, REMINDER_INTERVAL_MS);
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/socket.io',
  });

  // Expose globally so Next.js API routes can emit events
  global.io = io;

  io.on('connection', (socket) => {
    socket.on('join-queue', ({ doctorId, date }) => {
      if (doctorId && date) {
        socket.join(`queue:${doctorId}:${date}`);
      }
    });

    socket.on('leave-queue', ({ doctorId, date }) => {
      if (doctorId && date) {
        socket.leave(`queue:${doctorId}:${date}`);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    startReminderScheduler();
  });
});
