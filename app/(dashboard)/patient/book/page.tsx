'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmergencyFollowUp } from '@/components/appointments/EmergencyFollowUp';
import { SA_PROVINCES } from '@/types';
import type { Doctor, TimeSlot, Hospital, Clinic } from '@/types';

type Step = 1 | 2 | 3 | 4;
type CareType = 'Public' | 'Private';

export default function BookAppointmentPage() {
  const { apiFetch } = useApi();
  const router = useRouter();

  // Care type selection (Public = free, Private = billed)
  const [careType, setCareType] = useState<CareType | null>(null);

  // Step 1 – Facility selection
  const [facilityType, setFacilityType] = useState<'Hospital' | 'Clinic'>('Hospital');
  const [province, setProvince] = useState('');
  const [facilities, setFacilities] = useState<(Hospital | Clinic)[]>([]);
  const [facilityId, setFacilityId] = useState<number>(0);
  const [facilityName, setFacilityName] = useState('');
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);

  // Step 2 – Doctor selection
  const [search, setSearch] = useState('');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);

  // Step 3 – Time slot selection
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [manualDatetime, setManualDatetime] = useState('');

  // Step 4 – Reason + Submit
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyFollowupId, setEmergencyFollowupId] = useState<number | null>(null);

  const [step, setStep] = useState<Step>(1);

  // AI wait-time estimate shown before the patient confirms (FR03)
  const [estimateResult, setEstimateResult] = useState<{
    key: string; display: string; patientsAhead: number; range: { low: number; high: number } | null;
  } | null>(null);
  const bookingDatetime = selectedSlot ? `${selectedSlot.slot_date}T${selectedSlot.start_time}` : manualDatetime;
  // The estimate is only shown for the doctor/time it was calculated for, so a stale one never lingers.
  const estimateKey = step >= 4 && selectedDoctor && bookingDatetime ? `${selectedDoctor.doctor_id}|${bookingDatetime}` : '';
  const waitEstimate = estimateResult && estimateResult.key === estimateKey ? estimateResult : null;

  useEffect(() => {
    if (!estimateKey || !selectedDoctor) return;
    let cancelled = false;
    const params = new URLSearchParams({ doctor_id: String(selectedDoctor.doctor_id), appointment_datetime: bookingDatetime });
    apiFetch(`/api/ai/predict-wait-time?${params}`)
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const d = (await r.json()).data;
        setEstimateResult({ key: estimateKey, display: d.predicted_wait_display, patientsAhead: d.patients_ahead, range: d.range_minutes });
      })
      .catch(() => { /* the estimate is informational; booking works without it */ });
    return () => { cancelled = true; };
    // selectedDoctor and bookingDatetime are captured by estimateKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateKey, apiFetch]);

  function handleCareTypeChange(nextType: CareType | null) {
    setCareType(nextType);
    setFacilities([]);
    setFacilityId(0);
    setFacilityName('');
    setDoctors([]);
    setSelectedDoctor(null);
    setTimeSlots([]);
    setSelectedSlot(null);
    setManualDatetime('');
    setIsEmergency(false);
    if (nextType === 'Public') setFacilityType('Hospital');
    if (nextType === null) setStep(1);
  }

  async function loadFacilities() {
    if (!careType || facilitiesLoading) return;
    setFacilitiesLoading(true);
    setFacilities([]);
    setFacilityId(0);
    const params = new URLSearchParams({ limit: '50' });
    if (province) params.set('province', province);
    // For public care: only public hospitals; for private: private hospitals or clinics
    if (careType === 'Public') {
      params.set('type', 'Public');
    } else {
      if (facilityType === 'Hospital') params.set('type', 'Private');
    }
    const endpoint = facilityType === 'Hospital' ? '/api/hospitals' : '/api/clinics';
    const res = await apiFetch(`${endpoint}?${params}`);
    if (res.ok) { const d = await res.json(); setFacilities(d.data ?? []); }
    setFacilitiesLoading(false);
  }

  async function loadDoctors() {
    if (doctorsLoading) return;
    setDoctorsLoading(true);
    setDoctors([]);
    setSelectedDoctor(null);
    const params = new URLSearchParams({ limit: '100' });
    if (search) params.set('search', search);
    const res = await apiFetch(`/api/doctors?${params}`);
    if (res.ok) { const d = await res.json(); setDoctors(d.data ?? []); }
    setDoctorsLoading(false);
  }

  async function loadSlots(doctor: Doctor) {
    setSlotsLoading(true);
    setTimeSlots([]);
    setSelectedSlot(null);
    const params = new URLSearchParams({
      doctor_id: String(doctor.doctor_id),
      facility_type: facilityType,
      facility_id: String(facilityId),
    });
    const res = await apiFetch(`/api/time-slots?${params}`);
    if (res.ok) { const d = await res.json(); setTimeSlots(d.data ?? []); }
    setSlotsLoading(false);
  }

  function selectFacility(f: Hospital | Clinic) {
    setFacilityId(f.id);
    setFacilityName(f.name);
    setStep(2);
    setDoctors([]);
    setSelectedDoctor(null);
    // Auto-load doctors immediately when facility is selected
    setTimeout(() => loadDoctors(), 0);
  }

  function selectDoctor(doc: Doctor) {
    setSelectedDoctor(doc);
    setStep(3);
    loadSlots(doc);
  }

  async function handleBook() {
    setError('');
    if (!selectedDoctor) { setError('Please select a doctor'); return; }
    const datetime = selectedSlot ? `${selectedSlot.slot_date}T${selectedSlot.start_time}` : manualDatetime;
    if (!datetime) { setError('Please select or enter a date and time'); return; }

    setSubmitting(true);
    const res = await apiFetch('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({
        doctor_id: selectedDoctor.doctor_id,
        facility_type: facilityType,
        facility_id: facilityId,
        appointment_datetime: datetime,
        reason_for_visit: reason || undefined,
        is_emergency: isEmergency,
        time_slot_id: selectedSlot?.id || undefined,
        care_type: careType,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) { setError(data.error ?? 'Booking failed. Please try again.'); return; }
    setSuccess(`Appointment booked! Reference: APT-${data.data.appointmentId}`);
    if (data.data.isEmergency) {
      setEmergencyFollowupId(data.data.appointmentId);
    } else {
      setTimeout(() => router.push('/patient/appointments'), 2500);
    }
  }

  const consultationFee = selectedDoctor ? Number(selectedDoctor.consultation_fee) : 0;
  const doctorFullName = (selectedDoctor as (Doctor & { full_name?: string }) | null)?.full_name
    ?? (selectedDoctor ? `${selectedDoctor.first_name} ${selectedDoctor.last_name}` : '');

  const STEP_LABELS = ['Facility', 'Doctor', 'Time Slot', 'Confirm'] as const;

  return (
    <div>
      <Header title="Book Appointment" subtitle="Find a doctor and book your appointment" />
      <div className="p-8 space-y-6">

        {/* Care type selector – shown before the steps */}
        {!careType ? (
          <div className="space-y-6">
            <p className="text-sm font-semibold text-[#0D1F3C]">First, choose your care type:</p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Public */}
              <button
                onClick={() => handleCareTypeChange('Public')}
                className="group relative flex flex-col items-start rounded-2xl border-2 border-gray-200 bg-white p-8 text-left shadow-sm transition-all hover:border-emerald-500 hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-4xl border border-emerald-100">
                  🏥
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xl font-extrabold text-[#0D1F3C]">Public Healthcare</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">FREE</span>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed mb-6">
                  Government hospitals. Your contribution is determined by the UPFS means test — many patients pay nothing at all.
                </p>
                <span className="mt-auto inline-flex items-center gap-2 rounded-full border-2 border-emerald-500 px-5 py-2 text-sm font-bold text-emerald-600 group-hover:bg-emerald-50 transition-colors">
                  Select Public Healthcare →
                </span>
              </button>

              {/* Private */}
              <button
                onClick={() => handleCareTypeChange('Private')}
                className="group relative flex flex-col items-start rounded-2xl border-2 border-[#2346E8]/30 bg-[#0D1F3C] p-8 text-left shadow-sm transition-all hover:border-[#2346E8] hover:shadow-lg hover:-translate-y-0.5 overflow-hidden"
              >
                <div className="absolute inset-0 bg-circuit opacity-20" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-4xl border border-white/10">
                    🏨
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xl font-extrabold text-white">Private Healthcare</span>
                    <span className="rounded-full bg-[#2346E8] px-3 py-1 text-xs font-bold text-white">BILLED</span>
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed mb-6">
                    Private hospitals &amp; clinics. The doctor&apos;s consultation fee + any medication are added to your medical bill after the visit.
                  </p>
                  <span className="mt-auto inline-flex items-center gap-2 rounded-full bg-[#2346E8] px-5 py-2 text-sm font-bold text-white group-hover:bg-[#1a3fda] transition-colors shadow-lg shadow-[#2346E8]/30">
                    Select Private Healthcare →
                  </span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Selected care type badge + change link */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 max-w-xl">
              <div className="flex items-center gap-3">
                <span className="text-lg">{careType === 'Public' ? '🏥' : '🏨'}</span>
                <div>
                  <span className="text-sm font-semibold text-[#0D1F3C]">{careType} Healthcare</span>
                  <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${careType === 'Public' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#EEF2FF] text-[#2346E8]'}`}>
                    {careType === 'Public' ? 'FREE' : 'BILLED'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => { handleCareTypeChange(null); setStep(1); }}
                className="text-xs text-gray-400 hover:text-gray-700 underline"
              >
                Change
              </button>
            </div>

            {/* Progress steps */}
            <div className="flex items-center gap-2 text-sm">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold
                    ${step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-[#2346E8] text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className={step === i + 1 ? 'font-medium text-gray-900' : 'text-gray-400'}>{label}</span>
                  {i < 3 && <span className="text-gray-200 mx-1">›</span>}
                </div>
              ))}
            </div>

            {/* Step 1: Facility */}
            <Card title="Step 1: Select Facility">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {careType === 'Private' && (
                    <Select
                      label="Facility Type"
                      value={facilityType}
                      onChange={(e) => { setFacilityType(e.target.value as 'Hospital' | 'Clinic'); setFacilities([]); setFacilityId(0); }}
                      options={[{ value: 'Hospital', label: 'Private Hospital' }, { value: 'Clinic', label: 'Clinic' }]}
                    />
                  )}
                  {careType === 'Public' && (
                    <div className="flex items-end pb-1">
                      <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 font-medium w-full">
                        🏥 Government Hospital
                      </span>
                    </div>
                  )}
                  <Select
                    label="Province (optional)"
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    options={SA_PROVINCES.map((p) => ({ value: p, label: p }))}
                    placeholder="All provinces"
                  />
                </div>
                <Button onClick={loadFacilities} loading={facilitiesLoading} variant="ghost" size="sm">
                  Search {careType === 'Public' ? 'Public Hospitals' : facilityType === 'Hospital' ? 'Private Hospitals' : 'Clinics'}
                </Button>

                {facilities.length > 0 && (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {facilities.map((f) => (
                      <div key={f.id}
                        className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all
                          ${facilityId === f.id ? 'border-[#2346E8] bg-[#EEF2FF]' : 'border-gray-200 hover:border-[#2346E8]/40'}`}
                        onClick={() => selectFacility(f)}
                      >
                        <div>
                          <p className="font-medium text-gray-900">{f.name}</p>
                          <p className="text-xs text-gray-500">{f.city}, {f.province}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">{f.type}</p>
                          {f.average_rating > 0 && <p className="text-xs text-yellow-600">⭐ {Number(f.average_rating).toFixed(1)}</p>}
                          {facilityId === f.id && <span className="text-xs text-[#2346E8] font-medium">✓ Selected</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {facilityId > 0 && (
                  <div className="rounded-lg bg-[#EEF2FF] border border-[#2346E8]/20 px-4 py-2 text-sm text-[#2346E8]">
                    Selected: <strong>{facilityName}</strong>
                  </div>
                )}
              </div>
            </Card>

            {/* Step 2: Doctor */}
            {step >= 2 && (
              <Card title="Step 2: Select Doctor">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <Input
                      label="Search by name"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Doctor name..."
                    />
                  </div>
                  <Button onClick={loadDoctors} loading={doctorsLoading} size="sm" variant="ghost">
                    Search Doctors
                  </Button>

                  {doctors.length > 0 && (
                    <div className="space-y-2">
                      {doctors.map((doc) => {
                        const name = (doc as Doctor & { full_name?: string }).full_name ?? `${doc.first_name} ${doc.last_name}`;
                        const fee = Number(doc.consultation_fee);
                        return (
                          <div key={doc.doctor_id}
                            className={`flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-all
                              ${selectedDoctor?.doctor_id === doc.doctor_id ? 'border-[#2346E8] bg-[#EEF2FF]' : 'border-gray-200 hover:border-[#2346E8]/40'}`}
                            onClick={() => selectDoctor(doc)}
                          >
                            <div>
                              <p className="font-medium text-gray-900">{name}</p>
                              <p className="text-xs text-gray-400">⭐ {Number(doc.average_rating).toFixed(1)} · {doc.years_of_experience ?? 0} yrs exp</p>
                            </div>
                            <div className="text-right">
                              {careType === 'Private' ? (
                                <>
                                  <p className="font-bold text-[#0D1F3C]">R{fee.toFixed(2)}</p>
                                  <p className="text-xs text-gray-500">billed after visit</p>
                                </>
                              ) : (
                                <>
                                  <p className="font-bold text-emerald-600">Free</p>
                                  <p className="text-xs text-gray-500">UPFS means test</p>
                                </>
                              )}
                              {selectedDoctor?.doctor_id === doc.doctor_id && <span className="text-xs text-[#2346E8] font-medium">✓ Selected</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {doctors.length === 0 && !doctorsLoading && (
                    <p className="text-sm text-gray-400 text-center py-4">No doctors found. Try adjusting your filters or click Search.</p>
                  )}
                </div>
              </Card>
            )}

            {/* Step 3: Time Slot */}
            {step >= 3 && selectedDoctor && (
              <Card title="Step 3: Select Date & Time">
                {slotsLoading ? (
                  <div className="flex justify-center py-8"><span className="animate-spin text-3xl">⏳</span></div>
                ) : timeSlots.length === 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-500">No available time slots found. Enter a date and time manually:</p>
                    <Input
                      label="Appointment Date & Time *"
                      type="datetime-local"
                      value={manualDatetime}
                      onChange={(e) => setManualDatetime(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    {manualDatetime && (
                      <Button size="sm" onClick={() => setStep(4)}>Continue</Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {timeSlots.map((slot) => {
                        const isSelected = selectedSlot?.id === slot.id;
                        return (
                          <button key={slot.id}
                            onClick={() => { setSelectedSlot(slot); setStep(4); }}
                            className={`rounded-lg border p-3 text-center text-sm transition-all
                              ${isSelected ? 'border-[#2346E8] bg-[#EEF2FF] text-[#2346E8] font-medium' :
                                'border-gray-200 hover:border-[#2346E8]/40 text-gray-700'}`}
                          >
                            <p className="font-medium text-xs">
                              {new Date(slot.slot_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-sm mt-0.5">{slot.start_time} – {slot.end_time}</p>
                            <p className="text-xs text-gray-400">{slot.max_appointments - slot.current_bookings} left</p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-400">Or enter manually:</p>
                    <Input
                      label="Custom Date & Time"
                      type="datetime-local"
                      value={manualDatetime}
                      onChange={(e) => { setManualDatetime(e.target.value); setSelectedSlot(null); }}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    {manualDatetime && !selectedSlot && (
                      <Button size="sm" onClick={() => setStep(4)}>Continue with manual time</Button>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* Step 4: Confirm */}
            {step >= 4 && selectedDoctor && (
              <Card title="Step 4: Confirm Booking">
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Care Type</span>
                      <span className={`font-bold ${careType === 'Public' ? 'text-emerald-600' : 'text-[#2346E8]'}`}>
                        {careType === 'Public' ? '🏥 Public (Free / UPFS)' : '🏨 Private (Billed)'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Facility</span>
                      <span className="font-medium text-gray-900">{facilityName} ({facilityType})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Doctor</span>
                      <span className="font-medium text-gray-900">{doctorFullName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date &amp; Time</span>
                      <span className="font-medium text-gray-900">
                        {selectedSlot
                          ? new Date(`${selectedSlot.slot_date}T${selectedSlot.start_time}`).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
                          : manualDatetime
                            ? new Date(manualDatetime).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
                            : 'Not selected'}
                      </span>
                    </div>
                    {waitEstimate && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Estimated wait</span>
                        <span className="text-right font-medium text-gray-900">
                          {waitEstimate.display}
                          {waitEstimate.range && (
                            <span className="block text-xs font-normal text-gray-400">
                              likely {waitEstimate.range.low}–{waitEstimate.range.high} min · {waitEstimate.patientsAhead} ahead of you
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                      <span className="font-semibold text-gray-700">Consultation Fee</span>
                      {careType === 'Private' ? (
                        <div className="text-right">
                          <span className="font-bold text-lg text-[#0D1F3C]">R{consultationFee.toFixed(2)}</span>
                          <p className="text-xs text-gray-400">added to your bill after visit</p>
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="font-bold text-lg text-emerald-600">Free</span>
                          <p className="text-xs text-gray-400">UPFS means test applies</p>
                        </div>
                      )}
                    </div>
                    {careType === 'Private' && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                        ℹ️ Any prescribed medication or additional procedures will also be added to your bill after the consultation.
                      </div>
                    )}
                  </div>

                  <Input
                    label="Reason for visit (optional)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Brief description of symptoms or reason..."
                  />

                  <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                    <input
                      type="checkbox"
                      checked={isEmergency}
                      onChange={(event) => setIsEmergency(event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <strong className="block">This is an emergency appointment</strong>
                      Selecting this will immediately ask whether you need an ambulance after the booking is created.
                      For life-threatening emergencies, call 10177 / 112 or go to the nearest emergency department now.
                    </span>
                  </label>

                  {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
                  {success && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{success}</div>}

                  <Button onClick={handleBook} loading={submitting} size="lg" className="w-full">
                    Confirm Booking
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
      {emergencyFollowupId !== null && (
        <EmergencyFollowUp
          appointmentId={emergencyFollowupId}
          initiallyUnanswered
          onClose={() => {
            setEmergencyFollowupId(null);
            router.push('/patient/appointments');
          }}
        />
      )}
    </div>
  );
}
