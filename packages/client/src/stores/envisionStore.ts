import { create } from 'zustand';
import { projectAPI } from '../services/api';
import { envisionAIService } from '../services/envisionAI';
import { useSimulationStore } from './simulationStore';
import type {
  AIVisionSuggestion,
  AIStakeholderSuggestion,
  AIPrincipleSuggestion,
  AIConflictInsight,
  AIReadinessAssessment,
} from '@thearchitect/shared';

export interface Stakeholder {
  id: string;
  name: string;
  role: string;
  stakeholderType: 'c_level' | 'business_unit' | 'it_ops' | 'data_team' | 'external';
  interests: string[];
  influence: 'high' | 'medium' | 'low';
  attitude: 'champion' | 'supporter' | 'neutral' | 'critic';
}

export interface Vision {
  scope: string;
  visionStatement: string;
  principles: string[];
  drivers: string[];
  goals: string[];
}

// ─── AI Suggestions State ───

interface AISuggestions {
  vision?: AIVisionSuggestion;
  stakeholders?: AIStakeholderSuggestion[];
  principles?: AIPrincipleSuggestion[];
  conflicts?: AIConflictInsight[];
  readiness?: AIReadinessAssessment;
  interests?: string[];
}

interface EnvisionState {
  vision: Vision;
  stakeholders: Stakeholder[];
  loading: boolean;
  saving: boolean;
  projectId: string | null;

  // Core actions
  load: (projectId: string) => Promise<void>;
  updateVision: (patch: Partial<Vision>) => void;
  saveVision: () => Promise<void>;
  addStakeholder: (stakeholder: Stakeholder) => void;
  updateStakeholder: (id: string, patch: Partial<Stakeholder>) => void;
  removeStakeholder: (id: string) => void;
  saveStakeholders: () => Promise<void>;

  // AI state
  isGenerating: boolean;
  aiSuggestions: AISuggestions;
  aiError: string | null;

  // AI actions
  generateVision: (description: string) => Promise<void>;
  acceptVisionSuggestion: () => void;
  suggestStakeholders: () => Promise<void>;
  acceptStakeholderSuggestion: (suggestion: AIStakeholderSuggestion) => void;
  acceptAllStakeholderSuggestions: () => void;
  suggestPrinciples: () => Promise<void>;
  acceptPrinciple: (name: string) => void;
  detectConflicts: () => Promise<void>;
  assessReadiness: () => Promise<void>;
  suggestInterests: (stakeholderType: string) => Promise<void>;
  acceptInterest: (interest: string) => void;
  extractDocument: (file: File) => Promise<void>;
  clearAISuggestions: () => void;
}

const EMPTY_VISION: Vision = {
  scope: '',
  visionStatement: '',
  principles: [],
  drivers: [],
  goals: [],
};

