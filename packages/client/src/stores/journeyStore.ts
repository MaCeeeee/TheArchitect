import { create } from 'zustand';
import { useArchitectureStore } from './architectureStore';
import { useComplianceStore } from './complianceStore';
import { useSimulationStore } from './simulationStore';
import { useRoadmapStore } from './roadmapStore';

// ─── 5-Phase Project Journey ───
// Build → Map → Govern → Simulate → Audit

export type JourneyPhase = 1 | 2 | 3 | 4 | 5;

export interface PhaseInfo {
  phase: JourneyPhase;
  name: string;
  description: string;
  isDone: boolean;
  nextAction: { label: string; route: string } | null;
}

interface JourneyState {
  phases: PhaseInfo[];
  currentPhase: JourneyPhase;
  healthScore: number;
  recompute: (projectId: string) => void;
}

const PHASE_NAMES: Record<JourneyPhase, string> = {
  1: 'Build',
  2: 'Map',
  3: 'Govern',
  4: 'Simulate',
  5: 'Audit',
};

const PHASE_DESCRIPTIONS: Record<JourneyPhase, string> = {
  1: 'Create architecture elements and connections',
  2: 'Upload and map compliance standards',
  3: 'Generate and approve policies',
  4: 'Run simulations to validate',
  5: 'Prepare for audit readiness',
};

export const useJourneyStore = create<JourneyState>((set) => ({
  phases: [],
  currentPhase: 1,
  healthScore: 0,

  recompute: (projectId: string) => {
    const elements = useArchitectureStore.getState().elements;
    const connections = useArchitectureStore.getState().connections;
    const pipelineStates = useComplianceStore.getState().pipelineStates;
    const policyDrafts = useComplianceStore.getState().policyDrafts;
    const portfolioOverview = useComplianceStore.getState().portfolioOverview;
    const snapshots = useComplianceStore.getState().snapshots;
    const auditChecklists = useComplianceStore.getState().auditChecklists;
    const simRuns = useSimulationStore.getState().runs;
    const roadmaps = useRoadmapStore.getState().roadmaps;

    // Phase 1: Build — ≥5 elements + ≥3 connections
    const phase1Done = elements.length >= 5 && connections.length >= 3;

    // Phase 2: Map — ≥1 standard mapped (pipeline stage ≥ 'mapped')
    const STAGE_ORDER: Record<string, number> = {
      uploaded: 0, mapped: 1, policies_generated: 2, roadmap_ready: 3, tracking: 4,
    };
    const maxStage = pipelineStates.reduce((max, ps) => {
      const idx = STAGE_ORDER[ps.stage] ?? -1;
      return idx > max ? idx : max;
    }, -1);
    const phase2Done = maxStage >= 1; // at least 'mapped'

    // Phase 3: Govern — ≥1 policy approved (stage ≥ policies_generated OR portfolio has approved > 0)
    const hasApprovedPolicy = pipelineStates.some(
      (ps) => (STAGE_ORDER[ps.stage] ?? -1) >= 2 && ps.policyStats.approved > 0
    );
    const phase3Done = hasApprovedPolicy || maxStage >= 2;

    // Phase 4: Simulate — ≥1 simulation completed OR roadmap generated
    const hasSimulation = simRuns.length > 0 || roadmaps.length > 0;
    const phase4Done = hasSimulation || maxStage >= 3;

    // Phase 5: Audit — ≥1 snapshot + ≥1 checklist
    const phase5Done = snapshots.length > 0 && auditChecklists.length > 0;

    const phasesDone = [phase1Done, phase2Done, phase3Done, phase4Done, phase5Done];

    // Determine current phase (first incomplete phase)
    let currentPhase: JourneyPhase = 5;
    for (let i = 0; i < phasesDone.length; i++) {
      if (!phasesDone[i]) {
        currentPhase = (i + 1) as JourneyPhase;
        break;
      }
    }

    // Build context-aware next actions based on actual pipeline state
    const hasUploadedStandards = pipelineStates.length > 0;

    const getNextAction = (phase: JourneyPhase): { label: string; route: string } => {
      switch (phase) {
        case 1: {
          if (elements.length === 0) return { label: 'Add First Element', route: `/project/${projectId}` };
          if (connections.length < 3) return { label: 'Add Connections', route: `__connection_mode__` };
          return { label: 'Add Elements', route: `/project/${projectId}` };
        }
        case 2: {
          if (!hasUploadedStandards) return { label: 'Upload Standard', route: `/project/${projectId}/compliance/standards` };
          if (maxStage < 1) return { label: 'Map to Matrix', route: `/project/${projectId}/compliance/matrix` };
          return { label: 'Complete Mapping', route: `/project/${projectId}/compliance/matrix` };
        }
        case 3: {
          if (maxStage < 2) return { label: 'Generate Policies', route: `/project/${projectId}/compliance/policies` };
          const allApproved = pipelineStates.every(ps => ps.policyStats.approved > 0);
          if (!allApproved) return { label: 'Approve Policies', route: `/project/${projectId}/compliance/approvals` };
          return { label: 'Review Policies', route: `/project/${projectId}/compliance/policies` };
        }
        case 4: {
          if (roadmaps.length === 0 && maxStage < 3) return { label: 'Create Roadmap', route: `/project/${projectId}/compliance/roadmap` };
          if (simRuns.length === 0) return { label: 'Run Simulation', route: `/project/${projectId}` };
          return { label: 'Run Simulation', route: `/project/${projectId}` };
        }
        case 5: {
          if (snapshots.length === 0) return { label: 'Capture Snapshot', route: `/project/${projectId}/compliance/progress` };
          return { label: 'Create Checklist', route: `/project/${projectId}/compliance/audit` };
        }
      }
    };

    const phases: PhaseInfo[] = ([1, 2, 3, 4, 5] as JourneyPhase[]).map((p) => ({
      phase: p,
      name: PHASE_NAMES[p],
      description: PHASE_DESCRIPTIONS[p],
      isDone: phasesDone[p - 1],
      nextAction: phasesDone[p - 1] ? null : getNextAction(p),
    }));

    // Health score: 20% per completed phase
    const healthScore = phasesDone.filter(Boolean).length * 20;

    set({ phases, currentPhase, healthScore });
  },
}));
