import { Suspense } from 'react';
import { LoginInner } from './LoginInner';

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center text-gray-500">Loading...</div>
      </div>
    }>
      <LoginInner />
    </Suspense>
  );
}
