/**
 * complianceStore — violationDetailsByElement slice (THE-202)
 *
 * loadViolations builds, in addition to the count maps, a per-element
 * detail map (top-N=5, sorted critical→low with ruleId tiebreak) so the
 * 3D tooltip can render the actual structured messages inline without a
 * second fetch. Array references stay stable across reloads while an
 * element's rendered content is unchanged (re-render economy for
 * reference-equality subscribers like NodeObject3D).
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

const mk = (i: number, severity: string, elementId = 'el-1') => ({
  _id: `v${i}`, projectId: 'p', policyId: `pol-${i}`, elementId,
  violationType: 'violation', severity, enforcementLevel: 'advisory',
  ruleId: `r-${i}`, message: `m${i}`, field: 'f', resourcePath: `/elements/${elementId}/f`,
  currentValue: null, expectedValue: null, status: 'open',
  detectedAt: '', details: '',
});

// el-1: 6 violations (details capped at 5); el-2: 2 violations.
// policyId varies PER violation, so grouping by the wrong key cannot pass.
// Same-severity lows arrive OUT of ruleId order (r-6, r-1, r-5) — a stable
// sort without the ruleId tiebreak would keep arrival order and fail the
// order assertion below.
const FIXTURE = [
  mk(6, 'low'), mk(2, 'critical'), mk(3, 'medium'), mk(4, 'high'), mk(1, 'low'), mk(5, 'low'),
  mk(7, 'low', 'el-2'), mk(8, 'medium', 'el-2'),
];

describe('complianceStore.loadViolations (THE-202)', () => {
  beforeEach(() => {
    useComplianceStore.getState().clear();
    vi.clearAllMocks();
  });

  it('builds detail map per element, sorted by severity (ruleId tiebreak), capped at 5', async () => {
    (governanceAPI.getViolations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: FIXTURE },
    });

    await useComplianceStore.getState().loadViolations('p');

    const el1 = useComplianceStore.getState().violationDetailsByElement.get('el-1')!;
    expect(el1).toHaveLength(5);
    expect(el1[0].severity).toBe('critical');
    expect(el1[1].severity).toBe('high');
    // Full deterministic order: severity desc, same-severity by ruleId
    // (r-1 < r-5 < r-6, so v6 is the one cut by the top-5 cap).
    expect(el1.map((v) => v._id)).toEqual(['v2', 'v4', 'v3', 'v1', 'v5']);

    const el2 = useComplianceStore.getState().violationDetailsByElement.get('el-2')!;
    expect(el2.map((v) => v._id)).toEqual(['v8', 'v7']); // medium before low

    expect(useComplianceStore.getState().violationsByElement.get('el-1')).toBe(6);
    expect(useComplianceStore.getState().violationsByElement.get('el-2')).toBe(2);
  });

  it('keeps the previous array reference when rendered content is unchanged', async () => {
    // Second response is a FRESH set of DTO objects with identical values —
    // proves the stability check compares content, not object identity.
    (governanceAPI.getViolations as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: { data: FIXTURE } })
      .mockResolvedValueOnce({ data: { data: FIXTURE.map((v) => ({ ...v })) } });

    await useComplianceStore.getState().loadViolations('p');
    const first = useComplianceStore.getState().violationDetailsByElement.get('el-1');

    await useComplianceStore.getState().loadViolations('p');
    const second = useComplianceStore.getState().violationDetailsByElement.get('el-1');

    expect(first).toBeDefined();
    expect(second).toBe(first); // Object.is — unchanged content, no re-render
  });

  it('clear() resets violationDetailsByElement to an empty Map', async () => {
    (governanceAPI.getViolations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: FIXTURE },
    });

    await useComplianceStore.getState().loadViolations('p');
    expect(useComplianceStore.getState().violationDetailsByElement.size).toBe(2);

    useComplianceStore.getState().clear();
    expect(useComplianceStore.getState().violationDetailsByElement.size).toBe(0);
  });
});
