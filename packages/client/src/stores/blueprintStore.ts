import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { blueprintAPI, projectAPI } from '../services/api';
import { useEnvisionStore } from './envisionStore';
import { useSimulationStore } from './simulationStore';
import type {
  BlueprintQuestionnaire,
  BlueprintInput,
  BlueprintResult,
  BlueprintGeneratedElement,
  BlueprintGeneratedConnection,
  BlueprintStreamEvent,
} from '@thearchitect/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export type BlueprintStep = 0 | 1 | 2 | 3 | 4;

interface BlueprintState {
  // Wizard step
  step: BlueprintStep;

  // Questionnaire (step 0)
  questionnaire: BlueprintQuestionnaire;
  complexityHint: 'minimal' | 'standard' | 'comprehensive';
  industryHint: string;

  // Generation (step 1)
  isGenerating: boolean;
  generationPhase: 'elements' | 'connections' | 'validation' | null;
  generationPercent: number;
  generationMessage: string;

  // Result (steps 2-4)
  result: BlueprintResult | null;

  // Edits (step 3)
  editedElements: BlueprintGeneratedElement[];
  editedConnections: BlueprintGeneratedConnection[];
  removedElementIds: Set<string>;

  // Import (step 4)
  isImporting: boolean;
  importResult: { elementsCreated: number; connectionsCreated: number; workspaceId: string } | null;
  error: string | null;

  // Autofill
  isAutofilling: boolean;
  autofillDocumentName: string | null;

  // Actions
  setStep: (step: BlueprintStep) => void;
  updateQuestionnaire: (updates: Partial<BlueprintQuestionnaire>) => void;
  setComplexityHint: (hint: 'minimal' | 'standard' | 'comprehensive') => void;
  setIndustryHint: (hint: string) => void;
  prefillFromVision: (vision: { scope: string; visionStatement: string; principles: string[]; drivers: string[]; goals: string[] }) => void;
  generate: (projectId: string) => Promise<void>;
  removeElement: (elementId: string) => void;
  updateElement: (elementId: string, updates: Partial<BlueprintGeneratedElement>) => void;
  removeConnection: (connectionId: string) => void;
  importBlueprint: (projectId: string, workspaceName?: string) => Promise<void>;
  autofill: (projectId: string, file: File) => Promise<void>;
  reset: () => void;
}

// ─── Helpers for stakeholder inference from architecture elements ───

function inferStakeholderType(name: string, layer: string): 'c_level' | 'business_unit' | 'it_ops' | 'data_team' | 'external' {
  const n = name.toLowerCase();
  if (/ceo|cto|cio|cfo|chief|founder|director|head of/i.test(n)) return 'c_level';
  if (/devops|sre|infra|ops|admin|platform/i.test(n)) return 'it_ops';
  if (/data|analyst|bi|machine learning|ml|ai/i.test(n)) return 'data_team';
  if (/customer|partner|vendor|supplier|regulator|external/i.test(n)) return 'external';
  if (layer === 'technology') return 'it_ops';
  return 'business_unit';
}

function inferInfluence(layer: string): string {
  if (layer === 'strategy' || layer === 'motivation') return 'high';
  if (layer === 'business') return 'medium';
  return 'low';
}

const emptyQuestionnaire: BlueprintQuestionnaire = {
  businessDescription: '',
  targetUsers: '',
  problemSolved: '',
  goals: ['', '', ''],
  capabilities: '',
};

function serializeQuestionnaire(q: BlueprintQuestionnaire, complexity: string, industry: string): BlueprintInput {
  // Card 1 + Card 2 + Card 6 → motivation
  const motivationParts = [
    q.businessDescription,
    `Target users: ${q.targetUsers}`,
    `Problem: ${q.problemSolved}`,
    q.urgencyDriver && `Urgency: ${q.urgencyDriver}`,
    q.goals.filter(Boolean).map((g, i) => `Goal ${i + 1}: ${g}`).join('. '),
    q.successVision && `Success vision: ${q.successVision}`,
    q.principles && `Principles: ${q.principles}`,
    q.constraints && `Constraints: ${q.constraints}`,
    q.regulations?.length && `Regulations: ${q.regulations.join(', ')}`,
  ].filter(Boolean).join('\n');

  // Card 3 → strategy
  const strategyParts = [
    `Key capabilities: ${q.capabilities}`,
    q.customerJourney && `Customer journey: ${q.customerJourney}`,
  ].filter(Boolean).join('\n');

  // Card 4 + Card 5 + Card 6 → requirements
  const requirementsParts = [
    q.teamDescription && `Team: ${q.teamDescription}`,
    q.teamSize && `Team size: ${q.teamSize}`,
    q.mainProcesses && `Processes: ${q.mainProcesses}`,
    q.productType && `Product type: ${q.productType.replace(/_/g, ' ')}`,
    q.existingTools?.length && `Tools: ${q.existingTools.join(', ')}`,
    q.techDecisions && `Tech decisions: ${q.techDecisions}`,
    q.monthlyBudget && `Budget: €${q.monthlyBudget}/month`,
  ].filter(Boolean).join('\n');

  return {
    motivation: motivationParts,
    strategy: strategyParts,
    requirements: requirementsParts,
    industryHint: industry || undefined,
    complexityHint: complexity as BlueprintInput['complexityHint'],
    rawQuestionnaire: q,
  };
}

