/**
 * REQ-EXEC-001 — Tests for buildExecutiveSummary.
 *
 * Covers the aggregator that fans out to UC-CRIT, UC-COST, UC-ICM-001, StandardMapping,
 * TransformationRoadmap and Scenario, then derives 3 persona views with tone-driven headlines.
 *
 * Run: cd packages/server && npx jest src/__tests__/executiveSummary.service.test.ts --forceExit
 */

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockRunCriticality = jest.fn();
jest.mock('../services/criticalityRunner.service', () => ({
  runCriticalityForProject: (...args: unknown[]) => mockRunCriticality(...args),
}));

const mockComputeGraphCentrality = jest.fn();
jest.mock('../services/cost-engine.service', () => ({
  computeGraphCentrality: (...args: unknown[]) => mockComputeGraphCentrality(...args),
}));

jest.mock('../services/smart-cost.service', () => ({
  estimateSmartCost: () => ({ annualCost: 30_000, confidence: 'type_default', source: 'mock' }),
}));

const mockRegulationCount = jest.fn();
jest.mock('../models/Regulation', () => ({
  Regulation: { countDocuments: (...args: unknown[]) => mockRegulationCount(...args) },
}));

const mockMappingDistinct = jest.fn();
jest.mock('../models/StandardMapping', () => ({
  StandardMapping: {
    distinct: (...args: unknown[]) => mockMappingDistinct(...args),
  },
}));

const mockRoadmapFindOne = jest.fn();
jest.mock('../models/TransformationRoadmap', () => ({
  TransformationRoadmap: {
    findOne: (...args: unknown[]) => mockRoadmapFindOne(...args),
  },
}));

const mockScenarioCount = jest.fn();
jest.mock('../models/Scenario', () => ({
  Scenario: { countDocuments: (...args: unknown[]) => mockScenarioCount(...args) },
}));

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

import {
  buildExecutiveSummary,
  invalidateExecutiveSummary,
} from '../services/executiveSummary.service';

const PROJECT_ID = 'p-exec-test';

const elementStatsRow = (overrides: Partial<{ total: number; atTarget: number; maturityAvg: number; immatureCount: number }> = {}) => ({
  get: (k: string) => ({
    total: 0,
    atTarget: 0,
    maturityAvg: 0,
    immatureCount: 0,
    ...overrides,
  })[k as 'total' | 'atTarget' | 'maturityAvg' | 'immatureCount'] ?? 0,
});

const costElementRow = (props: { id: string; name: string; type: string; layer?: string; status?: string; annualCost?: number; maturityLevel?: number | null }) => ({
  get: (k: string) => {
    const data = {
      id: props.id,
      name: props.name,
      type: props.type,
      layer: props.layer ?? 'application',
      status: props.status ?? 'current',
      annualCost: props.annualCost ?? 0,
      maturityLevel: props.maturityLevel ?? null,
    } as Record<string, unknown>;
    return data[k] ?? null;
  },
});

const setupCypher = (
  stats: ReturnType<typeof elementStatsRow>,
  costElements: ReturnType<typeof costElementRow>[] = [],
) => {
  mockRunCypher.mockImplementation((query: string) => {
    if (query.includes('count(e) AS total')) return Promise.resolve([stats]);
    if (query.includes('annualCost')) return Promise.resolve(costElements);
    return Promise.resolve([]);
  });
};

const emptyRoadmap = () => ({ sort: () => ({ lean: () => Promise.resolve(null) }) });

beforeEach(() => {
  jest.clearAllMocks();
  invalidateExecutiveSummary(PROJECT_ID);
  mockRunCriticality.mockResolvedValue({ scores: [], computedAt: new Date(), weights: {}, fromCache: false });
  mockComputeGraphCentrality.mockResolvedValue([]);
  mockRegulationCount.mockResolvedValue(0);
  mockMappingDistinct.mockResolvedValue([]);
  mockRoadmapFindOne.mockReturnValue(emptyRoadmap());
  mockScenarioCount.mockResolvedValue(0);
  setupCypher(elementStatsRow());
});

