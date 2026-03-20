import { create } from 'zustand';
import { advisorAPI } from '../services/api';
import type { AdvisorScanResult, AdvisorInsight, HealthScore } from '@thearchitect/shared';

interface AdvisorState {
  // Data
  healthScore: HealthScore | null;
  insights: AdvisorInsight[];
  totalElements: number;
  scanDurationMs: number;

  // UI state
  isScanning: boolean;
  lastScanAt: string | null;
  error: string | null;

  // Actions
  scan: (projectId: string) => Promise<void>;
  clear: () => void;
}

export const useAdvisorStore = create<AdvisorState>((set) => ({
  healthScore: null,
  insights: [],
  totalElements: 0,
  scanDurationMs: 0,
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

  clear: () => set({
    healthScore: null,
    insights: [],
    totalElements: 0,
    scanDurationMs: 0,
    isScanning: false,
    lastScanAt: null,
    error: null,
  }),
}));
