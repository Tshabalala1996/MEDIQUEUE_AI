'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import type { Role } from '@/types';
import {
  LayoutDashboard, CalendarPlus, CalendarCheck, ClipboardList, Stethoscope,
  FileText, Users, Building2, Tv2, BarChart3, PlusCircle,
  BriefcaseMedical, Clock, Building, LogOut, ChevronRight,
  Settings, FileBarChart, CalendarDays, ListChecks, UserPlus, HeartPulse,
} from 'lucide-react';

const RandIcon = () => (
  <span className="flex h-[17px] w-[17px] items-center justify-center rounded text-[11px] font-black leading-none">R</span>
);

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  // Patient
  { href: '/patient',                    label: 'Dashboard',        icon: <LayoutDashboard size={17} />,  roles: ['Patient'] },
  { href: '/patient/book',               label: 'Book Appointment', icon: <CalendarPlus size={17} />,     roles: ['Patient'] },
  { href: '/patient/appointments',       label: 'My Appointments',  icon: <CalendarCheck size={17} />,    roles: ['Patient'] },
  { href: '/patient/queue',              label: 'My Queue',         icon: <ClipboardList size={17} />,    roles: ['Patient'] },
  { href: '/patient/symptoms',           label: 'Symptom Checker',  icon: <Stethoscope size={17} />,      roles: ['Patient'] },
  { href: '/patient/medical-history',    label: 'Medical History',  icon: <FileText size={17} />,         roles: ['Patient'] },
  { href: '/patient/billing',            label: 'My Bills',         icon: <RandIcon />,          roles: ['Patient'] },
  // Doctor
  { href: '/doctor',                     label: 'Dashboard',        icon: <LayoutDashboard size={17} />,  roles: ['Doctor'] },
  { href: '/doctor/appointments',        label: "Today's Queue",    icon: <ClipboardList size={17} />,    roles: ['Doctor'] },
  { href: '/doctor/patients',            label: 'My Patients',      icon: <Users size={17} />,            roles: ['Doctor'] },
  { href: '/doctor/availability',        label: 'Availability',     icon: <Clock size={17} />,            roles: ['Doctor'] },
  { href: '/doctor/reports',             label: 'Reports',          icon: <FileBarChart size={17} />,     roles: ['Doctor'] },
  // Nurse
  { href: '/nurse',                      label: 'Triage Station',   icon: <HeartPulse size={17} />,       roles: ['Nurse'] },
  { href: '/nurse/queue',                label: 'Queue',            icon: <ClipboardList size={17} />,    roles: ['Nurse'] },
  // Receptionist
  { href: '/receptionist',              label: 'Dashboard',         icon: <LayoutDashboard size={17} />,  roles: ['Receptionist'] },
  { href: '/receptionist/queue',         label: 'Queue Management', icon: <ClipboardList size={17} />,    roles: ['Receptionist'] },
  { href: '/receptionist/walk-in',       label: 'Walk-in Patient',  icon: <PlusCircle size={17} />,       roles: ['Receptionist'] },
  { href: '/receptionist/create-doctor', label: 'Create Doctor',    icon: <BriefcaseMedical size={17} />, roles: ['Receptionist'] },
  { href: '/receptionist/billing',       label: 'Process Billing',  icon: <RandIcon />,          roles: ['Receptionist'] },
  // Admin
  { href: '/admin',                      label: 'Dashboard',        icon: <LayoutDashboard size={17} />,  roles: ['Admin'] },
  { href: '/admin/analytics',            label: 'Analytics',        icon: <BarChart3 size={17} />,        roles: ['Admin'] },
  { href: '/admin/reports',              label: 'Reports',          icon: <FileBarChart size={17} />,     roles: ['Admin'] },
  { href: '/admin/appointments',         label: 'Appointments',     icon: <CalendarDays size={17} />,     roles: ['Admin'] },
  { href: '/admin/queues',               label: 'Queues',           icon: <ListChecks size={17} />,       roles: ['Admin'] },
  { href: '/admin/users',                label: 'Users',            icon: <Users size={17} />,            roles: ['Admin'] },
  { href: '/admin/create-staff',         label: 'Add Staff',        icon: <UserPlus size={17} />,         roles: ['Admin'] },
  { href: '/admin/hospitals',            label: 'Hospitals',        icon: <Building2 size={17} />,        roles: ['Admin'] },
  { href: '/admin/clinics',              label: 'Clinics',          icon: <Building size={17} />,         roles: ['Admin'] },
  { href: '/admin/settings',             label: 'System Settings',  icon: <Settings size={17} />,         roles: ['Admin'] },
];

