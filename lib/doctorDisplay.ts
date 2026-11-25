/**
 * Some seed/imported doctor names already include a "Dr" prefix (e.g. "Dr Sipho Dlamini")
 * while others don't (e.g. "Priya Naidoo") — code that prepends "Dr. " unconditionally
 * produces "Dr. Dr Sipho Dlamini" for the first group. Shared by every place that renders
 * a doctor's name with a title (emergency routing, symptom-check recommendations, …).
 */
export function doctorLabel(fullName: string): string {
  return /^dr\.?\s/i.test(fullName) ? fullName : `Dr. ${fullName}`;
}
