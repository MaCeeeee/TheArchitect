// UC-DATA-001 Generator D — SSE-Client Hook for Process → Data-Objects
// Consumes the SSE-stream from
// /api/projects/:projectId/processes/:processId/generate-data-objects

import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export type Sensitivity = 'PII' | 'confidential' | 'internal' | 'public';
export type DataClass = 'transactional' | 'master' | 'reference' | 'analytical' | 'event' | 'log';
export type DataObjectArchimateType = 'data_object' | 'data_entity' | 'data_model';

export interface GeneratedDataObject {
  name: string;
  description: string;
  dataClass: DataClass;
  sensitivity: Sensitivity;
  crudOperations: string;
  archimateType: DataObjectArchimateType;
}

export type DataObjectGeneratorStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';

interface State {
  status: DataObjectGeneratorStatus;
  dataObjects: GeneratedDataObject[];
  ragChunks: number;
  processName: string | null;
  existingDataObjectCount: number;
  rejectedCount: number;
  error: string | null;
  durationMs: number | null;
}

const initialState: State = {
  status: 'idle',
  dataObjects: [],
  ragChunks: 0,
  processName: null,
  existingDataObjectCount: 0,
  rejectedCount: 0,
  error: null,
  durationMs: null,
};

export function useDataObjectGenerator(projectId: string | null) {
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

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setState({ ...initialState, status: 'thinking' });

      try {
        const url = `${API_BASE}/projects/${projectId}/processes/${processId}/generate-data-objects`;
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
      dataObjectsToApply: GeneratedDataObject[],
      parentPos?: { x: number; z: number },
    ): Promise<{
      success: boolean;
      dataObjectIds?: string[];
      connectionIds?: string[];
      // REQ-SIM-004 Stage 6: Generator-D V2 reuse outcome —
      // surfaced so the property-panel can show "X reused, Y to confirm"
      // and (eventually) trigger the confirm modal.
      reused?: Array<{
        originalIndex: number;
        originalName: string;
        reusedAs: string;
        via: 'exact-name' | 'similarity';
        score?: number;
      }>;
      pendingConfirm?: Array<{
        originalIndex: number;
        original: GeneratedDataObject;
        suggestion: { elementId: string; name: string; type: string; score: number };
      }>;
      error?: string;
    }> => {
      if (!projectId) return { success: false, error: 'No project loaded' };
      const token = useAuthStore.getState().token;
      if (!token) return { success: false, error: 'Not authenticated' };

      try {
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/processes/${processId}/apply-data-objects`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              dataObjects: dataObjectsToApply,
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
        return {
          success: true,
          dataObjectIds: data.dataObjectIds,
          connectionIds: data.connectionIds,
          reused: data.reused,
          pendingConfirm: data.pendingConfirm,
        };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    },
    [projectId],
  );

  // REQ-SIM-004 Stage 6b — send the user's merge/create choices to the
  // backend follow-up endpoint, after the original apply returned
  // pendingConfirm[]. Returns the same shape as apply() so the caller's
  // toast logic can stay identical.
  const applyDecisions = useCallback(
    async (
      processId: string,
      decisions: Array<{
        originalIndex: number;
        action: 'merge' | 'create';
        original: GeneratedDataObject;
        suggestion?: { elementId: string; name: string };
      }>,
      parentPos?: { x: number; z: number },
    ): Promise<{
      success: boolean;
      dataObjectIds?: string[];
      reused?: Array<{ originalIndex: number; originalName: string; reusedAs: string; via: string }>;
      error?: string;
    }> => {
      if (!projectId) return { success: false, error: 'No project loaded' };
      const token = useAuthStore.getState().token;
      if (!token) return { success: false, error: 'Not authenticated' };

      try {
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/processes/${processId}/apply-data-object-decisions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              decisions,
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
        return {
          success: true,
          dataObjectIds: data.dataObjectIds,
          reused: data.reused,
        };
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

  return { state, generate, apply, applyDecisions, reset };
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
        existingDataObjectCount: (e.existingDataObjectCount as number) ?? 0,
      }));
      break;
    case 'thinking':
      setState((s) => ({ ...s, status: 'thinking' }));
      break;
    case 'data_object':
      setState((s) => ({
        ...s,
        status: 'streaming',
        dataObjects: [...s.dataObjects, e.dataObject as GeneratedDataObject],
      }));
      break;
    case 'done':
      setState((s) => ({
        ...s,
        status: 'done',
        durationMs: (e.durationMs as number) ?? null,
        rejectedCount: (e.rejectedCount as number) ?? 0,
      }));
      break;
    case 'error':
      setState((s) => ({ ...s, status: 'error', error: (e.message as string) ?? 'Unknown error' }));
      break;
  }
}
