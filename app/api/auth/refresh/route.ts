import { NextRequest } from 'next/server';
import { verifyRefreshToken, signAccessToken, getRefreshCookie } from '@/lib/auth';
import { ok, unauthorized, serverError } from '@/lib/response';
import { cookies } from 'next/headers';

export async function POST(_request: NextRequest) {
  try {
    const refreshToken = await getRefreshCookie();
    if (!refreshToken) return unauthorized('No refresh token');

    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) return unauthorized('Invalid or expired refresh token');

    const accessToken = await signAccessToken(payload);

    // Refresh the access_token cookie
    const cookieStore = await cookies();
    cookieStore.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
      path: '/',
    });

    return ok({ accessToken }, 'Token refreshed');
  } catch (err) {
    console.error('[Refresh]', err);
    return serverError();
  }
}
