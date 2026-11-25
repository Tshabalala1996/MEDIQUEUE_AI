import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import type { Role } from '@/types';

const accessSecret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback_dev_secret_change_in_production'
);

const ROLE_HOME: Record<Role, string> = {
  Patient: '/patient',
  Doctor: '/doctor',
  Nurse: '/nurse',
  Receptionist: '/receptionist',
  Admin: '/admin',
};

const PROTECTED_PREFIXES = ['/patient', '/doctor', '/nurse', '/receptionist', '/admin'];
const AUTH_PAGES = ['/login', '/register'];

export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl;
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
    const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

    const token = request.cookies.get('access_token')?.value;

    let userPayload: { userId: number; email: string; roles: Role[] } | null = null;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, accessSecret);
        userPayload = {
          userId: payload.userId as number,
          email: payload.email as string,
          roles: payload.roles as Role[],
        };
      } catch {
        // token expired or invalid — treat as unauthenticated
      }
    }

    // Redirect logged-in users away from auth pages to their home
    if (isAuthPage && userPayload) {
      const homeRole = userPayload.roles[0];
      const home = homeRole ? (ROLE_HOME[homeRole] ?? '/patient') : '/patient';
      return NextResponse.redirect(new URL(home, request.url));
    }

    // Redirect unauthenticated users to login
    if (isProtected && !userPayload) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Role-based access control
    if (isProtected && userPayload) {
      const roles = userPayload.roles;
      if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !roles.includes('Admin')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
      if ((pathname === '/doctor' || pathname.startsWith('/doctor/')) && !roles.includes('Doctor') && !roles.includes('Admin')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
      if ((pathname === '/nurse' || pathname.startsWith('/nurse/')) && !roles.includes('Nurse') && !roles.includes('Admin')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
      if ((pathname === '/receptionist' || pathname.startsWith('/receptionist/')) && !roles.includes('Receptionist') && !roles.includes('Admin')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
      if ((pathname === '/patient' || pathname.startsWith('/patient/')) && !roles.includes('Patient') && !roles.includes('Admin')) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/patient/:path*', '/doctor/:path*', '/nurse/:path*', '/receptionist/:path*', '/admin/:path*', '/login', '/register'],
};
