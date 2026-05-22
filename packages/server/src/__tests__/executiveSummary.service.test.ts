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

const mockRegulationCount = jest.fn();
jest.mock('../models/Regulation', () => ({
  Regulation: { countDocuments: (...args: unknown[]) => mockRegulationCount(...args) },
}));

const mockMappingCount = jest.fn();
jest.mock('../models/StandardMapping', () => ({
  StandardMapping: { countDocuments: (...args: unknown[]) => mockMappingCount(...args) },
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

const emptyRoadmap = () => ({ sort: () => ({ lean: () => Promise.resolve(null) }) });

beforeEach(() => {
  jest.clearAllMocks();
  invalidateExecutiveSummary(PROJECT_ID);
  mockRunCriticality.mockResolvedValue({ scores: [], computedAt: new Date(), weights: {}, fromCache: false });
  mockComputeGraphCentrality.mockResolvedValue([]);
  mockRegulationCount.mockResolvedValue(0);
  mockMappingCount.mockResolvedValue(0);
  mockRoadmapFindOne.mockReturnValue(emptyRoadmap());
  mockScenarioCount.mockResolvedValue(0);
  mockRunCypher.mockResolvedValue([elementStatsRow()]);
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
    mockRunCypher.mockResolvedValue([elementStatsRow({ total: 6, atTarget: 0 })]);

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.cio.headline.tone).toBe('critical');
    expect(summary.cio.criticalHotspots.count).toBe(6);
    expect(summary.cio.criticalHotspots.topName).toBe('Service 0');
  });

  it('3. regulations exist + 0 mappings → ceo.headline.tone === "critical"', async () => {
    mockRegulationCount.mockResolvedValue(16);
    mockMappingCount.mockResolvedValue(0);
    mockRunCypher.mockResolvedValue([elementStatsRow({ total: 50, atTarget: 10, maturityAvg: 3.5 })]);

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.ceo.headline.tone).toBe('critical');
    expect(summary.ceo.complianceCoverage.regulationsCrawled).toBe(16);
    expect(summary.ceo.complianceCoverage.mappingCoveragePct).toBe(0);
    expect(summary.ceo.headline.title).toContain('Compliance gap');
  });

  it('4. dominant Tier 3 → cfo.headline.tone === "critical" + dominantTier === 3', async () => {
    mockComputeGraphCentrality.mockResolvedValue([
      { elementId: 'e1', elementName: 'BigSpender', elementType: 'application_component', tier: 3, totalEstimated: 2_500_000, confidenceLow: 1_800_000, confidenceHigh: 3_400_000 },
      { elementId: 'e2', elementName: 'Small', elementType: 'application_component', tier: 1, totalEstimated: 80_000, confidenceLow: 60_000, confidenceHigh: 110_000 },
    ]);
    mockRunCypher.mockResolvedValue([elementStatsRow({ total: 2, atTarget: 0 })]);

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
    mockRunCypher.mockResolvedValue([elementStatsRow({ total: 5, atTarget: 2 })]);

    const summary = await buildExecutiveSummary(PROJECT_ID);
    expect(summary.cfo.totalTco.value).toBe(0);
    expect(summary.cfo.investmentHeatmap.tierCounts).toEqual([0, 0, 0, 0]);
  });

  it('6. 2nd call within TTL returns fromCache=true', async () => {
    mockRunCypher.mockResolvedValue([elementStatsRow({ total: 3 })]);

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
    mockRunCypher.mockResolvedValue([elementStatsRow({ total: 3 })]);
    await buildExecutiveSummary(PROJECT_ID);
    mockRunCriticality.mockClear();
    await buildExecutiveSummary(PROJECT_ID, { forceRefresh: true });
    expect(mockRunCriticality).toHaveBeenCalledTimes(1);
  });

  it('8. invalidateExecutiveSummary() clears cache', async () => {
    mockRunCypher.mockResolvedValue([elementStatsRow({ total: 3 })]);
    await buildExecutiveSummary(PROJECT_ID);
    invalidateExecutiveSummary(PROJECT_ID);
    mockRunCriticality.mockClear();
    const third = await buildExecutiveSummary(PROJECT_ID);
    expect(third.fromCache).toBe(false);
    expect(mockRunCriticality).toHaveBeenCalledTimes(1);
  });
});
