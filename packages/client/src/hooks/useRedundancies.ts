/**
 * REQ-RED-003 — Hook for GET /api/projects/:projectId/redundancies
 *
 * Fetches semantic-similarity pair candidates from the project so the
 * Redundancy panel can render them. Refresh is manual (no auto-poll)
 * — Qdrant indexing is async, so a refresh button is more honest than
 * a stale snapshot pretending to be live.
 */

import { useCallback, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { authFetch } from '../services/authFetch';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface RedundancyPair {
  aId: string;
  aName: string;
  aType: string;
  aLayer: string;
  bId: string;
  bName: string;
  bType: string;
  bLayer: string;
  score: number;
  tier: 'same' | 'similar' | 'unique';
}

export interface RedundancyResponse {
  pairs: RedundancyPair[];
  scanned: number;
  totalElements: number;
  scoreThreshold: number;
  sameTypeOnly: boolean;
}

export interface RedundancyOpts {
  type?: string;
  scoreThreshold?: number;
  topK?: number;
  limit?: number;
  sameTypeOnly?: boolean;
}

interface State {
  status: 'idle' | 'loading' | 'done' | 'error';
  data: RedundancyResponse | null;
  error: string | null;
}

const initialState: State = { status: 'idle', data: null, error: null };

export function useRedundancies(projectId: string | null) {
  const [state, setState] = useState<State>(initialState);

  const fetch = useCallback(
    async (opts: RedundancyOpts = {}): Promise<void> => {
      if (!projectId) {
        setState({ status: 'error', data: null, error: 'No project loaded' });
        return;
      }
      if (!useAuthStore.getState().token) {
        setState({ status: 'error', data: null, error: 'Not authenticated' });
        return;
      }

      setState({ status: 'loading', data: null, error: null });

      const params = new URLSearchParams();
      if (opts.type) params.set('type', opts.type);
      if (opts.scoreThreshold !== undefined) params.set('scoreThreshold', String(opts.scoreThreshold));
      if (opts.topK !== undefined) params.set('topK', String(opts.topK));
      if (opts.limit !== undefined) params.set('limit', String(opts.limit));
      if (opts.sameTypeOnly !== undefined) params.set('sameTypeOnly', String(opts.sameTypeOnly));

      try {
        const url = `${API_BASE}/projects/${projectId}/redundancies?${params.toString()}`;
        const res = await authFetch(url, { method: 'GET' });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          setState({ status: 'error', data: null, error: txt || `HTTP ${res.status}` });
          return;
        }
        const body = await res.json();
        setState({ status: 'done', data: body.data, error: null });
      } catch (err) {
        setState({ status: 'error', data: null, error: (err as Error).message });
      }
    },
    [projectId],
  );

  const reset = useCallback(() => setState(initialState), []);

  // REQ-RED-004 — apply per-pair decisions (merge / keep / skip).
  // Returns the backend's count breakdown so the caller can toast it.
  const applyDecisions = useCallback(
    async (
      decisions: Array<{
        aId: string;
        bId: string;
        action: 'merge-into-a' | 'merge-into-b' | 'keep-both' | 'skip';
      }>,
    ): Promise<{
      success: boolean;
      result?: { resolved: number; merged: number; kept: number; skipped: number; errors: Array<{ aId: string; bId: string; reason: string }> };
      error?: string;
    }> => {
      if (!projectId) return { success: false, error: 'No project loaded' };
      if (!useAuthStore.getState().token) return { success: false, error: 'Not authenticated' };
      if (decisions.length === 0) return { success: false, error: 'No decisions to apply' };

      try {
        const res = await authFetch(`${API_BASE}/projects/${projectId}/redundancies/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decisions }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          return { success: false, error: txt || `HTTP ${res.status}` };
        }
        const body = await res.json();
        return { success: true, result: body.data };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
    [projectId],
  );

  return { state, fetch, reset, applyDecisions };
}
