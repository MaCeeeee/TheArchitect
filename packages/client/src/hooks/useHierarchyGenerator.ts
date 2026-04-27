// UC-ADD-004 Generator C — SSE-Client Hook for PDF → Architecture-Hierarchy
// Multi-phase streaming: extracted → vision → stakeholders → capabilities → processes → activities → done

import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ─── Domain types (mirror server schemas) ──────────────────────────────────

export interface VisionPhase {
  mission: string;
  visionStatements: string[];
  drivers?: string[];
  principles?: string[];
  goals?: string[];
}

export interface Stakeholder {
  name: string;
  role: string;
  stakeholderType: 'internal' | 'external' | 'regulator' | 'customer' | 'supplier' | 'employee' | 'partner' | 'investor' | 'other';
  influence: 'low' | 'medium' | 'high';
  attitude: 'supportive' | 'neutral' | 'skeptical' | 'blocker';
  interests?: string[];
}

export interface Capability {
  name: string;
  description: string;
  level?: number;
}

export interface Process {
  parentCapability: string;
  name: string;
  description: string;
}

export interface Activity {
  parentProcess: string;
  name: string;
  owner: string;
  action: string;
  system: string;
  when: string;
  output: string;
  enables?: string;
}

export interface ExtractedHierarchy {
  vision: VisionPhase | null;
  stakeholders: Stakeholder[];
  capabilities: Capability[];
  processes: Process[];
  activities: Activity[];
}

export type HierarchyPhase = 'idle' | 'extracted' | 'vision' | 'stakeholders' | 'capabilities' | 'processes' | 'activities' | 'done' | 'error';

export interface PhaseStatus {
  vision: 'pending' | 'active' | 'done';
  stakeholders: 'pending' | 'active' | 'done';
  capabilities: 'pending' | 'active' | 'done';
  processes: 'pending' | 'active' | 'done';
  activities: 'pending' | 'active' | 'done';
}

interface State {
  status: HierarchyPhase;
  phaseStatus: PhaseStatus;
  hierarchy: ExtractedHierarchy;
  documentChars: number;
  ragIngested: boolean;
  error: string | null;
  durationMs: number | null;
  tokenEstimate: number;
}

const initialPhaseStatus: PhaseStatus = {
  vision: 'pending',
  stakeholders: 'pending',
  capabilities: 'pending',
  processes: 'pending',
  activities: 'pending',
};

const initialState: State = {
  status: 'idle',
  phaseStatus: initialPhaseStatus,
  hierarchy: {
    vision: null,
    stakeholders: [],
    capabilities: [],
    processes: [],
    activities: [],
  },
  documentChars: 0,
  ragIngested: false,
  error: null,
  durationMs: null,
  tokenEstimate: 0,
};

// ─── Acceptance state for the tree (selected branches to apply) ────────────

export interface AcceptState {
  vision: boolean;
  stakeholders: boolean[];
  capabilities: boolean[];
  processes: boolean[];
  activities: boolean[];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useHierarchyGenerator(projectId: string | null) {
  const [state, setState] = useState<State>(initialState);
  const abortRef = useRef<AbortController | null>(null);

  const generateFromFile = useCallback(
    async (file: File) => {
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
      setState({ ...initialState, status: 'extracted' });

      try {
        const formData = new FormData();
        formData.append('document', file);

        const url = `${API_BASE}/projects/${projectId}/architecture/generate-from-document`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
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
              /* ignore */
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

  const applyHierarchy = useCallback(
    async (
      hierarchy: ExtractedHierarchy,
      accept: AcceptState,
    ): Promise<{ success: boolean; counts?: Record<string, number>; error?: string }> => {
      if (!projectId) return { success: false, error: 'No project loaded' };
      const token = useAuthStore.getState().token;
      if (!token) return { success: false, error: 'Not authenticated' };

      try {
        const res = await fetch(
          `${API_BASE}/projects/${projectId}/architecture/apply-hierarchy`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              hierarchy: {
                ...hierarchy,
                vision: hierarchy.vision ?? { mission: '', visionStatements: [] },
              },
              accept,
            }),
          },
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          return { success: false, error: errText || `HTTP ${res.status}` };
        }
        const data = await res.json();
        return { success: true, counts: data.counts };
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

  return { state, generateFromFile, applyHierarchy, reset };
}

// ─── Event handler ──────────────────────────────────────────────────────────

function applyEvent(setState: React.Dispatch<React.SetStateAction<State>>, event: unknown) {
  if (typeof event !== 'object' || event === null || !('type' in event)) return;
  const e = event as { type: string; [k: string]: unknown };

  switch (e.type) {
    case 'extracted':
      setState((s) => ({
        ...s,
        documentChars: (e.chars as number) ?? s.documentChars,
        ragIngested: (e.ragIngested as boolean) || s.ragIngested,
      }));
      break;

    case 'phase-start': {
      const phase = e.phase as keyof PhaseStatus;
      setState((s) => ({
        ...s,
        status: phase as HierarchyPhase,
        phaseStatus: { ...s.phaseStatus, [phase]: 'active' },
      }));
      break;
    }

    case 'phase-done': {
      const phase = e.phase as keyof PhaseStatus;
      setState((s) => ({
        ...s,
        phaseStatus: { ...s.phaseStatus, [phase]: 'done' },
      }));
      break;
    }

    case 'vision':
      setState((s) => ({
        ...s,
        hierarchy: { ...s.hierarchy, vision: e.data as VisionPhase },
      }));
      break;

    case 'stakeholder':
      setState((s) => ({
        ...s,
        hierarchy: { ...s.hierarchy, stakeholders: [...s.hierarchy.stakeholders, e.data as Stakeholder] },
      }));
      break;

    case 'capability':
      setState((s) => ({
        ...s,
        hierarchy: { ...s.hierarchy, capabilities: [...s.hierarchy.capabilities, e.data as Capability] },
      }));
      break;

    case 'process':
      setState((s) => ({
        ...s,
        hierarchy: { ...s.hierarchy, processes: [...s.hierarchy.processes, e.data as Process] },
      }));
      break;

    case 'activity':
      setState((s) => ({
        ...s,
        hierarchy: { ...s.hierarchy, activities: [...s.hierarchy.activities, e.data as Activity] },
      }));
      break;

    case 'done':
      setState((s) => ({
        ...s,
        status: 'done',
        durationMs: (e.durationMs as number) ?? null,
        tokenEstimate: (e.tokenEstimate as number) ?? 0,
      }));
      break;

    case 'error':
      setState((s) => ({
        ...s,
        status: 'error',
        error: (e.message as string) ?? 'Unknown error',
      }));
      break;
  }
}
