import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getAuthUser, hasRole } from '@/lib/auth';
import { processDueReminders } from '@/lib/reminders';
import { ok, unauthorized, serverError } from '@/lib/response';

export const dynamic = 'force-dynamic';

function secretMatches(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Sends any SMS reminders that are due (FR05).
 * Called every few minutes by server.js with the shared CRON_SECRET, so an
 * external scheduler (cron, Vercel Cron, etc.) can call it the same way.
 */
export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-cron-secret'))) {
    const user = await getAuthUser(request);
    if (!user || !hasRole(user, 'Admin')) return unauthorized();
  }

  try {
    return ok(await processDueReminders());
  } catch (err) {
    console.error('[Cron reminders]', err);
    return serverError();
  }
}
