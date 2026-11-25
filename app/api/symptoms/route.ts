import { query } from '@/lib/db';
import { ok, serverError } from '@/lib/response';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search');
  const params: unknown[] = [];
  let where = '';

  if (search) {
    where = 'WHERE symptom_name LIKE ?';
    params.push(`%${search}%`);
  }

  try {
    // The `symptoms` table has no `body_part` column — a previous version of this query
    // referenced one that doesn't exist, which made every search silently fail (500).
    const symptoms = await query<unknown[]>(
      `SELECT symptom_id AS id, symptom_name AS name, description, icd10_code FROM symptoms ${where} ORDER BY symptom_name ASC`,
      params
    );
    return ok(symptoms);
  } catch (err) {
    console.error('[Symptoms GET]', err);
    return serverError();
  }
}