describe('buildExecutiveSummary', () => {
  it('1. empty project → all counts 0, headlines all neutral', async () => {
    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.ceo.headline.tone).toBe('neutral');
    expect(summary.cio.headline.tone).toBe('positive');           // no hotspots = healthy
    expect(summary.cfo.headline.tone).toBe('neutral');
    expect(summary.cio.criticalHotspots.count).toBe(0);
    expect(summary.cio.spofs.count).toBe(0);
    expect(summary.cfo.totalTco.value).toBe(0);
    expect(summary.ceo.complianceCoverage.regulationsCrawled).toBe(0);
    expect(summary.fromCache).toBe(false);
  });

  it('2. ≥5 critical hotspots → cio.headline.tone === "critical"', async () => {
    const scores = Array.from({ length: 6 }, (_, i) => ({
      elementId: `e${i}`,
      name: `Service ${i}`,
      type: 'application_component',
      layer: 'application',
      totalScore: 75,
      factors: {},
      dominantFactor: 'riskConnectivity',
    }));
    mockRunCriticality.mockResolvedValue({ scores, computedAt: new Date(), weights: {}, fromCache: false });
    setupCypher(elementStatsRow({ total: 6, atTarget: 0 }));

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.cio.headline.tone).toBe('critical');
    expect(summary.cio.criticalHotspots.count).toBe(6);
    expect(summary.cio.criticalHotspots.topName).toBe('Service 0');
  });

  it('3. regulations exist + 0 mappings → ceo.headline.tone === "critical"', async () => {
    mockRegulationCount.mockResolvedValue(16);
    mockMappingDistinct.mockResolvedValue([]);
    setupCypher(elementStatsRow({ total: 50, atTarget: 10, maturityAvg: 3.5 }));

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.ceo.headline.tone).toBe('critical');
    expect(summary.ceo.complianceCoverage.regulationsCrawled).toBe(16);
    expect(summary.ceo.complianceCoverage.mappingCoveragePct).toBe(0);
    expect(summary.ceo.headline.title).toContain('Compliance gap');
  });

  it('3b. mappingCoveragePct is capped at 100% when many distinct elements map', async () => {
    // 5 elements but 12 distinct elementIds returned (e.g. cross-project bleed) → cap at 100
    mockMappingDistinct.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']);
    setupCypher(elementStatsRow({ total: 5, atTarget: 1 }));

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.ceo.complianceCoverage.mappingCoveragePct).toBe(100);
    expect(summary.cio.complianceStatus.coveragePct).toBe(100);
    expect(summary.ceo.complianceCoverage.standardMappings).toBe(12);
  });

  it('3c. Tier-0 cost falls back to smart-cost × status-multiplier (totalTco > 0)', async () => {
    mockComputeGraphCentrality.mockResolvedValue([
      { elementId: 'e1', elementName: 'SAP S/4HANA', elementType: 'application_component', tier: 0 },
      { elementId: 'e2', elementName: 'Custom Service', elementType: 'application_component', tier: 0 },
    ]);
    setupCypher(
      elementStatsRow({ total: 2, atTarget: 0 }),
      [
        costElementRow({ id: 'e1', name: 'SAP S/4HANA', type: 'application_component', status: 'current' }),
        costElementRow({ id: 'e2', name: 'Custom Service', type: 'application_component', status: 'target' }),
      ],
    );

    const summary = await buildExecutiveSummary(PROJECT_ID);
    // current: 30_000 × 1.0 = 30_000; target: 30_000 × 1.8 = 54_000 → total 84_000
    expect(summary.cfo.totalTco.value).toBe(84_000);
    expect(summary.cfo.investmentHeatmap.tierCounts[0]).toBe(2);
  });

  it('3d. annualCost on element wins over profile + applies status multiplier', async () => {
    mockComputeGraphCentrality.mockResolvedValue([
      { elementId: 'e1', elementName: 'SAP', elementType: 'application_component', tier: 1, totalEstimated: 999_999 },
    ]);
    setupCypher(
      elementStatsRow({ total: 1, atTarget: 0 }),
      [
        // annualCost=100k with status=target (×1.8) should beat profile.totalEstimated=999_999
        costElementRow({ id: 'e1', name: 'SAP', type: 'application_component', status: 'target', annualCost: 100_000 }),
      ],
    );
    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.cfo.totalTco.value).toBe(180_000);          // 100k × 1.8
    expect(summary.cfo.costHotspots.topElement).toBe('SAP');
  });

  it('3e. immature element (maturityLevel ≤ 2) contributes 30% to optimization potential', async () => {
    mockComputeGraphCentrality.mockResolvedValue([
      { elementId: 'e1', elementName: 'LegacyApp', elementType: 'application_component', tier: 1, totalEstimated: 200_000 },
    ]);
    setupCypher(
      elementStatsRow({ total: 1, atTarget: 0 }),
      [costElementRow({ id: 'e1', name: 'LegacyApp', type: 'application_component', status: 'current', maturityLevel: 1 })],
    );
    const summary = await buildExecutiveSummary(PROJECT_ID);
    // profile.totalEstimated=200_000 wins (annualCost=0), maturity 1 → 30% opt
    expect(summary.cfo.optimizationPotential.value).toBe(60_000);
    expect(summary.cfo.optimizationPotential.percentOfTco).toBe(30);
  });

  it('4. dominant Tier 3 → cfo.headline.tone === "critical" + dominantTier === 3', async () => {
    mockComputeGraphCentrality.mockResolvedValue([
      { elementId: 'e1', elementName: 'BigSpender', elementType: 'application_component', tier: 3, totalEstimated: 2_500_000, confidenceLow: 1_800_000, confidenceHigh: 3_400_000 },
      { elementId: 'e2', elementName: 'Small', elementType: 'application_component', tier: 1, totalEstimated: 80_000, confidenceLow: 60_000, confidenceHigh: 110_000 },
    ]);
    setupCypher(
      elementStatsRow({ total: 2, atTarget: 0 }),
      [
        costElementRow({ id: 'e1', name: 'BigSpender', type: 'application_component', status: 'current' }),
        costElementRow({ id: 'e2', name: 'Small', type: 'application_component', status: 'current' }),
      ],
    );

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.cfo.headline.tone).toBe('critical');
    expect(summary.cfo.costHotspots.dominantTier).toBe(3);
    expect(summary.cfo.costHotspots.topElement).toBe('BigSpender');
    expect(summary.cfo.investmentHeatmap.tierCounts[3]).toBe(1);
    expect(summary.cfo.investmentHeatmap.tierCounts[1]).toBe(1);
    expect(summary.cfo.totalTco.value).toBe(2_580_000);
  });

  it('5. cost-centrality failure does not crash the aggregator', async () => {
    mockComputeGraphCentrality.mockRejectedValue(new Error('neo4j connection refused'));
    setupCypher(elementStatsRow({ total: 5, atTarget: 2 }));

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.cfo.totalTco.value).toBe(0);
    expect(summary.cfo.investmentHeatmap.tierCounts).toEqual([0, 0, 0, 0]);
  });

  it('6. 2nd call within TTL returns fromCache=true', async () => {
    setupCypher(elementStatsRow({ total: 3 }));

    const first = await buildExecutiveSummary(PROJECT_ID);
    expect(first.fromCache).toBe(false);

    // bump mocks — if cache works, these are NOT called the 2nd time
    mockRunCriticality.mockClear();
    mockComputeGraphCentrality.mockClear();
    const second = await buildExecutiveSummary(PROJECT_ID);

    expect(second.fromCache).toBe(true);
    expect(mockRunCriticality).not.toHaveBeenCalled();
    expect(mockComputeGraphCentrality).not.toHaveBeenCalled();
    expect(second.ceo).toEqual(first.ceo);
  });

  it('7. forceRefresh=true bypasses cache', async () => {
    setupCypher(elementStatsRow({ total: 3 }));
    await buildExecutiveSummary(PROJECT_ID);
    mockRunCriticality.mockClear();
    await buildExecutiveSummary(PROJECT_ID, { forceRefresh: true });
    expect(mockRunCriticality).toHaveBeenCalledTimes(1);
  });

  // ─── CEO Expansion: Top Decisions + Strategic ROI ──────────────────────

  it('9. derives a compliance-gap decision from highest complianceGap score with mapping gap', async () => {
    mockRunCriticality.mockResolvedValue({
      scores: [
        { elementId: 'e1', name: 'Customer Data Lake', type: 'data_object', layer: 'information', totalScore: 75, factors: { complianceGap: { raw: 3, normalized: 1, weighted: 1.5 }, spof: { raw: 0, normalized: 0, weighted: 0 } }, dominantFactor: 'complianceGap' },
      ],
      computedAt: new Date(), weights: {}, fromCache: false,
    });
    mockMappingDistinct.mockResolvedValue(['e1']);   // both calls return ['e1']
    setupCypher(elementStatsRow({ total: 1, atTarget: 0 }));

    const summary = await buildExecutiveSummary(PROJECT_ID);
    const compliance = summary.ceo.topDecisions.find((d) => d.kind === 'compliance_gap');
    expect(compliance).toBeDefined();
    expect(compliance!.title).toContain('Customer Data Lake');
    expect(compliance!.why).toContain('3 standard');
    expect(compliance!.sourceElementId).toBe('e1');
  });

  it('10. derives a SPOF decision from highest spof weighted score', async () => {
    mockRunCriticality.mockResolvedValue({
      scores: [
        { elementId: 'e1', name: 'Payment Gateway', type: 'application_service', layer: 'application', totalScore: 80, factors: { spof: { raw: 12, normalized: 1, weighted: 1 } }, dominantFactor: 'spof' },
      ],
      computedAt: new Date(), weights: {}, fromCache: false,
    });
    setupCypher(elementStatsRow({ total: 1 }));

    const summary = await buildExecutiveSummary(PROJECT_ID);
    const spof = summary.ceo.topDecisions.find((d) => d.kind === 'spof');
    expect(spof).toBeDefined();
    expect(spof!.title).toContain('Payment Gateway');
    expect(spof!.why).toContain('12 downstream');
  });

  it('11. Strategic ROI counts goals/drivers with status=target as achieved', async () => {
    setupCypher(
      elementStatsRow({ total: 4 }),
      [
        costElementRow({ id: 'g1', name: 'Goal A', type: 'goal', layer: 'motivation', status: 'target' }),
        costElementRow({ id: 'g2', name: 'Goal B', type: 'goal', layer: 'motivation', status: 'current' }),
        costElementRow({ id: 'd1', name: 'Driver X', type: 'driver', layer: 'motivation', status: 'current', maturityLevel: 5 }),
        costElementRow({ id: 'd2', name: 'Driver Y', type: 'driver', layer: 'motivation', status: 'current', maturityLevel: 2 }),
      ],
    );

    const summary = await buildExecutiveSummary(PROJECT_ID);
    // g1 (target) + d1 (maturity 5) = 2 of 4
    expect(summary.ceo.strategicRoi.totalGoals).toBe(4);
    expect(summary.ceo.strategicRoi.achievedGoals).toBe(2);
    expect(summary.ceo.strategicRoi.goalAttainmentPct).toBe(50);
  });

  it('12. Strategic ROI is 0/0 when no motivation-layer goals exist', async () => {
    setupCypher(
      elementStatsRow({ total: 1 }),
      [costElementRow({ id: 'a1', name: 'SAP', type: 'application_component', layer: 'application' })],
    );
    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.ceo.strategicRoi.totalGoals).toBe(0);
    expect(summary.ceo.strategicRoi.goalAttainmentPct).toBe(0);
    expect(summary.ceo.strategicRoi.description).toContain('No goals');
  });

  it('8. invalidateExecutiveSummary() clears cache', async () => {
    setupCypher(elementStatsRow({ total: 3 }));
    await buildExecutiveSummary(PROJECT_ID);
    invalidateExecutiveSummary(PROJECT_ID);
    mockRunCriticality.mockClear();
    const third = await buildExecutiveSummary(PROJECT_ID);
    expect(third.fromCache).toBe(false);
    expect(mockRunCriticality).toHaveBeenCalledTimes(1);
  });
});
