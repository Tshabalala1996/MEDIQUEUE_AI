'use client';

import { ReportsView } from '@/components/reports/ReportsView';

export default function DoctorReportsPage() {
  return (
    <ReportsView
      title="My Reports"
      subtitle="Your waiting times, appointments and queue performance"
      showDoctorFilter={false}
    />
  );
}
