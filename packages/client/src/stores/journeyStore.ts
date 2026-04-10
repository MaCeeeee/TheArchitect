import { create } from 'zustand';
import { useArchitectureStore } from './architectureStore';
import { useComplianceStore } from './complianceStore';
import { useSimulationStore } from './simulationStore';
import { useRoadmapStore } from './roadmapStore';
import { useEnvisionStore } from './envisionStore';

// ─── 6-Phase TOGAF ADM Journey ───
// Phase A: Architecture Vision
// Phase B-D: Architecture Definition
// Phase E: Opportunities & Solutions
// Phase F: Migration Planning
// Phase G: Implementation Governance
// Phase H: Change Management

export type JourneyPhase = 1 | 2 | 3 | 4 | 5 | 6;

export interface PhaseProgress {
  current: number;
  target: number;
  label: string;
}

export interface PhaseInfo {
  phase: JourneyPhase;
  admLabel: string;           // TOGAF ADM reference (e.g., "Phase A", "Phases B-D")
  name: string;
  description: string;
  isDone: boolean;
  progress: PhaseProgress;
  nextAction: { label: string; route: string } | null;
}

interface JourneyState {
  phases: PhaseInfo[];
  currentPhase: JourneyPhase;
  healthScore: number;
  recompute: (projectId: string) => void;
}

const PHASE_CONFIG: Record<JourneyPhase, { admLabel: string; name: string; description: string }> = {
  1: { admLabel: 'Phase A', name: 'Architecture Vision', description: 'Define scope, stakeholders & vision' },
  2: { admLabel: 'Phases B-D', name: 'Architecture Definition', description: 'Model business, data, application & technology' },
  3: { admLabel: 'Phase E', name: 'Opportunities & Solutions', description: 'Map standards, identify gaps & evaluate alternatives' },
  4: { admLabel: 'Phase F', name: 'Migration Planning', description: 'Simulate costs, plan scenarios & create roadmaps' },
  5: { admLabel: 'Phase G', name: 'Implementation Governance', description: 'Establish policies, approvals & architectural oversight' },
  6: { admLabel: 'Phase H', name: 'Change Management', description: 'Audit compliance, capture snapshots & track changes' },
};

