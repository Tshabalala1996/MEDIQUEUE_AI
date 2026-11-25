import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEmergencyFollowupEmail,
  calculateArrivalDeadline,
  calculateEstimatedArrival,
  canAccessEmergencyAppointment,
  getAmbulanceEtaMinutes,
  resolveEmergencyFollowupAction,
} from '../lib/emergencyFollowup.ts';

const appointmentDetails = {
  appointmentId: 42,
  patientName: 'Alex Patient',
  doctorName: 'Dr Example',
  facilityName: 'Central Hospital',
  facilityType: 'Hospital',
  facilityAddress: '1 Main Street',
  facilityCity: 'Johannesburg',
  facilityPhone: '011 555 0100',
  facilityEmail: 'contact@example.org',
  appointmentDateTime: '2026-11-22 10:30:00',
};

test('emergency booking with an ambulance records the request and a marked estimated ETA email', () => {
  const eta = calculateEstimatedArrival(new Date('2026-11-22T08:00:00Z'), getAmbulanceEtaMinutes(undefined));
  assert.equal(eta.toISOString(), '2026-11-22T08:30:00.000Z');

  const email = buildEmergencyFollowupEmail({
    ...appointmentDetails,
    choice: 'ambulance',
    estimatedArrivalAt: '2026-11-22 10:30:00',
  });
  assert.match(email.subject, /ambulance request recorded/i);
  assert.match(email.html, /recorded/i);
  assert.match(email.html, /Estimated ambulance arrival/);
  assert.match(email.html, /estimate only/i);
  assert.match(email.html, /not confirm that an ambulance has been dispatched/i);
  assert.match(email.html, /APT-42/);
  assert.match(email.html, /Alex Patient/);
  assert.match(email.html, /Dr Example/);
  assert.match(email.html, /Central Hospital/);
  assert.match(email.html, /22 Nov 2026/);
});

test('emergency booking without an ambulance creates the one-hour deadline email', () => {
  const deadline = calculateArrivalDeadline(new Date('2026-11-22T08:00:00Z'));
  assert.equal(deadline.toISOString(), '2026-11-22T09:00:00.000Z');

  const email = buildEmergencyFollowupEmail({
    ...appointmentDetails,
    choice: 'self-arrival',
    arrivalDeadlineAt: '2026-11-22 11:30:00',
  });
  assert.match(email.html, /within one hour/);
  assert.match(email.html, /You must arrive by/);
  assert.match(email.html, /Arrival after this deadline may invalidate your appointment/);
  assert.match(email.html, /1 Main Street, Johannesburg/);
  assert.match(email.html, /011 555 0100/);
  assert.match(email.html, /contact@example.org/);
});

test('ambulance ETA configuration is bounded and invalid estimates are rejected', () => {
  assert.equal(getAmbulanceEtaMinutes('45'), 45);
  assert.throws(() => getAmbulanceEtaMinutes('0'), RangeError);
  assert.throws(() => calculateEstimatedArrival(new Date(), 181), RangeError);
});

test('duplicate follow-up requests never create or send duplicate emails', () => {
  assert.equal(resolveEmergencyFollowupAction(null, true), 'create');
  assert.equal(resolveEmergencyFollowupAction({ ambulance_requested: true, email_status: 'Sent' }, true), 'existing');
  assert.equal(resolveEmergencyFollowupAction({ ambulance_requested: true, email_status: 'Sending' }, true), 'processing');
  assert.equal(resolveEmergencyFollowupAction({ ambulance_requested: true, email_status: 'Failed' }, true), 'retry');
  assert.equal(resolveEmergencyFollowupAction({ ambulance_requested: true, email_status: 'Sent' }, false), 'conflict');
});

test('emergency follow-up authorization requires an authenticated patient who owns the emergency appointment', () => {
  assert.equal(canAccessEmergencyAppointment({
    roles: ['Patient'],
    userId: 7,
    ownerUserId: 7,
    isEmergency: true,
  }), true);
  assert.equal(canAccessEmergencyAppointment({
    roles: ['Patient'],
    userId: 8,
    ownerUserId: 7,
    isEmergency: true,
  }), false);
  assert.equal(canAccessEmergencyAppointment({
    roles: ['Doctor'],
    userId: 7,
    ownerUserId: 7,
    isEmergency: true,
  }), false);
});
