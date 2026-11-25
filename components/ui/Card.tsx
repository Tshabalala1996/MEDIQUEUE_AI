import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export function Card({ children, className = '', title, subtitle, action }: Props) {
  return (
    <div className={`rounded-2xl bg-white shadow-sm border border-gray-100 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            {title && <h3 className="text-base font-bold text-[#0D1F3C]">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sm text-gray-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'navy';
}

const statColors = {
  navy:   'bg-[#0D1F3C] text-white',
  blue:   'bg-[#2346E8] text-white',
  green:  'bg-emerald-500 text-white',
  red:    'bg-red-500 text-white',
  yellow: 'bg-amber-400 text-white',
  purple: 'bg-violet-500 text-white',
};

export function StatCard({ label, value, sub, icon, color = 'navy' }: StatCardProps) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl p-5 ${statColors[color]}`}>
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-2xl">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-medium opacity-80">{label}</p>
        <p className="text-3xl font-extrabold">{value}</p>
        {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
