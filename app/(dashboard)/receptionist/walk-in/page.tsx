'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import type { Hospital, Clinic, Doctor } from '@/types';

export default function WalkInPage() {
  const { apiFetch } = useApi();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [facilityType, setFacilityType] = useState<'Hospital' | 'Clinic'>('Hospital');
  const [facilities, setFacilities] = useState<(Hospital | Clinic)[]>([]);
  const [facilityId, setFacilityId] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [facilityLoading, setFacilityLoading] = useState(false);
  const [doctorLoading, setDoctorLoading] = useState(false);

  const nowLocal = new Date();
  nowLocal.setSeconds(0, 0);
  const defaultDatetime = nowLocal.toISOString().slice(0, 16);

  const [patientEmail, setPatientEmail] = useState('');
  const [datetime, setDatetime] = useState(defaultDatetime);
  const [reason, setReason] = useState('');

  // Load facilities on type change
  useEffect(() => {
    setFacilities([]);
    setFacilityId('');
    setDoctors([]);
    setDoctorId('');
    setFacilityLoading(true);
    const endpoint = facilityType === 'Hospital' ? '/api/hospitals' : '/api/clinics';
    apiFetch(`${endpoint}?limit=100`).then(async (r) => {
      if (r.ok) { const d = await r.json(); setFacilities(d.data ?? []); }
      setFacilityLoading(false);
    });
  }, [facilityType, apiFetch]);

  // Load doctors when facility selected
  useEffect(() => {
    if (!facilityId) return;
    setDoctors([]);
    setDoctorId('');
    setDoctorLoading(true);
    apiFetch(`/api/doctors?limit=50&facility_type=${facilityType}&facility_id=${facilityId}`).then(async (r) => {
      if (r.ok) { const d = await r.json(); setDoctors(d.data ?? []); }
      setDoctorLoading(false);
    });
  }, [facilityId, facilityType, apiFetch]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(''); setMessage('');
    if (!doctorId || !facilityId || !datetime || !patientEmail) {
      setError('All fields are required');
      return;
    }

    setLoading(true);

    // Look up patient by email
    const searchRes = await apiFetch(`/api/patients?search=${encodeURIComponent(patientEmail)}`);
    const searchData = await searchRes.json();
    const patient = searchData.data?.[0];

    if (!patient) {
      setError('No patient account found with that email. Ask them to register at the kiosk or reception.');
      setLoading(false);
      return;
    }

    const res = await apiFetch('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        doctor_id: Number(doctorId),
        facility_type: facilityType,
        facility_id: Number(facilityId),
        appointment_datetime: datetime,
        reason_for_visit: reason || undefined,
        patient_user_id: patient.user_id,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) { setError(data.error ?? 'Failed to create appointment'); return; }
    setMessage(`Walk-in registered! Reference: APT-${data.data.appointmentId}. Patient has been added to today's queue.`);
    setPatientEmail('');
    setReason('');
    setDatetime(defaultDatetime);
  }

  const selectedFacility = facilities.find((f) => String(f.id) === facilityId);
  const selectedDoctor = doctors.find((d) => String(d.doctor_id) === doctorId);

  return (
    <div>
      <Header title="Register Walk-in Patient" subtitle="Create an immediate appointment for an unscheduled patient" />
      <div className="p-8">
        <div className="max-w-lg space-y-6">
          <Card title="Walk-in Appointment">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Patient */}
              <Input
                label="Patient Email *"
                type="email"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                required
                placeholder="patient@example.co.za"
                hint="Used to look up the patient's existing account"
              />

              {/* Facility type */}
              <Select
                label="Facility Type *"
                value={facilityType}
                onChange={(e) => setFacilityType(e.target.value as 'Hospital' | 'Clinic')}
                options={[
                  { value: 'Hospital', label: 'Hospital' },
                  { value: 'Clinic', label: 'Clinic' },
                ]}
              />

              {/* Facility dropdown */}
              <Select
                label="Facility *"
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                options={facilities.map((f) => ({ value: String(f.id), label: `${f.name} — ${f.city}` }))}
                placeholder={facilityLoading ? 'Loading...' : 'Select facility'}
                disabled={facilityLoading || facilities.length === 0}
              />

              {/* Doctor dropdown */}
              <Select
                label="Doctor *"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                options={doctors.map((d) => ({
                  value: String(d.doctor_id),
                  label: `${d.full_name ?? `${d.first_name} ${d.last_name}`} — ${d.specialization_name}`,
                }))}
                placeholder={!facilityId ? 'Select a facility first' : doctorLoading ? 'Loading...' : 'Select doctor'}
                disabled={!facilityId || doctorLoading || doctors.length === 0}
              />

              {/* Date/time */}
              <Input
                label="Appointment Date & Time *"
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
                required
              />

              {/* Reason */}
              <Input
                label="Reason for Visit"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Brief description (optional)"
              />

              {/* Summary */}
              {selectedFacility && selectedDoctor && (
                <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm space-y-1">
                  <p className="font-semibold text-blue-800">Booking Summary</p>
                  <p className="text-blue-700">{selectedFacility.name}</p>
                  <p className="text-blue-700">{selectedDoctor.full_name ?? `${selectedDoctor.first_name} ${selectedDoctor.last_name}`} · {selectedDoctor.specialization_name}</p>
                  <p className="text-blue-600">{new Date(datetime).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              {message && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-700">
                  ✓ {message}
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Register Walk-in Patient
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
