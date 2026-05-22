import { authFetch } from './authFetch';
import type { ExecutiveSummary } from '@thearchitect/shared';

export async function fetchExecutiveSummary(
  projectId: string,
  opts: { fresh?: boolean } = {},
): Promise<ExecutiveSummary> {
  const qs = opts.fresh ? '?fresh=true' : '';
  const r = await authFetch(`/api/projects/${projectId}/executive-summary${qs}`);
  if (!r.ok) throw new Error(`Fetch executive summary failed: ${r.status}`);
  return (await r.json()) as ExecutiveSummary;
}
