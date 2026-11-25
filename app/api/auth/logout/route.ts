import { clearRefreshCookie } from '@/lib/auth';
import { ok } from '@/lib/response';
import { cookies } from 'next/headers';

export async function POST() {
  await clearRefreshCookie();
  const cookieStore = await cookies();
  cookieStore.delete('access_token');
  return ok(null, 'Logged out successfully');
}
