import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { symptomCheckSchema } from '@/lib/validators';
import { ok, badRequest, unauthorized, serverError, validationError } from '@/lib/response';
import { doctorLabel } from '@/lib/doctorDisplay';

/**
 * AI-ready symptom checker endpoint.
 * Currently returns rule-based suggestions from the DB.
 * Replace the scoring logic with your ML model when ready.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON');

  const parsed = symptomCheckSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }

  const { symptoms } = parsed.data;

  try {
    const symptomIds = symptoms.map((s) => s.symptom_id);
    const placeholders = symptomIds.map(() => '?').join(',');

    // Get ICD-10 codes for these symptoms
    const symptomRows = await query<{ id: number; icd10_code: string | null; name: string }[]>(
      `SELECT symptom_id AS id, icd10_code, symptom_name AS name FROM symptoms WHERE symptom_id IN (${placeholders})`,
      symptomIds
    );

    // Simple specialization scoring based on ICD-10 categories
    // In production: call your ML model API here
    const icdCategories = symptomRows
      .map((s) => s.icd10_code?.charAt(0))
      .filter(Boolean);

    const icdToSpecialization: Record<string, string> = {
      A: 'Infectious Disease', B: 'Infectious Disease',
      C: 'Oncology', D: 'Haematology',
      E: 'Endocrinology', F: 'Psychiatry',
      G: 'Neurology', H: 'Ophthalmology',
      I: 'Cardiology', J: 'Pulmonology',
      K: 'Gastroenterology', L: 'Dermatology',
      M: 'Orthopaedics', N: 'Nephrology',
      O: 'Obstetrics & Gynaecology', P: 'Paediatrics',
      Q: 'Genetics', R: 'General Practice',
      S: 'Emergency Medicine', T: 'Emergency Medicine',
    };

    const specializationScores: Record<string, number> = {};
    for (const cat of icdCategories) {
      if (!cat) continue;
      const spec = icdToSpecialization[cat] ?? 'General Practice';
      specializationScores[spec] = (specializationScores[spec] ?? 0) + 1;
    }

    const suggestedSpecialization = Object.entries(specializationScores)
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'General Practice';

    // Find available doctors for the suggested specialization
    const recommendedDoctorRows = await query<{ id: number; full_name: string; specialization: string; consultation_fee: number; average_rating: number }[]>(
      `SELECT d.doctor_id AS id, u.full_name,
              s.name AS specialization, d.consultation_fee, d.rating_avg AS average_rating
       FROM doctors d
       JOIN users u ON u.user_id = d.user_id
       JOIN specializations s ON s.specialization_id = d.specialization_id
       WHERE s.name = ? AND u.is_active = 1
       ORDER BY d.rating_avg DESC LIMIT 5`,
      [suggestedSpecialization]
    );
    // Some seed data already has "Dr" baked into full_name; doctorLabel avoids "Dr. Dr X".
    const recommendedDoctors = recommendedDoctorRows.map((d) => ({ ...d, name: doctorLabel(d.full_name) }));

    // Severity score (0-100)
    const severityScore = symptoms.reduce((sum, s) => {
      const weight = s.severity === 'Severe' ? 3 : s.severity === 'Moderate' ? 2 : 1;
      return sum + weight * Math.min(s.duration_days, 14);
    }, 0);
    const urgency = severityScore > 30 ? 'Urgent' : severityScore > 15 ? 'Soon' : 'Routine';

    return ok({
      suggested_specialization: suggestedSpecialization,
      urgency,
      severity_score: severityScore,
      recommended_doctors: recommendedDoctors,
      disclaimer: 'This is an AI-assisted suggestion only. Please consult a qualified medical professional.',
    });
  } catch (err) {
    console.error('[AI Symptom Check]', err);
    return serverError();
  }
}
