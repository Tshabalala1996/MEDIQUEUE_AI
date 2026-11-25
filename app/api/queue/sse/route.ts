import { NextRequest } from 'next/server';
import { registerSSEClient, unregisterSSEClient } from '../route';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const doctor_id = Number(searchParams.get('doctor_id') ?? 0);
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  if (!doctor_id) {
    return new Response('doctor_id is required', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => controller.enqueue(encoder.encode(data));

      registerSSEClient(doctor_id, date, controller as unknown as ReadableStreamDefaultController);

      // Send initial queue state
      try {
        const queue = await query<unknown[]>(
          `SELECT q.queue_id AS id, q.appointment_id, q.position AS queue_position, q.status,
                  q.estimated_wait_mins AS estimated_wait_minutes, q.called_at,
                  pu.full_name AS patient_name,
                  a.appointment_datetime
           FROM queue q
           JOIN appointments a ON a.appointment_id = q.appointment_id
           JOIN patients p ON p.patient_id = a.patient_id
           JOIN users pu ON pu.user_id = p.user_id
           WHERE q.doctor_id = ? AND q.queue_date = ?
           ORDER BY q.priority_level ASC, q.position ASC`,
          [doctor_id, date]
        );
        enqueue(`event: initial\ndata: ${JSON.stringify(queue)}\n\n`);
      } catch { /* db not yet ready */ }

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          enqueue(`: heartbeat\n\n`);
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unregisterSSEClient(doctor_id, date, controller as unknown as ReadableStreamDefaultController);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
