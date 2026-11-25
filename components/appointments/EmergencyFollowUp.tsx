'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatSouthAfricanDateTime } from '@/lib/emergencyFollowup';

interface Followup {
  ambulanceRequested: boolean;
  ambulanceStatus: 'Requested' | 'NotRequested';
  requestedAt: string;
  estimatedArrivalAt: string | null;
  arrivalDeadlineAt: string | null;
  dispatchProvider: string;
  emailStatus: 'Sending' | 'Sent' | 'Failed';
}

interface Props {
  appointmentId: number;
  onClose: () => void;
  initiallyUnanswered?: boolean;
}

export function EmergencyFollowUp({ appointmentId, onClose, initiallyUnanswered = false }: Props) {
  const { apiFetch } = useApi();
  const [followup, setFollowup] = useState<Followup | null>(null);
  const [loading, setLoading] = useState(!initiallyUnanswered);
  const [error, setError] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(false);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    const response = await apiFetch(`/api/appointments/${appointmentId}/emergency-followup`, { signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Could not load emergency follow-up details');
    setFollowup(payload.data);
    return payload.data as Followup | null;
  }, [apiFetch, appointmentId]);

  useEffect(() => {
    if (initiallyUnanswered) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const start = setTimeout(() => {
      loadStatus(controller.signal)
        .then((existing) => {
          if (existing?.emailStatus === 'Sending') setCheckingStatus(true);
        })
        .catch((cause: unknown) => {
          if (cause instanceof Error && cause.name === 'AbortError') {
            setError('Loading timed out. Retry to check the emergency appointment status.');
          } else if (cause instanceof Error) {
            setError(cause.message);
          } else {
            setError('Could not load emergency follow-up details.');
          }
        })
        .finally(() => {
          clearTimeout(timeout);
          setLoading(false);
        });
    }, 0);
    return () => {
      clearTimeout(start);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [initiallyUnanswered, loadStatus]);

  useEffect(() => {
    if (!checkingStatus) return;
    let active = true;
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts += 1;
      try {
        const current = await loadStatus();
        if (!active || current?.emailStatus !== 'Sending' || attempts >= 10) {
          if (active) {
            setCheckingStatus(false);
            if (current?.emailStatus === 'Sending') {
              setError('Email status is taking longer than expected. Retry to safely check the recorded request.');
            }
          }
        }
      } catch {
        if (active) {
          setCheckingStatus(false);
          setError('Could not check the email status. Retry to safely check the recorded request.');
        }
      }
    }, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [checkingStatus, loadStatus]);

  async function submitChoice(ambulanceRequested: boolean) {
    setLoading(true);
    setError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await apiFetch(`/api/appointments/${appointmentId}/emergency-followup`, {
        method: 'POST',
        body: JSON.stringify({ ambulance_requested: ambulanceRequested }),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (payload.data) setFollowup(payload.data);
      if (response.status === 202) {
        setCheckingStatus(true);
      } else if (!response.ok) {
        setError(payload.error ?? 'The request could not be completed. Retry to safely check its status.');
      }
    } catch (cause) {
      setError(cause instanceof Error && cause.name === 'AbortError'
        ? 'This request timed out. Retry to safely check its status; duplicate requests are prevented.'
        : 'Network error. Retry to safely check the recorded request.');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  const alreadyRecorded = followup !== null;
  const failedEmail = followup?.emailStatus === 'Failed';
  const pendingEmail = followup?.emailStatus === 'Sending';

  return (
    <Modal open onClose={() => { if (!loading) onClose(); }} title="Emergency appointment follow-up" size="lg">
      {loading && !alreadyRecorded ? (
        <div role="status" className="py-6 text-center text-sm text-gray-600">
          <span className="mr-2 inline-block animate-spin">⏳</span>Loading emergency appointment details…
        </div>
      ) : !alreadyRecorded ? (
        <div className="space-y-5">
          <p className="text-lg font-semibold text-[#0D1F3C]">Would you like an ambulance to fetch you?</p>
          <p className="text-sm text-gray-600">Your emergency appointment and queue booking will continue whichever option you choose.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => submitChoice(true)} loading={loading} className="flex-1">Yes</Button>
            <Button onClick={() => submitChoice(false)} loading={loading} variant="ghost" className="flex-1">No</Button>
          </div>
        </div>
      ) : pendingEmail ? (
        <div role="status" className="space-y-3 py-4 text-center">
          <span className="inline-block animate-spin text-2xl">⏳</span>
          <p className="font-medium text-gray-800">Your choice is recorded. Checking the email delivery status…</p>
        </div>
      ) : (
        <div className="space-y-5">
          {followup.ambulanceRequested ? (
            <>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
                <h3 className="font-bold">Ambulance request recorded</h3>
                {followup.estimatedArrivalAt && (
                  <p className="mt-2">Estimated arrival: <strong>{formatSouthAfricanDateTime(followup.estimatedArrivalAt)}</strong></p>
                )}
                <p className="mt-2 text-sm">This is an estimate only. No ambulance has been dispatched by a live provider.</p>
                <p className="mt-2 text-sm font-medium">If dispatch instructions are issued, your booking remains valid only if you follow those emergency instructions.</p>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <h3 className="font-bold">Arrival deadline recorded</h3>
              {followup.arrivalDeadlineAt && (
                <p className="mt-2">You must reach the hospital or clinic by <strong>{formatSouthAfricanDateTime(followup.arrivalDeadlineAt)}</strong>.</p>
              )}
              <p className="mt-2 text-sm">You must reach the facility within one hour of completing the emergency booking. Arrival after the deadline may invalidate your appointment.</p>
            </div>
          )}
          {followup.emailStatus === 'Sent' && (
            <p className="text-sm text-green-700" role="status">A confirmation email was sent.</p>
          )}
          {failedEmail && (
            <div className="space-y-3" role="alert">
              <p className="text-sm text-red-700">{error || 'Your choice is saved, but the email could not be sent.'}</p>
              <Button onClick={() => submitChoice(followup.ambulanceRequested)} loading={loading} variant="secondary">
                Retry email
              </Button>
            </div>
          )}
          {error && !failedEmail && <p className="text-sm text-red-700" role="alert">{error}</p>}
          {followup.emailStatus === 'Sent' && (
            <div className="flex justify-end">
              <Button onClick={onClose}>Continue</Button>
            </div>
          )}
        </div>
      )}
      {!loading && error && !alreadyRecorded && (
        <div className="mt-4 space-y-3" role="alert">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" onClick={() => {
            setLoading(true);
            setError('');
            loadStatus()
              .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not check status'))
              .finally(() => setLoading(false));
          }}>
            Retry status check
          </Button>
        </div>
      )}
      {followup && error && (
        <div className="mt-4 space-y-3" role="alert">
          <p className="text-sm text-red-700">{error}</p>
          {(followup.emailStatus === 'Sending' || followup.emailStatus === 'Failed') && (
            <Button variant="secondary" loading={loading} onClick={() => submitChoice(followup.ambulanceRequested)}>
              Retry or check status
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
