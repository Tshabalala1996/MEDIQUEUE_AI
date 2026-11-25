export type Role = 'Patient' | 'Doctor' | 'Nurse' | 'Receptionist' | 'Admin';

export interface JWTPayload {
  userId: number;
  email: string;
  roles: Role[];
}

// ─── User & Auth ──────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  id_number: string;
  date_of_birth: string | null;
  gender: 'Male' | 'Female' | 'Other' | null;
  address: string | null;
  profile_picture: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  roles: Role[];
}

export interface Patient extends User {
  patient_id: number;
  user_id: number;
  medical_aid_provider: string | null;
  medical_aid_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  blood_type: string | null;
  allergies: string | null;
}

export interface Doctor extends User {
  doctor_id: number;
  user_id: number;
  full_name?: string;
  hpcsa_number: string;
  practice_number: string | null;
  specialization_id: number;
  specialization_name: string;
  consultation_fee: number;
  years_of_experience: number | null;
  bio: string | null;
  average_rating: number;
  total_reviews: number;
}

// ─── Facility ─────────────────────────────────────────────────────────────────

export type Province =
  | 'Eastern Cape'
  | 'Free State'
  | 'Gauteng'
  | 'KwaZulu-Natal'
  | 'Limpopo'
  | 'Mpumalanga'
  | 'Northern Cape'
  | 'North West'
  | 'Western Cape';

export const SA_PROVINCES: Province[] = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];

export interface Hospital {
  id: number;
  name: string;
  type: 'Public' | 'Private';
  province: Province;
  city: string;
  address: string;
  phone_number: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  average_rating: number;
}

export interface Clinic {
  id: number;
  name: string;
  type: 'GP' | 'Community' | 'Specialist' | 'Other';
  province: Province;
  city: string;
  address: string;
  phone_number: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  average_rating: number;
}

export interface Specialization {
  id: number;
  name: string;
  description: string | null;
  icd10_category: string | null;
}

// ─── Appointments & Queue ─────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'Scheduled'
  | 'Confirmed'
  | 'In-Progress'
  | 'Completed'
  | 'Cancelled'
  | 'No-Show'
  | 'Referred';

export type QueueStatus = 'Waiting' | 'In-Progress' | 'Completed' | 'No-Show' | 'Skipped' | 'Referred';

/** South African Triage Scale colours, most to least urgent. */
export type TriageCategory = 'Red' | 'Orange' | 'Yellow' | 'Green';

export interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  facility_type: 'Hospital' | 'Clinic';
  facility_id: number;
  is_emergency: boolean | number;
  appointment_datetime: string;
  status: AppointmentStatus;
  reason_for_visit: string | null;
  notes: string | null;
  consultation_fee: number;
  patient_name: string;
  doctor_name: string;
  facility_name: string;
  specialization_name: string;
  created_at: string;
}

export interface QueueEntry {
  id: number;
  appointment_id: number;
  doctor_id: number;
  patient_id: number;
  queue_position: number;
  status: QueueStatus;
  estimated_wait_minutes: number | null;
  /** Waiting patients (and the one being served) ranked ahead of this entry. */
  patients_ahead: number;
  /** 1 (Red) … 4 (Green / not yet triaged). */
  priority_level: number;
  triage_category: TriageCategory | null;
  /** True when the AI emergency pre-check queued this patient and no clinician has confirmed the priority yet. */
  ai_flagged: boolean;
  referred_to: string | null;
  referral_reason: string | null;
  called_at: string | null;
  completed_at: string | null;
  appointment_datetime: string;
  patient_name: string;
  doctor_name: string;
  facility_name: string;
  consultation_fee: number;
  care_type: 'Public' | 'Private';
}

export interface TimeSlot {
  id: number;
  doctor_id: number;
  facility_type: 'Hospital' | 'Clinic';
  facility_id: number;
  slot_date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  max_appointments: number;
  current_bookings: number;
}

// ─── Medical ──────────────────────────────────────────────────────────────────

export interface MedicalHistory {
  id: number;
  patient_id: number;
  appointment_id: number | null;
  doctor_id: number | null;
  diagnosis: string;
  prescription: string | null;
  notes: string | null;
  visit_date: string;
  doctor_name: string | null;
}

export interface Symptom {
  id: number;
  name: string;
  description: string | null;
  icd10_code: string | null;
  body_part: string | null;
}

export interface PatientSymptom {
  id: number;
  patient_id: number;
  symptom_id: number;
  symptom_name: string;
  severity: 'Mild' | 'Moderate' | 'Severe';
  duration_days: number;
  created_at: string;
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface Review {
  id: number;
  patient_id: number;
  reviewer_name: string;
  doctor_id: number | null;
  hospital_id: number | null;
  clinic_id: number | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = 'SMS' | 'Email' | 'Push';
export type NotificationStatus = 'Pending' | 'Sent' | 'Failed';

export interface Notification {
  id: number;
  user_id: number;
  appointment_id: number | null;
  type: NotificationType;
  message: string;
  status: NotificationStatus;
  sent_at: string | null;
  created_at: string;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface PaginationParams {
  limit: number;
  offset: number;
}
