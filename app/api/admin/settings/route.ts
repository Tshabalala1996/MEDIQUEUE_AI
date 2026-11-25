import { NextRequest } from 'next/server';
import { getAuthUser, hasRole } from '@/lib/auth';
import { getRawSettings, saveSettings, SETTING_DEFS, validateSetting } from '@/lib/settings';
import { ok, badRequest, unauthorized, forbidden, serverError, validationError } from '@/lib/response';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  try {
    const raw = await getRawSettings();
    return ok(SETTING_DEFS.map((d) => ({ ...d, value: raw[d.key] ?? d.default })));
  } catch (err) {
    console.error('[Settings GET]', err);
    return serverError();
  }
}

/** Body: { settings: { reminder_lead_hours: "24,2", ... } } — only known keys, each validated. */
export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return unauthorized();
  if (!hasRole(user, 'Admin')) return forbidden();

  const body = await request.json().catch(() => null);
  const incoming = body?.settings;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return badRequest('Body must be { "settings": { key: value } }');
  }

  const clean: Record<string, string> = {};
  const problems: { path: string; message: string }[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    const res = validateSetting(key, value);
    if (res.ok) clean[key] = res.value;
    else problems.push({ path: key, message: res.error });
  }
  if (problems.length) return validationError(problems);
  if (!Object.keys(clean).length) return badRequest('No settings supplied');

  try {
    await saveSettings(clean, user.userId);
    return ok(clean, 'Settings saved');
  } catch (err) {
    console.error('[Settings PUT]', err);
    return serverError();
  }
}
