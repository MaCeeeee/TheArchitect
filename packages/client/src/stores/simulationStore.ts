import { create } from 'zustand';
import { simulationAPI } from '../services/api';
import { useAuthStore } from './authStore';
import type {
  SimulationRun,
  SimulationRunSummary,
  SimulationResult,
  SimulationConfig,
  EmergenceEvent,
  EmergenceMetrics,
  FatigueReport,
  FatigueRating,
  AgentPersona,
  AgentPosition,
  CustomPersona,
  ProposedAction,
  ValidationResult,
} from '@thearchitect/shared/src/types/simulation.types';
import { computeRunComparison, type RunComparisonData } from '../components/simulation/comparisonUtils';

export interface DiscussionBubble {
  id: string;                    // `${agentId}_r${round}_${elementId}`
  agentId: string;
  agentName: string;
  agentColorIndex: number;       // Index into AGENT_COLORS
  round: number;
  reasoning: string;             // Agent's overall reasoning
  position: AgentPosition;       // approve | reject | modify | abstain
  targetElementId: string;
  targetElementName: string;
  actionType: string;            // modify_status, block_change, etc.
  actionReasoning: string;       // Action-specific reasoning
  timestamp: number;
}

interface SimulationState {
  // Active run
  activeRunId: string | null;
  activeRun: SimulationRun | null;
  isRunning: boolean;
  currentRound: number;
  currentAgent: string | null;
  streamingText: string;

  // History
  runs: SimulationRunSummary[];

  // Overlay — simulation deltas on existing analytics
  riskOverlay: Map<string, number>;
  costOverlay: Map<string, number>;
  showOverlay: boolean;

  // Emergence
  emergenceEvents: EmergenceEvent[];
  emergenceMetrics: EmergenceMetrics | null;

  // Fatigue (C-Level core metric)
  fatigueReport: FatigueReport | null;
  fatigueTimeline: Array<{ round: number; globalIndex: number; rating: FatigueRating }>;

  // Live feed
  liveFeed: LiveFeedEntry[];

  // Discussion Bubbles (3D speech overlays)
  discussionBubbles: DiscussionBubble[];
  showBubbles: boolean;

  // Personas (Phase 3)
  presetPersonas: AgentPersona[];
  customPersonas: CustomPersona[];

  // Run Comparison (Phase 3)
  comparisonRunA: SimulationRun | null;
  comparisonRunB: SimulationRun | null;
  comparisonData: RunComparisonData | null;

  // Actions
  startSimulation: (projectId: string, config: SimulationConfig) => Promise<void>;
  cancelSimulation: (projectId: string) => Promise<void>;
  loadRuns: (projectId: string) => Promise<void>;
  selectRun: (projectId: string, runId: string) => Promise<void>;
  toggleOverlay: () => void;
  toggleBubbles: () => void;
  clearSimulation: () => void;

  // Persona actions (Phase 3)
  loadPersonas: (projectId: string) => Promise<void>;
  createCustomPersona: (projectId: string, input: Record<string, unknown>) => Promise<void>;
  updateCustomPersona: (projectId: string, personaId: string, input: Record<string, unknown>) => Promise<void>;
  deleteCustomPersona: (projectId: string, personaId: string) => Promise<void>;

  // Comparison actions (Phase 3)
  selectForComparison: (projectId: string, runId: string, slot: 'A' | 'B') => Promise<void>;
  computeComparison: () => void;
  clearComparison: () => void;
}

