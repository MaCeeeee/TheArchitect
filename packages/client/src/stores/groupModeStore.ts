/**
 * UC-METH-002 (REQ .3) — the group mode: select the members, write a name, make the group.
 * One server call makes the group and its compositions; the answer goes into the model as it is
 * (no optimistic copy). Errors stay in the mode with the selection, so the user can do it again.
 */
import { create } from 'zustand';
import { groupsAPI } from '../services/api';
import { useArchitectureStore, type ArchitectureElement, type Connection } from './architectureStore';
import { useAdvisorStore } from './advisorStore';
import { useUIStore } from './uiStore';
import { GROUP_MODE_TEXT } from '../components/groups/groupModeText';
import { groupFeedback, type GroupFeedback, type SkippedMember } from '../components/groups/ladderGuidance';

export const MIN_GROUP_SELECTION = 2;

interface GroupModeState {
  /** The project the mode (or its feedback) belongs to; null when idle without feedback. */
  projectId: string | null;
  active: boolean;
  phase: 'select' | 'name';
  selected: string[];
  name: string;
  busy: boolean;
  error: string | null;
  feedback: GroupFeedback | null;
  start: (projectId: string) => void;
  toggle: (elementId: string) => void;
  toNaming: () => void;
  setName: (name: string) => void;
  cancel: () => void;
  /** Full idle: no mode, no selection, no error, no feedback, no project. */
  reset: () => void;
  /** Drops selected ids that are no longer in the model. */
  pruneSelection: (existingIds: Set<string> | string[]) => void;
  dismiss: () => void;
  submit: (projectId: string) => Promise<void>;
}

const IDLE = { active: false, phase: 'select' as const, selected: [] as string[], name: '', busy: false, error: null as string | null };

function errorText(err: unknown): string {
  const response = (err as { response?: { status?: number; data?: { unknownIds?: unknown; skipped?: unknown } } }).response;
  const status = response?.status;
  const unknownIds = response?.data?.unknownIds;
  const skipped = response?.data?.skipped;
  if (status === 400 && Array.isArray(unknownIds)) return `${GROUP_MODE_TEXT.didNotMake} ${GROUP_MODE_TEXT.mustBeInModel}`;
  if (status === 400 && Array.isArray(skipped) && skipped.length > 0) {
    const names = (skipped as SkippedMember[]).map((s) => GROUP_MODE_TEXT.notAMember(s.name)).join(' ');
    return `${GROUP_MODE_TEXT.didNotMake} ${names} ${GROUP_MODE_TEXT.notAMemberReason}`;
  }
  if (status === 409) return `${GROUP_MODE_TEXT.didNotMake} ${GROUP_MODE_TEXT.modelChanged} ${GROUP_MODE_TEXT.doAgain}`;
  return `${GROUP_MODE_TEXT.didNotMake} ${GROUP_MODE_TEXT.doAgain}`;
}

export const useGroupModeStore = create<GroupModeState>((set, get) => ({
  ...IDLE,
  projectId: null,
  feedback: null,

  start: (projectId) => {
    useUIStore.getState().exitConnectionMode();
    useArchitectureStore.getState().clearSelection();
    set({ ...IDLE, projectId, active: true, feedback: null });
  },

  toggle: (elementId) =>
    set((s) => {
      if (!s.active || s.phase !== 'select') return {};
      const selected = s.selected.includes(elementId) ? s.selected.filter((id) => id !== elementId) : [...s.selected, elementId];
      return { selected, error: null };
    }),

  toNaming: () => set((s) => (s.active && s.selected.length >= MIN_GROUP_SELECTION ? { phase: 'name', error: null } : {})),

  setName: (name) => set({ name }),

  cancel: () => set((s) => ({ ...IDLE, projectId: s.feedback ? s.projectId : null })),

  reset: () => set({ ...IDLE, projectId: null, feedback: null }),

  pruneSelection: (existingIds) =>
    set((s) => {
      if (!s.active) return {};
      const existing = existingIds instanceof Set ? existingIds : new Set(existingIds);
      const selected = s.selected.filter((id) => existing.has(id));
      if (selected.length === s.selected.length) return {};
      return { selected, phase: s.phase === 'name' && selected.length < MIN_GROUP_SELECTION ? 'select' : s.phase };
    }),

  dismiss: () => set((s) => ({ feedback: null, projectId: s.active ? s.projectId : null })),

  submit: async (projectId) => {
    const { active, busy, selected, name } = get();
    const trimmed = name.trim();
    if (!active || busy || get().projectId !== projectId || selected.length < MIN_GROUP_SELECTION || !trimmed) return;
    set({ busy: true, error: null });
    try {
      const { data } = await groupsAPI.create(projectId, { name: trimmed, type: 'grouping', memberIds: selected });
      const result = data.data as { element: ArchitectureElement; connections: Connection[]; skipped: SkippedMember[] };
      // The mode was cancelled or another project was opened while the request ran: drop the answer.
      const stillHere = () => useArchitectureStore.getState().projectId === projectId && get().projectId === projectId && get().active;
      if (!stillHere()) return;
      useArchitectureStore.getState().addFromServer([result.element], result.connections);
      const report = await useAdvisorStore.getState().loadLadder(projectId);
      if (!stillHere()) return;
      set({ ...IDLE, projectId, feedback: groupFeedback(report, projectId, result.skipped) });
    } catch (err) {
      set({ busy: false, error: errorText(err) });
    }
  },
}));
