/**
 * complianceStore — violationDetailsByElement slice (THE-202)
 *
 * loadViolations builds, in addition to the count maps, a per-element
 * detail map (top-N=5, sorted critical→low) so the 3D tooltip can render
 * the actual structured messages inline without a second fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the api module BEFORE importing the store (factory is hoisted).
// Must export every VALUE binding the store's module graph imports, or the
// import chain breaks. Copied from complianceStore.mappings.test.ts.
vi.mock('../services/api', () => ({
  complianceMappingAPI: { getByElement: vi.fn(), getAll: vi.fn() },
  compliancePipelineAPI: { getPipelineStatus: vi.fn(), getPortfolio: vi.fn() },
  governanceAPI: { getViolations: vi.fn(), getViolationsByElement: vi.fn() },
  architectureAPI: { getElements: vi.fn(), getConnections: vi.fn() },
  requirementsAPI: { gaps: vi.fn(), update: vi.fn() },
}));

// Mock the architecture store so the module graph stays minimal.
vi.mock('./architectureStore', () => ({
  useArchitectureStore: {
    getState: () => ({ setElements: vi.fn(), setConnections: vi.fn() }),
  },
}));

import { useComplianceStore } from './complianceStore';
import { governanceAPI } from '../services/api';

describe('complianceStore.loadViolations (THE-202)', () => {
  beforeEach(() => {
    useComplianceStore.getState().clear();
    vi.clearAllMocks();
  });

  it('builds detail map sorted by severity, capped at 5 per element', async () => {
    const mk = (i: number, severity: string) => ({
      _id: `v${i}`, projectId: 'p', policyId: 'pol', elementId: 'el-1',
      violationType: 'violation', severity, enforcementLevel: 'advisory',
      ruleId: `r-${i}`, message: `m${i}`, field: 'f', resourcePath: `/elements/el-1/f`,
      currentValue: null, expectedValue: null, status: 'open',
      detectedAt: '', details: '',
    });
    (governanceAPI.getViolations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [mk(1, 'low'), mk(2, 'critical'), mk(3, 'medium'), mk(4, 'high'), mk(5, 'low'), mk(6, 'low')] },
    });

    await useComplianceStore.getState().loadViolations('p');
    const details = useComplianceStore.getState().violationDetailsByElement.get('el-1')!;
    expect(details).toHaveLength(5);
    expect(details[0].severity).toBe('critical');
    expect(details[1].severity).toBe('high');
    expect(useComplianceStore.getState().violationsByElement.get('el-1')).toBe(6);
  });
});
