import { z } from 'zod';

// ─── SA ID Number Validation (Luhn Algorithm) ─────────────────────────────────

function luhnCheck(idNumber: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = idNumber.length - 1; i >= 0; i--) {
    let n = parseInt(idNumber[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

export function validateSAID(idNumber: string): boolean {
  if (!/^\d{13}$/.test(idNumber)) return false;
  const year = parseInt(idNumber.substring(0, 2), 10);
  const month = parseInt(idNumber.substring(2, 4), 10);
  const day = parseInt(idNumber.substring(4, 6), 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Gender digit: 0-4 = Female, 5-9 = Male (digits 6-9)
  const citizenship = parseInt(idNumber[10], 10);
  if (citizenship !== 0 && citizenship !== 1) return false;
  return luhnCheck(idNumber);
}

export function extractGenderFromID(idNumber: string): 'Male' | 'Female' {
  return parseInt(idNumber.substring(6, 10), 10) >= 5000 ? 'Male' : 'Female';
}

export function extractDOBFromID(idNumber: string): string {
  const year = parseInt(idNumber.substring(0, 2), 10);
  const month = idNumber.substring(2, 4);
  const day = idNumber.substring(4, 6);
  const fullYear = year >= 0 && year <= 24 ? 2000 + year : 1900 + year;
  return `${fullYear}-${month}-${day}`;
}

// ─── HPCSA Number Validation ──────────────────────────────────────────────────

export function validateHPCSA(hpcsaNumber: string): boolean {
  // Format: Letters followed by digits, e.g. MP1234567 or PS9876543
  return /^[A-Z]{2}\d{7}$/.test(hpcsaNumber);
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const saID = z
  .string()
  .length(13, 'SA ID number must be exactly 13 digits')
  .regex(/^\d{13}$/, 'SA ID number must contain only digits')
  .refine(validateSAID, 'Invalid SA ID number (Luhn check failed)');

const phoneZA = z
  .string()
  .regex(/^(\+27|0)[6-8][0-9]{8}$/, 'Invalid South African phone number');

const hpcsaNumber = z
  .string()
  .refine(validateHPCSA, 'HPCSA number must be in format MP1234567');

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone_number: phoneZA.optional(),
  id_number: saID,
  role: z.enum(['Patient', 'Doctor', 'Receptionist']),
  // Patient extras
  medical_aid_provider: z.string().optional(),
  medical_aid_number: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: phoneZA.optional(),
  blood_type: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  allergies: z.string().optional(),
  // Doctor extras
  hpcsa_number: hpcsaNumber.optional(),
  practice_number: z.string().optional(),
  specialization_id: z.number().positive().optional(),
  consultation_fee: z.number().positive().optional(),
  years_of_experience: z.number().nonnegative().optional(),
  bio: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const appointmentSchema = z.object({
  doctor_id: z.number().positive(),
  facility_type: z.enum(['Hospital', 'Clinic']),
  facility_id: z.number().positive(),
  appointment_datetime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  reason_for_visit: z.string().max(500).optional(),
  is_emergency: z.boolean().optional().default(false),
  time_slot_id: z.number().positive().optional(),
  symptoms: z
    .array(
      z.object({
        symptom_id: z.number().positive(),
        severity: z.enum(['Mild', 'Moderate', 'Severe']),
        duration_days: z.number().positive(),
      })
    )
    .optional(),
});

export const queueActionSchema = z
  .object({
    action: z.enum(['call', 'complete', 'no-show', 'skip', 'waiting', 'refer']),
    referred_to: z.string().trim().min(1).max(255).optional(),
    referral_reason: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.action !== 'refer' || !!d.referred_to, {
    message: 'referred_to is required when referring a patient',
    path: ['referred_to'],
  });

// ─── Triage (FR04) ────────────────────────────────────────────────────────────

const vital = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();

export const triageInputSchema = z.object({
  vitals: z
    .object({
      respiratoryRate: vital(0, 80),
      heartRate: vital(0, 300),
      systolicBp: vital(0, 300),
      temperatureC: vital(25, 45),
      spo2: vital(0, 100),
      glucoseMmol: vital(0, 60),
    })
    .optional(),
  avpu: z.enum(['Alert', 'Voice', 'Pain', 'Unresponsive']).nullable().optional(),
  mobility: z.enum(['Walking', 'WithHelp', 'Stretcher']).nullable().optional(),
  trauma: z.boolean().optional(),
  discriminators: z.array(z.string().max(60)).max(30).optional(),
});

export const triageSuggestSchema = triageInputSchema.extend({
  queue_id: z.number().positive(),
});

export const triageSaveSchema = triageSuggestSchema.extend({
  category: z.enum(['Red', 'Orange', 'Yellow', 'Green']),
  notes: z.string().max(1000).optional(),
});

// ─── Wait-time prediction contract (FR03) ─────────────────────────────────────

export const predictWaitingTimeSchema = z.object({
  queue_length: z.number().int().min(0).max(1000),
  available_doctors: z.number().int().min(1).max(100),
  average_consultation_time: z.number().positive().max(240),
  priority_level: z.number().int().min(1).max(4).optional(),
  hour_of_day: z.number().int().min(0).max(23).optional(),
  doctor_id: z.number().positive().optional(),
});

// ─── Admin ────────────────────────────────────────────────────────────────────

/** Staff accounts are created by an Admin only — never through public registration. */
export const staffSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  phone_number: phoneZA.optional(),
  id_number: saID,
  role: z.enum(['Nurse', 'Receptionist', 'Admin']),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const reportQuerySchema = z.object({
  type: z.enum(['waiting-times', 'appointments', 'queue-performance']),
  from: isoDate,
  to: isoDate,
  doctor_id: z.coerce.number().positive().optional(),
});

export const doctorAvailabilitySchema = z.object({
  facility_type: z.enum(['Hospital', 'Clinic']),
  facility_id: z.number().positive(),
  slots: z.array(
    z.object({
      slot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start_time: z.string().regex(/^\d{2}:\d{2}$/),
      end_time: z.string().regex(/^\d{2}:\d{2}$/),
      max_appointments: z.number().positive().default(1),
    })
  ),
});

export const reviewSchema = z.object({
  doctor_id: z.number().positive().optional(),
  hospital_id: z.number().positive().optional(),
  clinic_id: z.number().positive().optional(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// ─── AI Emergency Pre-Check ────────────────────────────────────────────────────

export const emergencyPrecheckSchema = z.object({
  hospital_id: z.number().positive(),
  description: z.string().trim().min(10, 'Please describe what is happening in a bit more detail').max(2000),
});

export const symptomCheckSchema = z.object({
  symptoms: z.array(
    z.object({
      symptom_id: z.number().positive(),
      severity: z.enum(['Mild', 'Moderate', 'Severe']),
      duration_days: z.number().positive(),
    })
  ).min(1),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().positive().max(100).catch(20),
  offset: z.coerce.number().nonnegative().catch(0),
});

export const hospitalSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['Public', 'Private']),
  province: z.enum([
    'Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal',
    'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape',
  ]),
  city: z.string().min(1).max(100),
  address: z.string().min(1).max(500),
  phone_number: z.string().optional(),
  email: z.string().email().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const clinicSchema = hospitalSchema.extend({
  type: z.enum(['GP', 'Community', 'Specialist', 'Other']),
});

export const medicalHistorySchema = z.object({
  patient_id: z.number().positive(),
  appointment_id: z.number().positive().optional(),
  diagnosis: z.string().min(1),
  prescription: z.string().optional(),
  notes: z.string().optional(),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
