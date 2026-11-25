import { TRIAGE_META } from '@/lib/triage';
import type { TriageCategory } from '@/types';

const STYLES: Record<TriageCategory, string> = {
  Red: 'bg-red-600 text-white',
  Orange: 'bg-orange-500 text-white',
  Yellow: 'bg-yellow-300 text-yellow-900',
  Green: 'bg-green-500 text-white',
};

export function TriageBadge({ category, compact = false }: { category: TriageCategory | null; compact?: boolean }) {
  if (!category) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        Not triaged
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${STYLES[category]}`}>
      {compact ? category : `${category} · ${TRIAGE_META[category].label}`}
    </span>
  );
}

/** Shown on a queue entry the AI emergency pre-check fast-tracked, until a clinician confirms it via Triage. */
export function AiFlagPill() {
  return (
    <span className="inline-flex animate-pulse items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
      ⚠ AI flagged — confirm now
    </span>
  );
}
