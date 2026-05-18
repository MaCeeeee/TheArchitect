import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EnrichedDecisionPattern,
  PatternCategory,
  PatternLifecycleUpdate,
} from '@thearchitect/shared';
import {
  adoptPattern,
  endorsePattern,
  fetchEnrichedPatterns,
  unendorsePattern,
  updateLifecycle,
  type AdoptPatternResult,
} from '../services/decisionPatterns.api';

export interface UseDecisionPatternsResult {
  patterns: EnrichedDecisionPattern[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  adopt: (slug: string, projectId: string) => Promise<AdoptPatternResult>;
  endorse: (slug: string, reason: string) => Promise<void>;
  unendorse: (slug: string) => Promise<void>;
  changeLifecycle: (slug: string, update: PatternLifecycleUpdate) => Promise<void>;
}

export interface UseDecisionPatternsFilter {
  category?: PatternCategory;
}

const sortWithNewBoost = (patterns: EnrichedDecisionPattern[]): EnrichedDecisionPattern[] => {
  const newOnes = patterns.filter((p) => p.stats?.isNew);
  const rest = patterns.filter((p) => !p.stats?.isNew);
  newOnes.sort((a, b) => a.name.localeCompare(b.name));
  rest.sort((a, b) => a.name.localeCompare(b.name));
  return [...newOnes, ...rest];
};

export function useDecisionPatterns(
  filter?: UseDecisionPatternsFilter,
): UseDecisionPatternsResult {
  const [patterns, setPatterns] = useState<EnrichedDecisionPattern[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const category = filter?.category;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEnrichedPatterns({ category })
      .then((data) => {
        if (!cancelled) setPatterns(sortWithNewBoost(data));
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
  }, [category, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const adopt = useCallback(
    async (slug: string, projectId: string) => adoptPattern(slug, projectId),
    [],
  );

  const endorse = useCallback(
    async (slug: string, reason: string) => {
      await endorsePattern(slug, reason);
      setReloadKey((k) => k + 1);
    },
    [],
  );

  const unendorse = useCallback(
    async (slug: string) => {
      await unendorsePattern(slug);
      setReloadKey((k) => k + 1);
    },
    [],
  );

  const changeLifecycle = useCallback(
    async (slug: string, update: PatternLifecycleUpdate) => {
      await updateLifecycle(slug, update);
      setReloadKey((k) => k + 1);
    },
    [],
  );

  return useMemo(
    () => ({ patterns, loading, error, reload, adopt, endorse, unendorse, changeLifecycle }),
    [patterns, loading, error, reload, adopt, endorse, unendorse, changeLifecycle],
  );
}
