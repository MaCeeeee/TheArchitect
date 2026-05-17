import { useCallback, useEffect, useState } from 'react';
import type { DecisionPattern, PatternCategory } from '@thearchitect/shared';
import {
  adoptPattern,
  fetchDecisionPatterns,
  type AdoptPatternResult,
  type FetchPatternsFilter,
} from '../services/decisionPatterns.api';

export interface UseDecisionPatternsResult {
  patterns: DecisionPattern[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  adopt: (slug: string, projectId: string) => Promise<AdoptPatternResult>;
}

export function useDecisionPatterns(
  filter?: FetchPatternsFilter,
): UseDecisionPatternsResult {
  const [patterns, setPatterns] = useState<DecisionPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const category: PatternCategory | undefined = filter?.category;
  const lifecycleStatus = filter?.lifecycleStatus;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDecisionPatterns({ category, lifecycleStatus })
      .then((data) => {
        if (!cancelled) setPatterns(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, lifecycleStatus, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const adopt = useCallback(
    async (slug: string, projectId: string) => {
      const result = await adoptPattern(slug, projectId);
      return result;
    },
    [],
  );

  return { patterns, loading, error, reload, adopt };
}
