'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/types';

interface AuthUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  roles: Role[];
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; roles?: Role[] }>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
  primaryRole: Role | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Try to restore session from refresh token cookie
  useEffect(() => {
    async function restore() {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (res.ok) {
          const { data } = await res.json();
          setAccessToken(data.accessToken);
          // Fetch user profile
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${data.accessToken}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            setUser(me.data);
          }
        }
      } catch { /* no session */ }
      finally { setIsLoading(false); }
    }
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) return { success: false, error: json.error ?? 'Login failed' };

      setAccessToken(json.data.accessToken);
      setUser(json.data.user);
      return { success: true, roles: json.data.user.roles as Role[] };
    } catch {
      return { success: false, error: 'Network error' };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setAccessToken(null);
    router.push('/login');
  }, [router]);

  const hasRole = useCallback(
    (...roles: Role[]) => roles.some((r) => user?.roles.includes(r)),
    [user]
  );

  const primaryRole = user?.roles[0] ?? null;

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout, hasRole, primaryRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
