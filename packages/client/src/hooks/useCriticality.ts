import { useCallback, useEffect } from 'react';
import { fetchCriticality } from '../services/criticality.api';
import { useCriticalityStore } from '../stores/criticalityStore';

export interface UseCriticalityOptions {
  topN?: number;
  enabled?: boolean;
  refreshKey?: number;
}

export function useCriticality(projectId: string | null, opts: UseCriticalityOptions = {}) {
  const { topN = 10, enabled = true, refreshKey = 0 } = opts;
  const scores = useCriticalityStore((s) => s.scores);
  const computedAt = useCriticalityStore((s) => s.computedAt);
  const loading = useCriticalityStore((s) => s.loading);
  const error = useCriticalityStore((s) => s.error);
  const setScores = useCriticalityStore((s) => s.setScores);
  const setLoading = useCriticalityStore((s) => s.setLoading);
  const setError = useCriticalityStore((s) => s.setError);
  const reset = useCriticalityStore((s) => s.reset);

  const load = useCallback(
    async (force: boolean) => {
      if (!projectId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCriticality(projectId, { topN, refresh: force });
        setScores(data.scores, data.computedAt);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load criticality');
      } finally {
        setLoading(false);
      }
    },
    [projectId, topN, setScores, setLoading, setError],
  );

  useEffect(() => {
    if (!enabled || !projectId) {
      reset();
      return;
    }
    load(false);
  }, [enabled, projectId, refreshKey, load, reset]);

  return {
    scores,
    computedAt,
    loading,
    error,
    reload: () => load(true),
  };
}