interface LiveFeedEntry {
  type: 'round_start' | 'round_end' | 'agent_start' | 'reasoning' | 'actions' | 'fatigue' | 'emergence' | 'complete' | 'error';
  content: string;
  timestamp: number;
  data?: unknown;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const useSimulationStore = create<SimulationState>((set, get) => ({
  activeRunId: null,
  activeRun: null,
  isRunning: false,
  currentRound: 0,
  currentAgent: null,
  streamingText: '',
  runs: [],
  riskOverlay: new Map(),
  costOverlay: new Map(),
  showOverlay: false,
  emergenceEvents: [],
  emergenceMetrics: null,
  fatigueReport: null,
  fatigueTimeline: [],
  liveFeed: [],
  discussionBubbles: [],
  showBubbles: true,
  presetPersonas: [],
  customPersonas: [],
  comparisonRunA: null,
  comparisonRunB: null,
  comparisonData: null,

  startSimulation: async (projectId, config) => {
    try {
      const response = await simulationAPI.create(projectId, config as any);
      const { id: runId } = response.data;

      set({
        activeRunId: runId,
        isRunning: true,
        currentRound: 0,
        currentAgent: null,
        streamingText: '',
        emergenceEvents: [],
        emergenceMetrics: null,
        fatigueReport: null,
        fatigueTimeline: [],
        liveFeed: [],
        discussionBubbles: [],
        riskOverlay: new Map(),
        costOverlay: new Map(),
      });

      // Start SSE stream
      const streamUrl = `${API_BASE}/projects/${projectId}/simulations/${runId}/stream`;
      const token = useAuthStore.getState().token;

      const response2 = await fetch(streamUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response2.ok || !response2.body) {
        throw new Error('Failed to connect to simulation stream');
      }

      const reader = response2.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();

            if (data === '[DONE]') {
              set({ isRunning: false });
              return;
            }

            try {
              const event = JSON.parse(data);
              processEvent(event, set, get);
            } catch {
              // Skip malformed events
            }
          }
        }
        set({ isRunning: false });
      };

      processStream().catch((err) => {
        console.error('[SimulationStore] Stream error:', err);
        set({ isRunning: false });
      });
    } catch (err: any) {
      console.error('[SimulationStore] Start error:', err);
      set({ isRunning: false });
    }
  },

  cancelSimulation: async (projectId) => {
    const { activeRunId } = get();
    if (!activeRunId) return;
    try {
      await simulationAPI.cancel(projectId, activeRunId);
      set({ isRunning: false });
    } catch (err) {
      console.error('[SimulationStore] Cancel error:', err);
    }
  },

  loadRuns: async (projectId) => {
    try {
      const response = await simulationAPI.list(projectId);
      set({ runs: response.data.runs });
    } catch (err) {
      console.error('[SimulationStore] Load runs error:', err);
    }
  },

  selectRun: async (projectId, runId) => {
    try {
      const response = await simulationAPI.get(projectId, runId);
      const run = response.data;

      const riskOverlay = new Map<string, number>();
      const costOverlay = new Map<string, number>();

      if (run.result) {
        for (const [id, delta] of Object.entries(run.result.riskDelta || {})) {
          riskOverlay.set(id, delta as number);
        }
        for (const [id, delta] of Object.entries(run.result.costDelta || {})) {
          costOverlay.set(id, delta as number);
        }
      }

      // Reconstruct discussion bubbles from stored rounds
      const bubbles: DiscussionBubble[] = [];
      const agentIds = run.config?.agents?.map((a: any) => a.id) || [];
      if (run.rounds) {
        for (const round of run.rounds as any[]) {
          for (const turn of round.agentTurns || []) {
            const colorIndex = agentIds.indexOf(turn.agentPersonaId);
            for (const action of turn.validatedActions || []) {
              bubbles.push({
                id: `${turn.agentPersonaId}_r${round.roundNumber}_${action.targetElementId}`,
                agentId: turn.agentPersonaId,
                agentName: turn.agentName,
                agentColorIndex: colorIndex >= 0 ? colorIndex : 0,
                round: round.roundNumber,
                reasoning: turn.reasoning,
                position: turn.position,
                targetElementId: action.targetElementId,
                targetElementName: action.targetElementName,
                actionType: action.type,
                actionReasoning: action.reasoning,
                timestamp: Date.now(),
              });
            }
          }
        }
      }

      set({
        activeRunId: runId,
        activeRun: run,
        riskOverlay,
        costOverlay,
        showOverlay: true,
        discussionBubbles: bubbles,
        fatigueReport: run.result?.fatigue || null,
        emergenceMetrics: run.result?.emergenceMetrics || null,
        emergenceEvents: run.rounds?.flatMap((r: any) => r.emergenceEvents || []) || [],
        fatigueTimeline: run.rounds?.map((r: any) => ({
          round: r.roundNumber,
          globalIndex: r.fatigueSnapshot?.globalIndex || 0,
          rating: r.fatigueSnapshot?.rating || 'green',
        })) || [],
      });
    } catch (err) {
      console.error('[SimulationStore] Select run error:', err);
    }
  },

