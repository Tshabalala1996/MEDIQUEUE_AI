'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';

interface Bill {
  id: number;
  appointment_id: number;
  file_fee: number;
  service_fee: number;
  total_amount: number;
  patient_category: string;
  status: string;
  notes: string | null;
  created_at: string;
  doctor_name: string;
  facility_name: string;
  appointment_datetime: string;
}

const statusStyle: Record<string, string> = {
  Draft:  'bg-gray-100 text-gray-600',
  Sent:   'bg-blue-100 text-blue-700',
  Paid:   'bg-green-100 text-green-700',
  Waived: 'bg-purple-100 text-purple-700',
};

const categoryLabel: Record<string, string> = {
  Indigent: 'Indigent (Free)',
  H1: 'H1 — Subsidised',
  H2: 'H2 — Co-payment',
  H3: 'H3 — Standard rate',
  Private: 'Private',
};

export default function PatientBillingPage() {
  const { apiFetch } = useApi();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch('/api/billing');
    if (res.ok) { const d = await res.json(); setBills(d.data ?? []); }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  const totalOwed = bills.filter((b) => b.status === 'Sent').reduce((s, b) => s + Number(b.total_amount), 0);

  return (
    <div>
      <Header title="My Bills" subtitle="View all medical bills and payment status" />
      <div className="p-8 space-y-6">

        {totalOwed > 0 && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">Outstanding Balance</p>
              <p className="text-3xl font-extrabold text-red-800 mt-0.5">R{totalOwed.toFixed(2)}</p>
              <p className="text-xs text-red-500 mt-1">Please pay at the cashier or admin office</p>
            </div>
            <span className="text-4xl">🏥</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20"><span className="animate-spin text-4xl">⏳</span></div>
        ) : bills.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500">
            No bills found. Bills appear here after your appointment is completed.
          </div>
        ) : (
          <div className="space-y-4">
            {bills.map((bill) => (
              <Card key={bill.id}>
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{bill.facility_name}</p>
                      <p className="text-sm text-gray-500">{bill.doctor_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(bill.appointment_datetime).toLocaleDateString('en-ZA', { dateStyle: 'long' })}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[bill.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {bill.status}
                    </span>
                  </div>

                  <div className="rounded-lg bg-gray-50 border border-gray-100 divide-y divide-gray-100 text-sm">
                    <div className="flex justify-between px-4 py-2">
                      <span className="text-gray-500">Category</span>
                      <span className="font-medium">{categoryLabel[bill.patient_category] ?? bill.patient_category}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2">
                      <span className="text-gray-500">File fee</span>
                      <span>R{Number(bill.file_fee).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2">
                      <span className="text-gray-500">Services</span>
                      <span>R{Number(bill.service_fee).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between px-4 py-2 font-bold">
                      <span>Total</span>
                      <span className={Number(bill.total_amount) === 0 ? 'text-green-600' : 'text-gray-900'}>
                        {Number(bill.total_amount) === 0 ? 'FREE' : `R${Number(bill.total_amount).toFixed(2)}`}
                      </span>
                    </div>
                  </div>

                  {bill.notes && (
                    <p className="text-xs text-gray-400 italic">{bill.notes}</p>
                  )}
                  <p className="text-xs text-gray-300">Ref: BILL-{bill.id}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
