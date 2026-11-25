export type EmergencyFollowupChoice = 'ambulance' | 'self-arrival';
export type EmergencyFollowupEmailStatus = 'Sending' | 'Sent' | 'Failed';

export interface ExistingEmergencyFollowup {
  ambulance_requested: boolean;
  email_status: EmergencyFollowupEmailStatus;
}

export interface EmergencyAppointmentAccess {
  roles: string[];
  userId: number;
  ownerUserId: number;
  isEmergency: boolean;
}

export interface EmergencyFollowupEmailDetails {
  choice: EmergencyFollowupChoice;
  appointmentId: number;
  patientName: string;
  doctorName: string;
  facilityName: string;
  facilityType: 'Hospital' | 'Clinic';
  facilityAddress: string;
  facilityCity: string;
  facilityPhone: string | null;
  facilityEmail: string | null;
  appointmentDateTime: string;
  estimatedArrivalAt?: string;
  arrivalDeadlineAt?: string;
}

export function calculateEstimatedArrival(requestedAt: Date, etaMinutes: number): Date {
  if (!Number.isInteger(etaMinutes) || etaMinutes < 1 || etaMinutes > 180) {
    throw new RangeError('Ambulance ETA must be between 1 and 180 minutes');
  }
  return new Date(requestedAt.getTime() + etaMinutes * 60_000);
}

export function calculateArrivalDeadline(bookedAt: Date): Date {
  return new Date(bookedAt.getTime() + 60 * 60_000);
}

export function getAmbulanceEtaMinutes(configuredValue: string | undefined): number {
  if (configuredValue === undefined || configuredValue.trim() === '') return 30;
  const minutes = Number(configuredValue);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
    throw new RangeError('AMBULANCE_ESTIMATED_ARRIVAL_MINUTES must be an integer from 1 to 180');
  }
  return minutes;
}

export function formatMySqlDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

export function parseMySqlDateTime(value: string): Date {
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(iso) ? new Date(iso) : new Date(`${iso}+02:00`);
}

export function formatSouthAfricanDateTime(value: string): string {
  return parseMySqlDateTime(value).toLocaleString('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
}

export function canAccessEmergencyAppointment(access: EmergencyAppointmentAccess): boolean {
  return access.roles.includes('Patient')
    && access.userId === access.ownerUserId
    && access.isEmergency;
}

export function resolveEmergencyFollowupAction(
  existing: ExistingEmergencyFollowup | null,
  ambulanceRequested: boolean
): 'create' | 'retry' | 'existing' | 'processing' | 'conflict' {
  if (!existing) return 'create';
  if (Boolean(existing.ambulance_requested) !== ambulanceRequested) return 'conflict';
  if (existing.email_status === 'Sent') return 'existing';
  if (existing.email_status === 'Sending') return 'processing';
  return 'retry';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

export function buildEmergencyFollowupEmail(details: EmergencyFollowupEmailDetails): {
  subject: string;
  html: string;
} {
  const appointmentDateTime = escapeHtml(formatSouthAfricanDateTime(details.appointmentDateTime));
  const facilityLocation = `${escapeHtml(details.facilityAddress)}, ${escapeHtml(details.facilityCity)}`;
  const phone = details.facilityPhone
    ? `<tr><td>Phone</td><td>${escapeHtml(details.facilityPhone)}</td></tr>`
    : '';
  const email = details.facilityEmail
    ? `<tr><td>Email</td><td>${escapeHtml(details.facilityEmail)}</td></tr>`
    : '';
  const appointmentRows = `
    <tr><td>Reference</td><td>APT-${details.appointmentId}</td></tr>
    <tr><td>Doctor</td><td>${escapeHtml(details.doctorName)}</td></tr>
    <tr><td>${escapeHtml(details.facilityType)}</td><td>${escapeHtml(details.facilityName)}</td></tr>
    <tr><td>Location</td><td>${facilityLocation}</td></tr>
    ${phone}
    ${email}
    <tr><td>Appointment date and time</td><td>${appointmentDateTime}</td></tr>`;

  if (details.choice === 'ambulance') {
    if (!details.estimatedArrivalAt) throw new Error('Ambulance ETA is required');
    return {
      subject: 'Emergency ambulance request recorded — U-CHECK Healthcare',
      html: `
        <h2>Ambulance request recorded</h2>
        <p>Dear <strong>${escapeHtml(details.patientName)}</strong>, your request for an ambulance to fetch you has been recorded for your emergency appointment.</p>
        <table>${appointmentRows}</table>
        <p><strong>Estimated ambulance arrival:</strong> ${escapeHtml(formatSouthAfricanDateTime(details.estimatedArrivalAt))}</p>
        <p><strong>This is an estimate only.</strong> No real-time ambulance dispatch provider is connected, and this message does not confirm that an ambulance has been dispatched.</p>
        <p>If dispatch instructions are issued, your booking remains valid only if you follow those emergency instructions.</p>`,
    };
  }

  if (!details.arrivalDeadlineAt) throw new Error('Arrival deadline is required');
  return {
    subject: 'Emergency appointment arrival deadline — U-CHECK Healthcare',
    html: `
      <h2>Emergency appointment arrival deadline</h2>
      <p>Dear <strong>${escapeHtml(details.patientName)}</strong>, please reach your ${escapeHtml(details.facilityType.toLowerCase())} within one hour of completing your emergency booking.</p>
      <table>${appointmentRows}</table>
      <p><strong>You must arrive by:</strong> ${escapeHtml(formatSouthAfricanDateTime(details.arrivalDeadlineAt))}</p>
      <p>Arrival after this deadline may invalidate your appointment.</p>`,
  };
}
