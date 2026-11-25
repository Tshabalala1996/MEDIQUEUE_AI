'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { QueueEntry } from '@/types';

interface Props {
  open: boolean;
  entry: QueueEntry | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (referredTo: string, reason: string) => void;
}

/**
 * Collects where a patient is being referred and why (FR09 — "referred" status).
 * Callers mount it only while a patient is selected, so the form starts blank each time.
 */
export function ReferModal({ open, entry, loading, onClose, onConfirm }: Props) {
  const [referredTo, setReferredTo] = useState('');
  const [reason, setReason] = useState('');

  return (
    <Modal open={open} onClose={onClose} title={entry ? `Refer ${entry.patient_name}` : 'Refer patient'}>
      <div className="space-y-4">
        <Input
          label="Refer to *"
          value={referredTo}
          onChange={(e) => setReferredTo(e.target.value)}
          placeholder="Facility, department or specialist"
          maxLength={255}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[#0D1F3C]/80">Reason <span className="font-normal text-gray-400">(optional)</span></span>
          <textarea
            value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#2346E8] focus:ring-2 focus:ring-[#2346E8]/20"
          />
        </label>
        <p className="text-xs text-gray-500">
          The patient leaves this queue, the visit is recorded as referred, and the patient is notified.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={loading} disabled={!referredTo.trim()} onClick={() => onConfirm(referredTo.trim(), reason.trim())}>
            Confirm referral
          </Button>
        </div>
      </div>
    </Modal>
  );
}
