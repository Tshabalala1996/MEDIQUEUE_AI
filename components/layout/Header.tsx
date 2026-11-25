'use client';

import { useAuth } from '@/context/AuthContext';

interface Props {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: Props) {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between bg-white border-b border-gray-100 px-8 py-4">
      <div>
        <h1 className="text-xl font-extrabold text-[#0D1F3C]">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-gray-400 hidden sm:block">
          {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-[#0D1F3C]">{user.first_name} {user.last_name}</p>
              <p className="text-[11px] text-gray-400">{user.roles[0]}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2346E8] text-sm font-bold text-white shadow-md shadow-[#2346E8]/30">
              {user.first_name[0]}{user.last_name[0]}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