export const useEnvisionStore = create<EnvisionState>((set, get) => ({
  vision: { ...EMPTY_VISION },
  stakeholders: [],
  loading: false,
  saving: false,
  projectId: null,

  // AI state
  isGenerating: false,
  aiSuggestions: {},
  aiError: null,

  // ─── Core Actions ───

  load: async (projectId: string) => {
    set({ loading: true, projectId });
    try {
      const res = await projectAPI.get(projectId);
      const project = res.data.data || res.data;
      set({
        vision: project.vision || { ...EMPTY_VISION },
        stakeholders: project.stakeholders || [],
        loading: false,
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load envision data:', err);
      set({ loading: false });
    }
  },

  updateVision: (patch) => {
    set((s) => ({ vision: { ...s.vision, ...patch } }));
  },

  saveVision: async () => {
    const { projectId, vision } = get();
    if (!projectId) return;
    set({ saving: true });
    try {
      await projectAPI.update(projectId, { vision });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save vision:', err);
    } finally {
      set({ saving: false });
    }
  },

  addStakeholder: (stakeholder) => {
    set((s) => ({ stakeholders: [...s.stakeholders, stakeholder] }));
  },

  updateStakeholder: (id, patch) => {
    set((s) => ({
      stakeholders: s.stakeholders.map((sh) =>
        sh.id === id ? { ...sh, ...patch } : sh
      ),
    }));
  },

  removeStakeholder: (id) => {
    set((s) => ({
      stakeholders: s.stakeholders.filter((sh) => sh.id !== id),
    }));
  },

  saveStakeholders: async () => {
    const { projectId, stakeholders } = get();
    if (!projectId) return;
    set({ saving: true });
    try {
      await projectAPI.update(projectId, { stakeholders });
      // Auto-sync stakeholders → MiroFish personas
      if (stakeholders.length > 0) {
        useSimulationStore.getState().syncStakeholdersAsPersonas(projectId, stakeholders);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to save stakeholders:', err);
    } finally {
      set({ saving: false });
    }
  },

  // ─── AI Actions ───

  generateVision: async (description: string) => {
    const { projectId } = get();
    if (!projectId) return;
    set({ isGenerating: true, aiError: null });
    try {
      const vision = await envisionAIService.generateVision(projectId, description);
      set({ aiSuggestions: { ...get().aiSuggestions, vision }, isGenerating: false });
    } catch (err) {
      set({ aiError: (err as Error).message, isGenerating: false });
    }
  },

  acceptVisionSuggestion: () => {
    const { aiSuggestions } = get();
    if (!aiSuggestions.vision) return;
    const v = aiSuggestions.vision;
    set((s) => ({
      vision: {
        scope: v.scope || s.vision.scope,
        visionStatement: v.visionStatement || s.vision.visionStatement,
        principles: v.principles.length > 0 ? [...new Set([...s.vision.principles, ...v.principles])] : s.vision.principles,
        drivers: v.drivers.length > 0 ? [...new Set([...s.vision.drivers, ...v.drivers])] : s.vision.drivers,
        goals: v.goals.length > 0 ? [...new Set([...s.vision.goals, ...v.goals])] : s.vision.goals,
      },
      aiSuggestions: { ...s.aiSuggestions, vision: undefined },
    }));
    get().saveVision();
  },

  suggestStakeholders: async () => {
    const { projectId, vision, stakeholders: existing } = get();
    if (!projectId) return;
    set({ isGenerating: true, aiError: null });
    try {
      const suggestions = await envisionAIService.suggestStakeholders(projectId, vision.scope, vision.visionStatement);
      // Filter out stakeholders that already exist (by name similarity)
      const existingNames = new Set(existing.map((s) => s.name.toLowerCase().trim()));
      const filtered = suggestions.filter((s) => !existingNames.has(s.name.toLowerCase().trim()));
      set({ aiSuggestions: { ...get().aiSuggestions, stakeholders: filtered }, isGenerating: false });
    } catch (err) {
      set({ aiError: (err as Error).message, isGenerating: false });
    }
  },

  acceptStakeholderSuggestion: (suggestion: AIStakeholderSuggestion) => {
    const newStakeholder: Stakeholder = {
      id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: suggestion.name,
      role: suggestion.role,
      stakeholderType: suggestion.stakeholderType,
      interests: suggestion.interests,
      influence: suggestion.influence,
      attitude: suggestion.attitude,
    };
    get().addStakeholder(newStakeholder);
    // Remove from suggestions
    set((s) => ({
      aiSuggestions: {
        ...s.aiSuggestions,
        stakeholders: s.aiSuggestions.stakeholders?.filter((sh) => sh.name !== suggestion.name),
      },
    }));
    get().saveStakeholders();
  },

  acceptAllStakeholderSuggestions: () => {
    const suggestions = get().aiSuggestions.stakeholders || [];
    for (const s of suggestions) {
      const newSH: Stakeholder = {
        id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: s.name,
        role: s.role,
        stakeholderType: s.stakeholderType,
        interests: s.interests,
        influence: s.influence,
        attitude: s.attitude,
      };
      get().addStakeholder(newSH);
    }
    set((s) => ({ aiSuggestions: { ...s.aiSuggestions, stakeholders: undefined } }));
    get().saveStakeholders();
  },

  suggestPrinciples: async () => {
    const { projectId, vision } = get();
    if (!projectId) return;
    set({ isGenerating: true, aiError: null });
    try {
      const principles = await envisionAIService.suggestPrinciples(projectId, vision.scope, vision.principles);
      set({ aiSuggestions: { ...get().aiSuggestions, principles }, isGenerating: false });
    } catch (err) {
      set({ aiError: (err as Error).message, isGenerating: false });
    }
  },

  acceptPrinciple: (name: string) => {
    set((s) => ({
      vision: { ...s.vision, principles: [...s.vision.principles, name] },
      aiSuggestions: {
        ...s.aiSuggestions,
        principles: s.aiSuggestions.principles?.filter((p) => p.name !== name),
      },
    }));
    get().saveVision();
  },

  detectConflicts: async () => {
    const { projectId, stakeholders } = get();
    if (!projectId) return;
    set({ isGenerating: true, aiError: null });
    try {
      const conflicts = await envisionAIService.detectConflicts(projectId, stakeholders);
      set({ aiSuggestions: { ...get().aiSuggestions, conflicts }, isGenerating: false });
    } catch (err) {
      set({ aiError: (err as Error).message, isGenerating: false });
    }
  },

  assessReadiness: async () => {
    const { projectId, vision, stakeholders } = get();
    if (!projectId) return;
    set({ isGenerating: true, aiError: null });
    try {
      const readiness = await envisionAIService.assessReadiness(projectId, vision, stakeholders);
      set({ aiSuggestions: { ...get().aiSuggestions, readiness }, isGenerating: false });
    } catch (err) {
      set({ aiError: (err as Error).message, isGenerating: false });
    }
  },

  suggestInterests: async (stakeholderType: string) => {
    const { projectId, vision } = get();
    if (!projectId) return;
    set({ isGenerating: true, aiError: null });
    try {
      const interests = await envisionAIService.suggestInterests(projectId, stakeholderType, vision.scope);
      set({ aiSuggestions: { ...get().aiSuggestions, interests }, isGenerating: false });
    } catch (err) {
      set({ aiError: (err as Error).message, isGenerating: false });
    }
  },

  acceptInterest: (interest: string) => {
    set((s) => ({
      aiSuggestions: {
        ...s.aiSuggestions,
        interests: s.aiSuggestions.interests?.filter((i) => i !== interest),
      },
    }));
  },

  extractDocument: async (file: File) => {
    const { projectId } = get();
    if (!projectId) return;
    set({ isGenerating: true, aiError: null });
    try {
      const result = await envisionAIService.extractDocument(projectId, file);
      set({
        aiSuggestions: {
          ...get().aiSuggestions,
          vision: result.vision,
          stakeholders: result.stakeholders,
        },
        isGenerating: false,
      });
    } catch (err) {
      set({ aiError: (err as Error).message, isGenerating: false });
    }
  },

  clearAISuggestions: () => {
    set({ aiSuggestions: {}, aiError: null });
  },
}));
