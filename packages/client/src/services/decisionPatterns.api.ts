import { authFetch } from './authFetch';
import type {
  DecisionPattern,
  PatternAdoptionStats,
  PatternCategory,
  PatternLifecycleStatus,
} from '@thearchitect/shared';

export interface FetchPatternsFilter {
  category?: PatternCategory;
  lifecycleStatus?: PatternLifecycleStatus;
}

export async function fetchDecisionPatterns(
  filter?: FetchPatternsFilter,
): Promise<DecisionPattern[]> {
  const params = new URLSearchParams();
  if (filter?.category) params.set('category', filter.category);
  if (filter?.lifecycleStatus) params.set('lifecycleStatus', filter.lifecycleStatus);
  const qs = params.toString();
  const r = await authFetch(`/api/decision-patterns${qs ? `?${qs}` : ''}`);
  if (!r.ok) throw new Error(`Fetch patterns failed: ${r.status}`);
  const data = await r.json();
  return data.patterns as DecisionPattern[];
}

export async function fetchDecisionPattern(slug: string): Promise<DecisionPattern> {
  const r = await authFetch(`/api/decision-patterns/${slug}`);
  if (!r.ok) throw new Error(`Fetch pattern failed: ${r.status}`);
  return (await r.json()) as DecisionPattern;
}

export interface AdoptPatternResult {
  ok: true;
  adoptionId: string;
  patternSlug: string;
  version: string;
}

export async function adoptPattern(
  slug: string,
  projectId: string,
): Promise<AdoptPatternResult> {
  const r = await authFetch(`/api/decision-patterns/${slug}/adopt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `Adopt failed: ${r.status}`);
  }
  return (await r.json()) as AdoptPatternResult;
}

export async function fetchPatternStats(slug: string): Promise<PatternAdoptionStats> {
  const r = await authFetch(`/api/decision-patterns/${slug}/stats`);
  if (!r.ok) throw new Error(`Fetch stats failed: ${r.status}`);
  return (await r.json()) as PatternAdoptionStats;
}
