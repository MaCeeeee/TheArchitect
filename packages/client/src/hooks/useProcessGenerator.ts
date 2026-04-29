// UC-ADD-004 Generator B — SSE-Client Hook for Capability → Processes
// Mirrors useActivityGenerator. Consumes the SSE-stream from
// /api/projects/:projectId/capabilities/:capabilityId/generate-processes

import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface GeneratedProcess {
  name: string;
  description: string;
}

export type ProcessGeneratorStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';

interface State {
  status: ProcessGeneratorStatus;
  processes: GeneratedProcess[];
  ragChunks: number;
  capabilityName: string | null;
  error: string | null;
  durationMs: number | null;
}

const initialState: State = {
  status: 'idle',
  processes: [],
  ragChunks: 0,
  capabilityName: null,
  error: null,
  durationMs: null,
};

export function useProcessGenerator(projectId: string | null) {
  const [state, setState] = useState<State>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (capabilityId: string) => {
      if (!projectId) {
        setState((s) => ({ ...s, status: 'error', error: 'No project loaded' }));
        return;
      }
      const token = useAuthStore.getState().token;
      if (!token) {
        setState((s) => ({ ...s, status: 'error', error: 'Not authenticated' }));
        return;
      }

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setState({ ...initialState, status: 'thinking' });

      try {
        const url = `${API_BASE}/projects/${projectId}/capabilities/${capabilityId}/generate-processes`;
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
      capabilityId: string,
      processesToApply: GeneratedProcess[],
      parentPos?: { x: number; z: number },
    ): Promise<{ success: boolean; processIds?: string[]; error?: string }> => {
      if (!projectId) return { success: false, error: 'No project loaded' };
      const token = useAuthStore.getState().token;
      if (!token) return { success: false, error: 'Not authenticated' };

      try {
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/capabilities/${capabilityId}/apply-processes`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              processes: processesToApply,
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
        return { success: true, processIds: data.processIds };
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
        capabilityName: (e.capabilityName as string) ?? null,
      }));
      break;
    case 'thinking':
      setState((s) => ({ ...s, status: 'thinking' }));
      break;
    case 'process':
      setState((s) => ({
        ...s,
        status: 'streaming',
        processes: [...s.processes, e.process as GeneratedProcess],
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
