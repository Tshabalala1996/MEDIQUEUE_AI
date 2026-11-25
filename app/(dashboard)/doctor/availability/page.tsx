'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { TimeSlot } from '@/types';

interface Facility { id: number; name: string; type: 'Hospital' | 'Clinic' }
interface SlotInput { slot_date: string; start_time: string; end_time: string; max_appointments: number }

export default function DoctorAvailabilityPage() {
  const { apiFetch } = useApi();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [existingSlots, setExistingSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [newSlots, setNewSlots] = useState<SlotInput[]>([
    { slot_date: '', start_time: '08:00', end_time: '08:30', max_appointments: 1 },
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<number | null>(null);

  // Load doctor's assigned facilities
  useEffect(() => {
    async function loadFacilities() {
      setFacilitiesLoading(true);
      try {
        // Fetch assigned hospitals and clinics in parallel
        const [hospRes, clinicRes] = await Promise.all([
          apiFetch('/api/doctors/my-facilities?type=Hospital'),
          apiFetch('/api/doctors/my-facilities?type=Clinic'),
        ]);
        const combined: Facility[] = [];
        if (hospRes.ok) {
          const d = await hospRes.json();
          (d.data ?? []).forEach((h: { id: number; name: string }) =>
            combined.push({ id: h.id, name: h.name, type: 'Hospital' })
          );
        }
        if (clinicRes.ok) {
          const d = await clinicRes.json();
          (d.data ?? []).forEach((c: { id: number; name: string }) =>
            combined.push({ id: c.id, name: c.name, type: 'Clinic' })
          );
        }
        setFacilities(combined);
        if (combined.length === 1) setSelectedFacility(combined[0]);
      } catch { /* ignore */ }
      setFacilitiesLoading(false);
    }
    loadFacilities();
  }, [apiFetch]);

  // Load existing slots when facility changes
  useEffect(() => {
    if (!selectedFacility) { setExistingSlots([]); return; }
    setSlotsLoading(true);
    apiFetch(`/api/time-slots?facility_type=${selectedFacility.type}&facility_id=${selectedFacility.id}&show_all=1`)
      .then(async (r) => {
        if (r.ok) { const d = await r.json(); setExistingSlots(d.data ?? []); }
        setSlotsLoading(false);
      });
  }, [selectedFacility, apiFetch]);

  function addSlotRow() {
    setNewSlots((s) => [...s, { slot_date: '', start_time: '08:00', end_time: '08:30', max_appointments: 1 }]);
  }
  function updateSlot(i: number, field: keyof SlotInput, value: string | number) {
    setNewSlots((prev) => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  }
  function removeSlot(i: number) {
    setNewSlots((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveSlots() {
    if (!selectedFacility) { setMessage('Please select a facility first'); return; }
    const validSlots = newSlots.filter((s) => s.slot_date && s.start_time && s.end_time);
    if (!validSlots.length) { setMessage('Please fill in at least one slot with a date'); return; }

    setSaving(true);
    setMessage('');
    const res = await apiFetch('/api/time-slots', {
      method: 'POST',
      body: JSON.stringify({
        facility_type: selectedFacility.type,
        facility_id: selectedFacility.id,
        slots: validSlots,
      }),
    });
    const d = await res.json();
    if (res.ok) {
      setMessage(`${d.message ?? 'Slots saved successfully'}`);
      setNewSlots([{ slot_date: '', start_time: '08:00', end_time: '08:30', max_appointments: 1 }]);
      // Reload existing slots
      if (selectedFacility) {
        const r2 = await apiFetch(`/api/time-slots?facility_type=${selectedFacility.type}&facility_id=${selectedFacility.id}&show_all=1`);
        if (r2.ok) { const d2 = await r2.json(); setExistingSlots(d2.data ?? []); }
      }
    } else {
      setMessage(`Error: ${d.error ?? 'Failed to save slots'}`);
    }
    setSaving(false);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <Header title="Set Availability" subtitle="Manage your time slots for patients to book" />
      <div className="p-8 space-y-6 max-w-3xl">

        {/* Facility selection */}
        <Card title="Select Facility">
          {facilitiesLoading ? (
            <div className="flex justify-center py-4"><span className="animate-spin text-2xl">⏳</span></div>
          ) : facilities.length === 0 ? (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
              You are not assigned to any hospital or clinic yet. Contact an admin to be assigned.
            </div>
          ) : (
            <div className="space-y-2">
              {facilities.map((f) => (
                <div key={`${f.type}-${f.id}`}
                  className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all
                    ${selectedFacility?.id === f.id && selectedFacility?.type === f.type
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'}`}
                  onClick={() => setSelectedFacility(f)}
                >
                  <div>
                    <p className="font-medium text-gray-900">{f.name}</p>
                    <p className="text-xs text-gray-500">{f.type}</p>
                  </div>
                  {selectedFacility?.id === f.id && selectedFacility?.type === f.type && (
                    <span className="text-xs text-blue-600 font-medium">✓ Selected</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Add new slots */}
        {selectedFacility && (
          <Card title={`Add Time Slots — ${selectedFacility.name}`}
            action={<Button size="sm" variant="ghost" onClick={addSlotRow}>+ Add Row</Button>}>
            <div className="space-y-3">
              {newSlots.map((slot, i) => (
                <div key={i} className="grid grid-cols-4 gap-3 items-end">
                  <Input label="Date" type="date" value={slot.slot_date}
                    onChange={(e) => updateSlot(i, 'slot_date', e.target.value)}
                    min={today} />
                  <Input label="Start" type="time" value={slot.start_time}
                    onChange={(e) => updateSlot(i, 'start_time', e.target.value)} />
                  <Input label="End" type="time" value={slot.end_time}
                    onChange={(e) => updateSlot(i, 'end_time', e.target.value)} />
                  <div className="flex items-end gap-2">
                    <Input label="Max" type="number" value={slot.max_appointments}
                      onChange={(e) => updateSlot(i, 'max_appointments', Number(e.target.value))} min={1} />
                    {newSlots.length > 1 && (
                      <button onClick={() => removeSlot(i)} className="mb-2 text-red-400 hover:text-red-600 text-xl leading-none">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {message && (
              <p className={`mt-4 text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>{message}</p>
            )}
            <div className="mt-4">
              <Button loading={saving} onClick={saveSlots}>Save Time Slots</Button>
            </div>
          </Card>
        )}

        {/* Existing slots */}
        {selectedFacility && (
          <Card title={`Upcoming Slots${existingSlots.length > 0 ? ` (${existingSlots.length})` : ''}`}>
            {slotsLoading ? (
              <div className="flex justify-center py-4"><span className="animate-spin text-2xl">⏳</span></div>
            ) : existingSlots.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No slots set yet.</p>
            ) : (
              <div className="space-y-1">
                {existingSlots.map((slot) => (
                  <div key={slot.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-700">
                        {new Date(slot.slot_date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="ml-2 text-gray-500">{slot.start_time}–{slot.end_time}</span>
                    </div>
                    <span className="text-gray-400">{slot.current_bookings}/{slot.max_appointments} booked</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
