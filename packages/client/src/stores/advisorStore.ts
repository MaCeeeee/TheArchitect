import { create } from 'zustand';
import { advisorAPI } from '../services/api';
import type { AdvisorScanResult, AdvisorInsight, HealthScore, LadderReport } from '@thearchitect/shared';

interface AdvisorState {
  // Data
  healthScore: HealthScore | null;
  insights: AdvisorInsight[];
  totalElements: number;
  scanDurationMs: number;
  ladder: LadderReport | null;
  /** Ladder rung the action field points at; the ladder panel opens and marks it (UC-METH-002). */
  focusRung: number | null;

  // UI state
  isScanning: boolean;
  lastScanAt: string | null;
  error: string | null;

  // Actions
  scan: (projectId: string) => Promise<void>;
  loadLadder: (projectId: string) => Promise<void>;
  /** Removes the scan only; the ladder report stays. */
  clearScan: () => void;
  focusLadderRung: (rung: number | null) => void;
  clear: () => void;
}

// Number of the latest ladder request. An answer or an error that belongs to an earlier one —
// another project's, or an older refresh — must not replace what the latest request shows.
let latestLadderRequest = 0;

export const useAdvisorStore = create<AdvisorState>((set) => ({
  healthScore: null,
  insights: [],
  totalElements: 0,
  scanDurationMs: 0,
  ladder: null,
  focusRung: null,
  isScanning: false,
  lastScanAt: null,
  error: null,

  scan: async (projectId: string) => {
    set({ isScanning: true, error: null });
    try {
      const { data } = await advisorAPI.scan(projectId);
      const result = data.data as AdvisorScanResult;
      set({
        healthScore: result.healthScore,
        insights: result.insights,
        totalElements: result.totalElements,
        scanDurationMs: result.scanDurationMs,
        lastScanAt: result.timestamp,
        isScanning: false,
      });
    } catch (err) {
      set({
        isScanning: false,
        error: (err as Error).message || 'Scan failed',
      });
    }
  },

  loadLadder: async (projectId: string) => {
    const request = ++latestLadderRequest;
    try {
      const { data } = await advisorAPI.ladder(projectId);
      if (request === latestLadderRequest) {
        const report = data.data as LadderReport;
        set((s) => ({ ladder: report, focusRung: s.ladder?.projectId === report.projectId ? s.focusRung : null }));
      }
    } catch {
      if (request === latestLadderRequest) set({ ladder: null }); // optional block — the scan stays usable without it
    }
  },

  /** Removes the scan only. The ladder report stays: the action field reads it without the panel (UC-METH-002). */
  clearScan: () => set({
    healthScore: null,
    insights: [],
    totalElements: 0,
    scanDurationMs: 0,
    isScanning: false,
    lastScanAt: null,
    error: null,
  }),

  focusLadderRung: (rung) => set({ focusRung: rung }),

  clear: () => set({
    healthScore: null,
    insights: [],
    totalElements: 0,
    scanDurationMs: 0,
    ladder: null,
    focusRung: null,
    isScanning: false,
    lastScanAt: null,
    error: null,
  }),
}));
