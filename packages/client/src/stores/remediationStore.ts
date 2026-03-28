import { create } from 'zustand';
import { remediationAPI } from '../services/api';
import { useAuthStore } from './authStore';
import type {
  RemediationProposal,
  RemediationContext,
  RemediationStreamEvent,
  ProposalElement,
} from '@thearchitect/shared';

interface RemediationState {
  // Data
  proposals: RemediationProposal[];
  selectedProposalId: string | null;
  previewElements: ProposalElement[];

  // UI state
  isGenerating: boolean;
  isApplying: boolean;
  generationProgress: string;
  error: string | null;

  // Actions
  generate: (projectId: string, context: RemediationContext) => Promise<void>;
  loadProposals: (projectId: string) => Promise<void>;
  selectProposal: (proposalId: string | null) => void;
  editProposal: (projectId: string, proposalId: string, changes: Record<string, unknown>) => Promise<void>;
  applyProposal: (projectId: string, proposalId: string, selectedTempIds?: string[]) => Promise<void>;
  applyBatch: (projectId: string, proposalIds: string[]) => Promise<void>;
  rollbackProposal: (projectId: string, proposalId: string) => Promise<void>;
  setPreviewElements: (elements: ProposalElement[]) => void;
  clearPreview: () => void;
  clear: () => void;
}

export const useRemediationStore = create<RemediationState>((set, get) => ({
  proposals: [],
  selectedProposalId: null,
  previewElements: [],
  isGenerating: false,
  isApplying: false,
  generationProgress: '',
  error: null,

  generate: async (projectId: string, context: RemediationContext) => {
    set({ isGenerating: true, error: null, generationProgress: 'Starting...' });

    try {
      const token = useAuthStore.getState().token;
      const url = remediationAPI.generateStreamUrl(projectId);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ context }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

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
          if (data === '[DONE]') continue;

          try {
            const event: RemediationStreamEvent = JSON.parse(data);

            switch (event.type) {
              case 'progress':
                set({ generationProgress: event.message });
                break;
              case 'complete':
                set((state) => ({
                  proposals: [event.proposal, ...state.proposals],
                  isGenerating: false,
                  generationProgress: '',
                }));
                break;
              case 'error':
                set({ error: event.message, isGenerating: false, generationProgress: '' });
                break;
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // If still generating after stream ends (no complete event received)
      if (get().isGenerating) {
        set({ isGenerating: false, generationProgress: '' });
      }
    } catch (err) {
      set({
        isGenerating: false,
        generationProgress: '',
        error: (err as Error).message || 'Generation failed',
      });
    }
  },

  loadProposals: async (projectId: string) => {
    try {
      const { data } = await remediationAPI.getProposals(projectId);
      set({ proposals: data.data || [] });
    } catch (err) {
      set({ error: (err as Error).message || 'Failed to load proposals' });
    }
  },

  selectProposal: (proposalId: string | null) => {
    set({ selectedProposalId: proposalId });
    if (proposalId) {
      const proposal = get().proposals.find((p) => p.id === proposalId);
      if (proposal) {
        set({ previewElements: proposal.elements });
      }
    } else {
      set({ previewElements: [] });
    }
  },

  editProposal: async (projectId: string, proposalId: string, changes: Record<string, unknown>) => {
    try {
      await remediationAPI.editProposal(projectId, proposalId, changes);
      // Reload proposals to get updated data
      await get().loadProposals(projectId);
    } catch (err) {
      set({ error: (err as Error).message || 'Failed to edit proposal' });
    }
  },

  applyProposal: async (projectId: string, proposalId: string, selectedTempIds?: string[]) => {
    set({ isApplying: true, error: null });
    try {
      await remediationAPI.applyProposal(projectId, proposalId, { selectedTempIds });
      // Update proposal status locally
      set((state) => ({
        proposals: state.proposals.map((p) =>
          p.id === proposalId
            ? { ...p, status: selectedTempIds ? 'partially_applied' as const : 'applied' as const }
            : p,
        ),
        isApplying: false,
        previewElements: [],
        selectedProposalId: null,
      }));
    } catch (err) {
      set({ isApplying: false, error: (err as Error).message || 'Apply failed' });
    }
  },

  applyBatch: async (projectId: string, proposalIds: string[]) => {
    set({ isApplying: true, error: null });
    try {
      await remediationAPI.applyBatch(projectId, proposalIds);
      set((state) => ({
        proposals: state.proposals.map((p) =>
          proposalIds.includes(p.id) ? { ...p, status: 'applied' as const } : p,
        ),
        isApplying: false,
        previewElements: [],
      }));
    } catch (err) {
      set({ isApplying: false, error: (err as Error).message || 'Batch apply failed' });
    }
  },

  rollbackProposal: async (projectId: string, proposalId: string) => {
    set({ isApplying: true, error: null });
    try {
      await remediationAPI.rollbackProposal(projectId, proposalId);
      set((state) => ({
        proposals: state.proposals.map((p) =>
          p.id === proposalId ? { ...p, status: 'validated' as const, appliedElementIds: [], appliedConnectionIds: [] } : p,
        ),
        isApplying: false,
      }));
    } catch (err) {
      set({ isApplying: false, error: (err as Error).message || 'Rollback failed' });
    }
  },

  setPreviewElements: (elements: ProposalElement[]) => set({ previewElements: elements }),
  clearPreview: () => set({ previewElements: [], selectedProposalId: null }),

  clear: () => set({
    proposals: [],
    selectedProposalId: null,
    previewElements: [],
    isGenerating: false,
    isApplying: false,
    generationProgress: '',
    error: null,
  }),
}));
