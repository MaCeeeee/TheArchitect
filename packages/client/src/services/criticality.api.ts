import { authFetch } from './authFetch';
import type { CriticalityResponse, FactorWeights } from '@thearchitect/shared';

export async function fetchCriticality(
  projectId: string,
  opts: { topN?: number; refresh?: boolean } = {},
): Promise<CriticalityResponse> {
  const params = new URLSearchParams();
  if (opts.topN !== undefined) params.set('topN', String(opts.topN));
  if (opts.refresh) params.set('refresh', 'true');
  const qs = params.toString();
  const r = await authFetch(`/api/projects/${projectId}/criticality${qs ? `?${qs}` : ''}`);
  if (!r.ok) throw new Error(`Fetch criticality failed: ${r.status}`);
  return (await r.json()) as CriticalityResponse;
}

export interface CriticalitySettings {
  topN: number;
  weights: FactorWeights;
}

export async function fetchCriticalitySettings(projectId: string): Promise<CriticalitySettings> {
  const r = await authFetch(`/api/projects/${projectId}/criticality/settings`);
  if (!r.ok) throw new Error(`Fetch settings failed: ${r.status}`);
  return (await r.json()) as CriticalitySettings;
}

export async function updateCriticalitySettings(
  projectId: string,
  update: Partial<CriticalitySettings>,
): Promise<CriticalitySettings> {
  const r = await authFetch(`/api/projects/${projectId}/criticality/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `Update settings failed: ${r.status}`);
  }
  return (await r.json()) as CriticalitySettings;
}
