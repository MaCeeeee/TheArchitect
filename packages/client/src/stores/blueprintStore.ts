import { create } from 'zustand';
import { useAuthStore } from './authStore';
import { blueprintAPI } from '../services/api';
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
      console.error('[BlueprintStore] Generation error:', err);
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
    const { editedElements, editedConnections, result } = get();
    if (!result) return;

    set({ isImporting: true, error: null, step: 4 });

    try {
      const { data } = await blueprintAPI.import(projectId, {
        elements: editedElements,
        connections: editedConnections,
        input: result.input,
        workspaceName,
      });
      set({
        isImporting: false,
        importResult: data.data || data,
      });
    } catch (err: any) {
      console.error('[BlueprintStore] Import error:', err);
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

        if (fields.businessDescription) q.businessDescription = fields.businessDescription;
        if (fields.targetUsers) q.targetUsers = fields.targetUsers;
        if (fields.problemSolved) q.problemSolved = fields.problemSolved;
        if (fields.urgencyDriver) q.urgencyDriver = fields.urgencyDriver;
        if (fields.goals && Array.isArray(fields.goals)) {
          q.goals = [
            fields.goals[0] || q.goals[0],
            fields.goals[1] || q.goals[1],
            fields.goals[2] || q.goals[2],
          ];
        }
        if (fields.successVision) q.successVision = fields.successVision;
        if (fields.principles) q.principles = fields.principles;
        if (fields.capabilities) q.capabilities = fields.capabilities;
        if (fields.customerJourney) q.customerJourney = fields.customerJourney;
        if (fields.teamDescription) q.teamDescription = fields.teamDescription;
        if (fields.mainProcesses) q.mainProcesses = fields.mainProcesses;
        if (fields.existingTools?.length) q.existingTools = fields.existingTools;
        if (fields.productType) q.productType = fields.productType;
        if (fields.techDecisions) q.techDecisions = fields.techDecisions;
        if (fields.constraints) q.constraints = fields.constraints;
        if (fields.teamSize) q.teamSize = fields.teamSize;
        if (fields.monthlyBudget) q.monthlyBudget = fields.monthlyBudget;
        if (fields.regulations?.length) q.regulations = fields.regulations;

        return {
          questionnaire: q,
          industryHint: fields.industryHint || s.industryHint,
          isAutofilling: false,
        };
      });
    } catch (err: any) {
      console.error('[BlueprintStore] Autofill error:', err);
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
