'use client';

import { ReportsView } from '@/components/reports/ReportsView';

export default function AdminReportsPage() {
  return (
    <ReportsView
      title="Reports"
      subtitle="Waiting times, appointments and queue performance for any period"
      showDoctorFilter
    />
  );
}