export const useBlueprintStore = create<BlueprintState>((set, get) => ({
  step: 0,
  questionnaire: { ...emptyQuestionnaire },
  complexityHint: 'standard',
  industryHint: '',
  isGenerating: false,
  generationPhase: null,
  generationPercent: 0,
  generationMessage: '',
  result: null,
  editedElements: [],
  editedConnections: [],
  removedElementIds: new Set(),
  isImporting: false,
  importResult: null,
  error: null,
  isAutofilling: false,
  autofillDocumentName: null,

  setStep: (step) => set({ step }),

  updateQuestionnaire: (updates) =>
    set((s) => ({ questionnaire: { ...s.questionnaire, ...updates } })),

  setComplexityHint: (hint) => set({ complexityHint: hint }),
  setIndustryHint: (hint) => set({ industryHint: hint }),

  prefillFromVision: (vision: { scope: string; visionStatement: string; principles: string[]; drivers: string[]; goals: string[] }) => {
    set((s) => {
      const q = { ...s.questionnaire };
      if (vision.scope && !q.businessDescription) q.businessDescription = vision.scope;
      if (vision.visionStatement && !q.successVision) q.successVision = vision.visionStatement;
      if (vision.principles.length > 0 && !q.principles) q.principles = vision.principles.join(', ');
      if (vision.goals.length > 0) {
        const goals = [...q.goals] as [string, string, string];
        vision.goals.slice(0, 3).forEach((g, i) => { if (!goals[i]) goals[i] = g; });
        q.goals = goals;
      }
      return { questionnaire: q };
    });
  },

  generate: async (projectId: string) => {
    const { questionnaire, complexityHint, industryHint } = get();
    const input = serializeQuestionnaire(questionnaire, complexityHint, industryHint);

    set({
      step: 1,
      isGenerating: true,
      generationPhase: 'elements',
      generationPercent: 0,
      generationMessage: 'Starting...',
      error: null,
      result: null,
    });

    try {
      const token = useAuthStore.getState().token;
      const streamUrl = `${API_BASE}/projects/${projectId}/blueprint/generate`;

      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const event: BlueprintStreamEvent = JSON.parse(data);

            switch (event.type) {
              case 'progress':
                set({
                  generationPhase: event.phase,
                  generationPercent: event.percent,
                  generationMessage: event.message,
                });
                break;
              case 'elements_ready':
                set({ generationMessage: `${event.count} elements generated` });
                break;
              case 'connections_ready':
                set({ generationMessage: `${event.count} connections generated` });
                break;
              case 'complete':
                set({
                  isGenerating: false,
                  result: event.result,
                  editedElements: [...event.result.elements],
                  editedConnections: [...event.result.connections],
                  removedElementIds: new Set(),
                  step: 2,
                  generationPercent: 100,
                  generationMessage: 'Complete!',
                });
                break;
              case 'error':
                set({ isGenerating: false, error: event.message });
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      // If stream ended without complete event
      if (get().isGenerating) {
        set({ isGenerating: false, error: 'Generation stream ended unexpectedly' });
      }
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('[BlueprintStore] Generation error:', err);
      set({ isGenerating: false, error: err.message || 'Generation failed' });
    }
  },

  removeElement: (elementId: string) => {
    set((s) => {
      const newRemoved = new Set(s.removedElementIds);
      newRemoved.add(elementId);
      return {
        removedElementIds: newRemoved,
        editedElements: s.editedElements.filter((e) => e.id !== elementId),
        editedConnections: s.editedConnections.filter(
          (c) => c.sourceId !== elementId && c.targetId !== elementId,
        ),
      };
    });
  },

  updateElement: (elementId, updates) => {
    set((s) => ({
      editedElements: s.editedElements.map((e) =>
        e.id === elementId ? { ...e, ...updates } : e,
      ),
    }));
  },

  removeConnection: (connectionId: string) => {
    set((s) => ({
      editedConnections: s.editedConnections.filter((c) => c.id !== connectionId),
    }));
  },

  importBlueprint: async (projectId: string, workspaceName?: string) => {
    const { editedElements, editedConnections, result, questionnaire } = get();
    if (!result) return;

    set({ isImporting: true, error: null, step: 4 });

    try {
      const { data } = await blueprintAPI.import(projectId, {
        elements: editedElements,
        connections: editedConnections,
        input: result.input,
        workspaceName,
      });

      // ─── Sync questionnaire data → Envision store ───
      try {
        const envision = useEnvisionStore.getState();

        // Build vision from questionnaire fields
        const vision = {
          scope: questionnaire.businessDescription || '',
          visionStatement: questionnaire.successVision || '',
          principles: questionnaire.principles
            ? questionnaire.principles.split(',').map((p) => p.trim()).filter(Boolean)
            : [],
          drivers: [questionnaire.urgencyDriver, questionnaire.constraints]
            .filter(Boolean) as string[],
          goals: questionnaire.goals.filter(Boolean),
        };

        // Extract individual stakeholders from generated business_actor elements
        const stakeholderElements = editedElements.filter(
          (e) => e.type === 'business_actor' || e.type === 'business_role',
        );
        const existingNames = new Set(
          envision.stakeholders.map((s) => s.name.toLowerCase().trim()),
        );
        const newStakeholders = stakeholderElements
          .filter((e) => !existingNames.has(e.name.toLowerCase().trim()))
          .map((e) => ({
            id: `sh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: e.name,
            role: e.description || e.name,
            stakeholderType: inferStakeholderType(e.name, e.layer),
            interests: [] as string[],
            influence: inferInfluence(e.layer) as 'high' | 'medium' | 'low',
            attitude: 'neutral' as const,
          }));

        // Update Envision store + persist to server
        envision.updateVision(vision);
        for (const sh of newStakeholders) {
          envision.addStakeholder(sh);
        }
        const allStakeholders = [...envision.stakeholders, ...newStakeholders];
        await projectAPI.update(projectId, {
          vision,
          stakeholders: allStakeholders,
        });
        // Auto-sync new stakeholders → MiroFish personas
        if (newStakeholders.length > 0) {
          useSimulationStore.getState().syncStakeholdersAsPersonas(projectId, allStakeholders);
        }
      } catch (syncErr) {
        if (import.meta.env.DEV) console.warn('[BlueprintStore] Envision sync failed (non-critical):', syncErr);
      }

      set({
        isImporting: false,
        importResult: data.data || data,
      });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('[BlueprintStore] Import error:', err);
      set({
        isImporting: false,
        error: err.response?.data?.error || err.message || 'Import failed',
      });
    }
  },

  autofill: async (projectId: string, file: File) => {
    set({ isAutofilling: true, error: null, autofillDocumentName: file.name });

    try {
      const { data } = await blueprintAPI.autofill(projectId, file);
      const fields = data.data?.fields || data.fields || {};

      // Merge extracted fields into questionnaire (only overwrite non-empty fields)
      set((s) => {
        const q = { ...s.questionnaire };

        // Safely coerce AI field values to strings (AI may return objects/arrays for text fields)
        const str = (v: unknown): string => {
          if (typeof v === 'string') return v;
          if (Array.isArray(v)) return v.map((item) =>
            typeof item === 'object' && item !== null
              ? Object.values(item).join(' — ')
              : String(item)
          ).join('\n');
          if (typeof v === 'object' && v !== null) return Object.values(v).join(' — ');
          return String(v ?? '');
        };

        if (fields.businessDescription) q.businessDescription = str(fields.businessDescription);
        if (fields.targetUsers) q.targetUsers = str(fields.targetUsers);
        if (fields.problemSolved) q.problemSolved = str(fields.problemSolved);
        if (fields.urgencyDriver) q.urgencyDriver = str(fields.urgencyDriver);
        if (fields.goals && Array.isArray(fields.goals)) {
          q.goals = [
            String(fields.goals[0] || q.goals[0]),
            String(fields.goals[1] || q.goals[1]),
            String(fields.goals[2] || q.goals[2]),
          ];
        }
        if (fields.successVision) q.successVision = str(fields.successVision);
        if (fields.principles) q.principles = str(fields.principles);
        if (fields.capabilities) q.capabilities = str(fields.capabilities);
        if (fields.customerJourney) q.customerJourney = str(fields.customerJourney);
        if (fields.teamDescription) q.teamDescription = str(fields.teamDescription);
        if (fields.mainProcesses) q.mainProcesses = str(fields.mainProcesses);
        if (fields.existingTools?.length) {
          q.existingTools = (fields.existingTools as unknown[]).map((t) => typeof t === 'string' ? t : String(t));
        }
        if (fields.productType) q.productType = fields.productType;
        if (fields.techDecisions) q.techDecisions = str(fields.techDecisions);
        if (fields.constraints) q.constraints = str(fields.constraints);
        if (fields.teamSize) q.teamSize = fields.teamSize;
        if (fields.monthlyBudget) q.monthlyBudget = fields.monthlyBudget;
        if (fields.regulations?.length) {
          q.regulations = (fields.regulations as unknown[]).map((r) => typeof r === 'string' ? r : String(r));
        }

        return {
          questionnaire: q,
          industryHint: fields.industryHint || s.industryHint,
          isAutofilling: false,
        };
      });
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('[BlueprintStore] Autofill error:', err);
      set({
        isAutofilling: false,
        error: err.response?.data?.error || err.message || 'Auto-fill failed',
      });
    }
  },

  reset: () =>
    set({
      step: 0,
      questionnaire: { ...emptyQuestionnaire },
      complexityHint: 'standard',
      industryHint: '',
      isGenerating: false,
      generationPhase: null,
      generationPercent: 0,
      generationMessage: '',
      result: null,
      editedElements: [],
      editedConnections: [],
      removedElementIds: new Set(),
      isImporting: false,
      importResult: null,
      error: null,
      isAutofilling: false,
      autofillDocumentName: null,
    }),
}));
