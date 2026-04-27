// UC-ADD-004 Generator A — SSE-Client Hook for Process → Activities
// Consumes the SSE-stream from /api/projects/:projectId/processes/:processId/generate-activities

import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface GeneratedActivity {
  name: string;
  owner: string;
  action: string;
  system: string;
  when: string;
  output: string;
  enables: string;
}

export type GeneratorStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';

interface State {
  status: GeneratorStatus;
  activities: GeneratedActivity[];
  ragChunks: number;
  processName: string | null;
  error: string | null;
  durationMs: number | null;
}

const initialState: State = {
  status: 'idle',
  activities: [],
  ragChunks: 0,
  processName: null,
  error: null,
  durationMs: null,
};

export function useActivityGenerator(projectId: string | null) {
  const [state, setState] = useState<State>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (processId: string) => {
      if (!projectId) {
        setState((s) => ({ ...s, status: 'error', error: 'No project loaded' }));
        return;
      }
      const token = useAuthStore.getState().token;
      if (!token) {
        setState((s) => ({ ...s, status: 'error', error: 'Not authenticated' }));
        return;
      }

      // Reset + abort previous if any
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setState({ ...initialState, status: 'thinking' });

      try {
        const url = `${API_BASE}/projects/${projectId}/processes/${processId}/generate-activities`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: abortRef.current.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => '');
          throw new Error(errText || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;

            try {
              const event = JSON.parse(payload);
              applyEvent(setState, event);
            } catch {
              /* ignore malformed event */
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setState((s) => ({ ...s, status: 'error', error: (err as Error).message }));
      }
    },
    [projectId],
  );

  const apply = useCallback(
    async (
      processId: string,
      activitiesToApply: GeneratedActivity[],
      parentPos?: { x: number; z: number },
    ): Promise<{ success: boolean; activityIds?: string[]; error?: string }> => {
      if (!projectId) return { success: false, error: 'No project loaded' };
      const token = useAuthStore.getState().token;
      if (!token) return { success: false, error: 'Not authenticated' };

      try {
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/processes/${processId}/apply-activities`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              activities: activitiesToApply,
              parentX: parentPos?.x ?? 0,
              parentZ: parentPos?.z ?? 0,
            }),
          },
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          return { success: false, error: errText || `HTTP ${res.status}` };
        }
        const data = await res.json();
        return { success: true, activityIds: data.activityIds };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
    [projectId],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(initialState);
  }, []);

  return { state, generate, apply, reset };
}

function applyEvent(setState: React.Dispatch<React.SetStateAction<State>>, event: unknown) {
  if (typeof event !== 'object' || event === null || !('type' in event)) return;
  const e = event as { type: string; [k: string]: unknown };
  switch (e.type) {
    case 'context':
      setState((s) => ({
        ...s,
        ragChunks: (e.ragChunks as number) ?? 0,
        processName: (e.processName as string) ?? null,
      }));
      break;
    case 'thinking':
      setState((s) => ({ ...s, status: 'thinking' }));
      break;
    case 'activity':
      setState((s) => ({
        ...s,
        status: 'streaming',
        activities: [...s.activities, e.activity as GeneratedActivity],
      }));
      break;
    case 'done':
      setState((s) => ({
        ...s,
        status: 'done',
        durationMs: (e.durationMs as number) ?? null,
      }));
      break;
    case 'error':
      setState((s) => ({ ...s, status: 'error', error: (e.message as string) ?? 'Unknown error' }));
      break;
  }
}
