import Link from 'next/link';
import Image from 'next/image';

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center bg-[#060E22]">

      {/* ── Large blurred logo orbs as background ── */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
        {/* Centre glow */}
        <div className="absolute h-[600px] w-[600px] rounded-full bg-[#2346E8]/20 blur-[120px]" />
        {/* Top-left logo ghost */}
        <Image
          src="/logo.svg"
          alt=""
          width={420}
          height={420}
          className="absolute -top-24 -left-24 opacity-10 blur-sm rotate-[-15deg] scale-110"
          aria-hidden
        />
        {/* Bottom-right logo ghost */}
        <Image
          src="/logo.svg"
          alt=""
          width={340}
          height={340}
          className="absolute -bottom-16 -right-16 opacity-8 blur-sm rotate-[20deg]"
          aria-hidden
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* ── Glass card ── */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-sm px-4">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-5 rounded-[28px] shadow-2xl shadow-[#2346E8]/50 ring-1 ring-white/10 overflow-hidden">
            <Image src="/logo.svg" alt="MediQueue AI" width={96} height={96} priority />
          </div>
          <p className="text-3xl font-extrabold text-white tracking-wide">MediQueue AI</p>
          <p className="text-xs text-white/40 uppercase tracking-[0.3em] mt-1">Healthcare</p>
        </div>

        {/* Glass panel */}
        <div
          className="w-full rounded-3xl p-8 space-y-4 shadow-2xl"
          style={{
            background: 'rgba(255,255,255,0.06)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          <p className="text-center text-white/50 text-sm leading-relaxed">
            Smart queue management for South African hospitals &amp; clinics
          </p>

          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-2xl bg-[#2346E8] py-3.5 text-sm font-bold text-white transition-all hover:bg-[#1a3fda] shadow-lg shadow-[#2346E8]/40"
          >
            Sign In
          </Link>

          <Link
            href="/register"
            className="flex w-full items-center justify-center rounded-2xl py-3.5 text-sm font-semibold text-white/80 transition-all hover:text-white"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            Register as Patient
          </Link>
        </div>

        <p className="mt-8 text-xs text-white/20">
          © {new Date().getFullYear()} MediQueue AI Healthcare · South Africa
        </p>
      </div>
    </div>
  );
}
