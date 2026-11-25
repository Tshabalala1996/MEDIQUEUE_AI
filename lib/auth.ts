import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { JWTPayload, Role } from '@/types';

const accessSecret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_dev_secret_change_in_production'
);
const refreshSecret = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_change_in_production'
);

export async function signAccessToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN || '15m')
    .sign(accessSecret);
}

export async function signRefreshToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_REFRESH_EXPIRES_IN || '7d')
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecret);
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      roles: payload.roles as Role[],
    };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret);
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      roles: payload.roles as Role[],
    };
  } catch {
    return null;
  }
}

export async function setRefreshCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}

export async function clearRefreshCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('refresh_token');
}

export async function getRefreshCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('refresh_token')?.value ?? null;
}

/** Extracts and verifies Bearer token from Authorization header */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

export async function getAuthUser(request: Request): Promise<JWTPayload | null> {
  const token = extractBearerToken(request.headers.get('Authorization'));
  if (!token) return null;
  return verifyAccessToken(token);
}

export function hasRole(user: JWTPayload, ...requiredRoles: Role[]): boolean {
  return requiredRoles.some((role) => user.roles.includes(role));
}
