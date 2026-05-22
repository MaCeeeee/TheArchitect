import { useCallback, useEffect, useState } from 'react';
import type { ExecutiveSummary } from '@thearchitect/shared';
import { fetchExecutiveSummary } from '../services/executiveSummary.api';
import { useCriticalityStore } from '../stores/criticalityStore';
import { useScenarioStore } from '../stores/scenarioStore';

export interface UseExecutiveSummaryResult {
  data: ExecutiveSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useExecutiveSummary(projectId: string | null): UseExecutiveSummaryResult {
  const [data, setData] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (fresh: boolean) => {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchExecutiveSummary(projectId, { fresh });
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load executive summary');
      } finally {
        setLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const critComputedAt = useCriticalityStore((s) => s.computedAt);
  const scenarioCount = useScenarioStore((s) => s.scenarios.length);

  useEffect(() => {
    if (!data || !projectId) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [critComputedAt, scenarioCount]);

  const reload = useCallback(() => {
    void load(true);
  }, [load]);

  return { data, loading, error, reload };
}
