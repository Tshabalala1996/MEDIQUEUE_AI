'use client';

import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

export function useApi() {
  const { accessToken, logout } = useAuth();

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        // Try to refresh token
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (refreshRes.ok) {
          const { data } = await refreshRes.json();
          headers['Authorization'] = `Bearer ${data.accessToken}`;
          return fetch(url, { ...options, headers });
        }
        await logout();
        throw new Error('Session expired');
      }

      return res;
    },
    [accessToken, logout]
  );

  return { apiFetch };
}