export const useJourneyStore = create<JourneyState>((set) => ({
  phases: [],
  currentPhase: 1,
  healthScore: 0,

  recompute: (projectId: string) => {
    const elements = useArchitectureStore.getState().elements;
    const connections = useArchitectureStore.getState().connections;
    const pipelineStates = useComplianceStore.getState().pipelineStates;
    const snapshots = useComplianceStore.getState().snapshots;
    const auditChecklists = useComplianceStore.getState().auditChecklists;
    const simRuns = useSimulationStore.getState().runs;
    const roadmaps = useRoadmapStore.getState().roadmaps;
    const { vision, stakeholders } = useEnvisionStore.getState();

    // ─── Phase completion checks ────────────────────

    // Phase 1 (A): Architecture Vision — scope + vision + ≥3 stakeholders + ≥2 principles
    const hasScope = !!vision.scope.trim();
    const hasVision = !!vision.visionStatement.trim();
    const enoughStakeholders = stakeholders.length >= 3;
    const enoughPrinciples = vision.principles.length >= 2;
    const phase1Done = hasScope && hasVision && enoughStakeholders && enoughPrinciples;

    // Phase 2 (B-D): Architecture Definition — ≥5 elements + ≥3 connections
    const phase2Done = elements.length >= 5 && connections.length >= 3;

    // Phase 3 (E): Opportunities & Solutions — ≥1 standard mapped
    const STAGE_ORDER: Record<string, number> = {
      uploaded: 0, mapped: 1, policies_generated: 2, roadmap_ready: 3, tracking: 4,
    };
    const maxStage = pipelineStates.reduce((max, ps) => {
      const idx = STAGE_ORDER[ps.stage] ?? -1;
      return idx > max ? idx : max;
    }, -1);
    const phase3Done = maxStage >= 1;

    // Phase 4 (F): Migration Planning — ≥1 simulation OR roadmap
    const phase4Done = simRuns.length > 0 || roadmaps.length > 0 || maxStage >= 3;

    // Phase 5 (G): Implementation Governance — ≥1 policy approved
    const hasApprovedPolicy = pipelineStates.some(
      (ps) => (STAGE_ORDER[ps.stage] ?? -1) >= 2 && ps.policyStats.approved > 0
    );
    const phase5Done = hasApprovedPolicy || maxStage >= 2;

    // Phase 6 (H): Change Management — ≥1 snapshot + ≥1 checklist
    const phase6Done = snapshots.length > 0 && auditChecklists.length > 0;

    const phasesDone = [phase1Done, phase2Done, phase3Done, phase4Done, phase5Done, phase6Done];

    // Determine current phase (first incomplete phase)
    let currentPhase: JourneyPhase = 6;
    for (let i = 0; i < phasesDone.length; i++) {
      if (!phasesDone[i]) {
        currentPhase = (i + 1) as JourneyPhase;
        break;
      }
    }

    // ─── Progress metrics ───────────────────────────
    const hasUploadedStandards = pipelineStates.length > 0;
    const approvedPolicyCount = pipelineStates.reduce((sum, ps) => sum + (ps.policyStats?.approved || 0), 0);

    const progressMap: Record<JourneyPhase, PhaseProgress> = {
      1: { current: [hasScope, hasVision, enoughStakeholders, enoughPrinciples].filter(Boolean).length, target: 4, label: 'criteria met' },
      2: { current: Math.min(elements.length, 5) + Math.min(connections.length, 3), target: 8, label: 'elements + connections' },
      3: { current: maxStage >= 1 ? 1 : hasUploadedStandards ? 0.5 : 0, target: 1, label: 'standards mapped' },
      4: { current: simRuns.length + roadmaps.length, target: 1, label: 'simulations or roadmaps' },
      5: { current: approvedPolicyCount > 0 ? 1 : maxStage >= 2 ? 0.5 : 0, target: 1, label: 'policies approved' },
      6: { current: (snapshots.length > 0 ? 1 : 0) + (auditChecklists.length > 0 ? 1 : 0), target: 2, label: 'snapshot + checklist' },
    };

    // ─── Next actions ───────────────────────────────
    const getNextAction = (phase: JourneyPhase): { label: string; route: string } => {
      switch (phase) {
        case 1: {
          if (!hasScope) return { label: 'Define Scope', route: `__envision__` };
          if (!hasVision) return { label: 'Write Vision', route: `__envision__` };
          if (!enoughStakeholders) return { label: 'Add Stakeholders', route: `__envision_stakeholders__` };
          return { label: 'Add Principles', route: `__envision__` };
        }
        case 2: {
          if (elements.length === 0) return { label: 'Add First Element', route: `/project/${projectId}` };
          if (connections.length < 3) return { label: 'Add Connections', route: `__connection_mode__` };
          return { label: 'Add Elements', route: `/project/${projectId}` };
        }
        case 3: {
          if (!hasUploadedStandards) return { label: 'Upload Standard', route: `/project/${projectId}/compliance/standards` };
          if (maxStage < 1) return { label: 'Map to Matrix', route: `/project/${projectId}/compliance/matrix` };
          return { label: 'Complete Mapping', route: `/project/${projectId}/compliance/matrix` };
        }
        case 4: {
          if (roadmaps.length === 0 && maxStage < 3) return { label: 'Create Roadmap', route: `/project/${projectId}/compliance/roadmap` };
          if (simRuns.length === 0) return { label: 'Run Simulation', route: `/project/${projectId}` };
          return { label: 'Run Simulation', route: `/project/${projectId}` };
        }
        case 5: {
          if (maxStage < 2) return { label: 'Generate Policies', route: `/project/${projectId}/compliance/policies` };
          const allApproved = pipelineStates.every(ps => ps.policyStats.approved > 0);
          if (!allApproved) return { label: 'Approve Policies', route: `/project/${projectId}/compliance/approvals` };
          return { label: 'Review Policies', route: `/project/${projectId}/compliance/policies` };
        }
        case 6: {
          if (snapshots.length === 0) return { label: 'Capture Snapshot', route: `/project/${projectId}/compliance/progress` };
          return { label: 'Create Checklist', route: `/project/${projectId}/compliance/audit` };
        }
      }
    };

    const phases: PhaseInfo[] = ([1, 2, 3, 4, 5, 6] as JourneyPhase[]).map((p) => ({
      phase: p,
      admLabel: PHASE_CONFIG[p].admLabel,
      name: PHASE_CONFIG[p].name,
      description: PHASE_CONFIG[p].description,
      isDone: phasesDone[p - 1],
      progress: progressMap[p],
      nextAction: phasesDone[p - 1] ? null : getNextAction(p),
    }));

    // Health score: ~17% per completed phase
    const healthScore = Math.round(phasesDone.filter(Boolean).length * (100 / 6));

    set({ phases, currentPhase, healthScore });
  },
}));
