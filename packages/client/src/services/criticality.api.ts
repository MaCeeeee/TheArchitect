import { authFetch } from './authFetch';
import type { CriticalityResponse } from '@thearchitect/shared';

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