const SECTION_LABELS: Record<string, string> = {
  '/patient':       'Patient',
  '/doctor':        'Doctor',
  '/nurse':         'Nurse',
  '/receptionist':  'Receptionist',
  '/admin':         'Admin',
};

const ROLE_COLORS: Record<string, string> = {
  Patient:       'bg-emerald-500',
  Doctor:        'bg-[#2346E8]',
  Nurse:         'bg-teal-500',
  Receptionist:  'bg-amber-500',
  Admin:         'bg-violet-500',
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasRole } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.some((r) => hasRole(r)));

  const roleLabel = Object.entries(SECTION_LABELS).find(([prefix]) =>
    pathname.startsWith(prefix)
  )?.[1] ?? 'Menu';

  const userRole = user?.roles[0] ?? '';
  const avatarColor = ROLE_COLORS[userRole] ?? 'bg-[#2346E8]';

  return (
    <aside className="flex w-64 flex-col bg-[#0D1F3C] print:hidden" style={{ minHeight: '100vh' }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2346E8] text-white text-base font-bold shadow-md shadow-[#2346E8]/30">
          ✚
        </div>
        <div>
          <p className="text-sm font-extrabold text-white leading-tight tracking-wide">MediQueue AI</p>
          <p className="text-[10px] text-white/30 uppercase tracking-widest">Healthcare</p>
        </div>
      </div>

      {/* User info */}
      {user && (
        <div className="mx-3 mt-3 mb-1 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3 border border-white/5">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${avatarColor} text-xs font-bold text-white`}>
            {user.first_name[0]}{user.last_name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.first_name} {user.last_name}</p>
            <p className="text-[11px] text-white/40">{userRole}</p>
          </div>
          <ChevronRight size={14} className="text-white/20 flex-shrink-0" />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 mt-2">
        <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-white/25">
          {roleLabel}
        </p>
        <ul className="space-y-0.5">
          {visibleItems.map((item) => {
            const isRoot = ['/patient', '/doctor', '/nurse', '/receptionist', '/admin'].includes(item.href);
            const active = pathname === item.href || (!isRoot && pathname.startsWith(item.href + '/'));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all
                    ${active
                      ? 'bg-[#2346E8] text-white shadow-lg shadow-[#2346E8]/25'
                      : 'text-white/55 hover:bg-white/7 hover:text-white'
                    }`}
                >
                  <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-white/40'}`}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                  {active && <ChevronRight size={13} className="ml-auto opacity-60" />}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Queue Board */}
        <div className="mt-4 pt-4 border-t border-white/5">
          <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-white/25">Tools</p>
          <Link
            href="/queue-board"
            target="_blank"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/40 hover:bg-white/7 hover:text-white transition-all"
          >
            <Tv2 size={17} className="flex-shrink-0" />
            <span>Queue Board TV</span>
            <span className="ml-auto text-[10px] font-bold text-[#2346E8] bg-[#EEF2FF]/10 border border-[#2346E8]/20 rounded px-1.5 py-0.5">LIVE</span>
          </Link>
        </div>
      </nav>

      {/* Sign out */}
      <div className="border-t border-white/5 px-3 py-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-white/40
            hover:bg-red-500/15 hover:text-red-400 transition-all group"
        >
          <LogOut size={17} className="flex-shrink-0 group-hover:text-red-400" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