  toggleOverlay: () => set((s) => ({ showOverlay: !s.showOverlay })),
  toggleBubbles: () => set((s) => ({ showBubbles: !s.showBubbles })),

  clearSimulation: () =>
    set({
      activeRunId: null,
      activeRun: null,
      isRunning: false,
      currentRound: 0,
      currentAgent: null,
      streamingText: '',
      runs: [],
      riskOverlay: new Map(),
      costOverlay: new Map(),
      showOverlay: false,
      emergenceEvents: [],
      emergenceMetrics: null,
      fatigueReport: null,
      fatigueTimeline: [],
      liveFeed: [],
      discussionBubbles: [],
    }),

  // ─── Persona Actions (Phase 3) ───

  loadPersonas: async (projectId) => {
    try {
      const response = await simulationAPI.getPersonas(projectId);
      set({
        presetPersonas: response.data.presets || [],
        customPersonas: response.data.custom || [],
      });
    } catch (err) {
      console.error('[SimulationStore] Load personas error:', err);
    }
  },

  createCustomPersona: async (projectId, input) => {
    try {
      await simulationAPI.createCustomPersona(projectId, input);
      await get().loadPersonas(projectId);
    } catch (err) {
      console.error('[SimulationStore] Create persona error:', err);
      throw err;
    }
  },

  updateCustomPersona: async (projectId, personaId, input) => {
    try {
      await simulationAPI.updateCustomPersona(projectId, personaId, input);
      await get().loadPersonas(projectId);
    } catch (err) {
      console.error('[SimulationStore] Update persona error:', err);
      throw err;
    }
  },

  deleteCustomPersona: async (projectId, personaId) => {
    try {
      await simulationAPI.deleteCustomPersona(projectId, personaId);
      await get().loadPersonas(projectId);
    } catch (err) {
      console.error('[SimulationStore] Delete persona error:', err);
      throw err;
    }
  },

  // ─── Comparison Actions (Phase 3) ───

  selectForComparison: async (projectId, runId, slot) => {
    try {
      const response = await simulationAPI.get(projectId, runId);
      const run = response.data;
      if (slot === 'A') {
        set({ comparisonRunA: run });
      } else {
        set({ comparisonRunB: run });
      }
    } catch (err) {
      console.error('[SimulationStore] Select for comparison error:', err);
    }
  },

  computeComparison: () => {
    const { comparisonRunA, comparisonRunB } = get();
    if (!comparisonRunA?.result || !comparisonRunB?.result) {
      set({ comparisonData: null });
      return;
    }
    const data = computeRunComparison(comparisonRunA, comparisonRunB);
    set({ comparisonData: data });
  },

  clearComparison: () =>
    set({ comparisonRunA: null, comparisonRunB: null, comparisonData: null }),
}));

// ─── Event Processing ───

