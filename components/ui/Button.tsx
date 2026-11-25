'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'blue' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-[#0D1F3C] hover:bg-[#1A3560] text-white focus:ring-[#2346E8]',
  blue:      'bg-[#2346E8] hover:bg-[#1a3fda] text-white focus:ring-[#2346E8]',
  secondary: 'bg-[#EEF2FF] hover:bg-[#dbeafe] text-[#2346E8] focus:ring-[#2346E8]',
  danger:    'bg-red-500 hover:bg-red-600 text-white focus:ring-red-400',
  ghost:     'bg-transparent hover:bg-[#EEF2FF] text-[#0D1F3C] border border-[#0D1F3C]/20 focus:ring-[#2346E8]',
  success:   'bg-emerald-500 hover:bg-emerald-600 text-white focus:ring-emerald-400',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-4 py-1.5 text-xs',
  md: 'px-5 py-2 text-sm',
  lg: 'px-8 py-3.5 text-base',
};

export function Button({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold
        transition-all focus:outline-none focus:ring-2 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed tracking-wide
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
