'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import type { MedicalHistory } from '@/types';

export default function MedicalHistoryPage() {
  const { apiFetch } = useApi();
  const [history, setHistory] = useState<MedicalHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/medical-history').then(async (r) => {
      if (r.ok) { const d = await r.json(); setHistory(d.data ?? []); }
      setLoading(false);
    });
  }, [apiFetch]);

  return (
    <div>
      <Header title="Medical History" subtitle="Your complete medical records" />
      <div className="p-8 space-y-4">
        {loading ? (
          <div className="flex justify-center py-20"><span className="animate-spin text-4xl">⏳</span></div>
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500">
            No medical records found.
          </div>
        ) : (
          history.map((rec) => (
            <Card key={rec.id}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {new Date(rec.visit_date).toLocaleDateString('en-ZA', { dateStyle: 'long' })}
                  </p>
                  {rec.doctor_name && <p className="text-sm font-medium text-blue-700">{rec.doctor_name}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Diagnosis</p>
                  <p className="text-sm text-gray-900">{rec.diagnosis}</p>
                </div>
                {rec.prescription && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Prescription</p>
                    <p className="text-sm text-gray-700 whitespace-pre-line">{rec.prescription}</p>
                  </div>
                )}
                {rec.notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                    <p className="text-sm text-gray-600">{rec.notes}</p>
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