function processEvent(
  event: any,
  set: (partial: Partial<SimulationState> | ((state: SimulationState) => Partial<SimulationState>)) => void,
  get: () => SimulationState,
): void {
  const now = Date.now();

  switch (event.type) {
    case 'round_start':
      set((s) => ({
        currentRound: event.round,
        liveFeed: [...s.liveFeed, {
          type: 'round_start',
          content: `Round ${event.round + 1} started`,
          timestamp: now,
        }],
      }));
      break;

    case 'agent_start':
      set((s) => ({
        currentAgent: event.agentName,
        streamingText: '',
        liveFeed: [...s.liveFeed, {
          type: 'agent_start',
          content: `${event.agentName} is analyzing...`,
          timestamp: now,
        }],
      }));
      break;

    case 'reasoning_chunk':
      set((s) => ({ streamingText: s.streamingText + event.text }));
      break;

    case 'actions':
      set((s) => ({
        liveFeed: [...s.liveFeed, {
          type: 'actions',
          content: `${s.currentAgent}: ${event.validated.length} actions approved, ${event.rejected.length} blocked`,
          timestamp: now,
          data: { validated: event.validated, rejected: event.rejected },
        }],
      }));
      break;

    case 'agent_turn_complete': {
      // Build discussion bubbles from validated actions
      const state = get();
      const agentIds = state.activeRun?.config?.agents?.map((a) => a.id) || [];
      const colorIndex = agentIds.indexOf(event.agentId);
      const newBubbles: DiscussionBubble[] = event.validatedActions.map((action: ProposedAction) => ({
        id: `${event.agentId}_r${event.round}_${action.targetElementId}`,
        agentId: event.agentId,
        agentName: event.agentName,
        agentColorIndex: colorIndex >= 0 ? colorIndex : 0,
        round: event.round,
        reasoning: event.reasoning,
        position: event.position,
        targetElementId: action.targetElementId,
        targetElementName: action.targetElementName,
        actionType: action.type,
        actionReasoning: action.reasoning,
        timestamp: now,
      }));

      set((s) => ({
        discussionBubbles: [...s.discussionBubbles, ...newBubbles],
      }));
      break;
    }

    case 'fatigue_update':
      set((s) => ({
        fatigueTimeline: [...s.fatigueTimeline, {
          round: s.currentRound,
          globalIndex: event.globalIndex,
          rating: event.rating,
        }],
        liveFeed: [...s.liveFeed, {
          type: 'fatigue',
          content: `Fatigue Index: ${(event.globalIndex * 100).toFixed(0)}% (${event.rating})`,
          timestamp: now,
          data: event,
        }],
      }));
      break;

    case 'emergence':
      set((s) => ({
        emergenceEvents: [...s.emergenceEvents, ...event.events],
        liveFeed: [...s.liveFeed, ...event.events.map((e: EmergenceEvent) => ({
          type: 'emergence' as const,
          content: `${e.type.toUpperCase()}: ${e.description}`,
          timestamp: now,
          data: e,
        }))],
      }));
      break;

    case 'round_end':
      set((s) => ({
        liveFeed: [...s.liveFeed, {
          type: 'round_end',
          content: `Round ${event.round + 1} complete — Fatigue: ${(event.globalFatigue * 100).toFixed(0)}% (${event.fatigueRating})`,
          timestamp: now,
        }],
      }));
      break;

    case 'complete': {
      const result: SimulationResult = event.result;
      const riskOverlay = new Map<string, number>();
      const costOverlay = new Map<string, number>();

      for (const [id, delta] of Object.entries(result.riskDelta)) {
        riskOverlay.set(id, delta);
      }
      for (const [id, delta] of Object.entries(result.costDelta)) {
        costOverlay.set(id, delta);
      }

      set((s) => ({
        isRunning: false,
        riskOverlay,
        costOverlay,
        showOverlay: true,
        fatigueReport: result.fatigue,
        emergenceMetrics: result.emergenceMetrics,
        liveFeed: [...s.liveFeed, {
          type: 'complete',
          content: result.summary,
          timestamp: now,
          data: result,
        }],
      }));
      break;
    }

    case 'error':
      set((s) => ({
        isRunning: false,
        liveFeed: [...s.liveFeed, {
          type: 'error',
          content: `Error: ${event.message}`,
          timestamp: now,
        }],
      }));
      break;
  }
}
