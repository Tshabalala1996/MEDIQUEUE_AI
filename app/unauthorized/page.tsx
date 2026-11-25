import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <span className="text-6xl">🚫</span>
      <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
      <p className="text-gray-500">You don't have permission to view this page.</p>
      <Link href="/" className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Go Home
      </Link>
    </div>
  );
}
