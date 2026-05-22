/**
 * REQ-EXEC-001 — Characterization tests for runCriticalityForProject service.
 *
 * Verifies that extracting the criticality logic from architecture.routes.ts
 * into a reusable service preserves behavior (full sorted score list returned,
 * cache hit/miss, empty-project shortcut).
 *
 * Run: cd packages/server && npx jest src/__tests__/criticalityRunner.service.test.ts --forceExit
 */

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

const mockMappingFind = jest.fn();
jest.mock('../models/StandardMapping', () => ({
  StandardMapping: {
    find: (...args: unknown[]) => mockMappingFind(...args),
  },
}));

const mockRoadmapFindOne = jest.fn();
jest.mock('../models/TransformationRoadmap', () => ({
  TransformationRoadmap: {
    findOne: (...args: unknown[]) => mockRoadmapFindOne(...args),
  },
}));

const mockGetCachedScores = jest.fn();
const mockSaveCachedScores = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/criticalityCache.service', () => ({
  computeInputHash: jest.fn().mockReturnValue('hash123'),
  getCachedScores: (...args: unknown[]) => mockGetCachedScores(...args),
  saveCachedScores: (...args: unknown[]) => mockSaveCachedScores(...args),
}));

import { runCriticalityForProject } from '../services/criticalityRunner.service';

const PROJECT_ID = 'p-runner-test';

const cypherElement = (props: Record<string, unknown>) => ({
  get: (k: string) => (k === 'e' ? { properties: props } : (props as Record<string, unknown>)[k] ?? null),
});

const emptyMappings = () => ({ lean: () => Promise.resolve([]) });
const emptyRoadmap = () => ({ sort: () => ({ lean: () => Promise.resolve(null) }) });

describe('runCriticalityForProject', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCachedScores.mockReset();
    mockSaveCachedScores.mockReset();
    mockMappingFind.mockReturnValue(emptyMappings());
    mockRoadmapFindOne.mockReturnValue(emptyRoadmap());
    mockGetCachedScores.mockResolvedValue(null);
    mockSaveCachedScores.mockResolvedValue(undefined);
  });

  it('returns empty scores + fromCache=false when project has no elements', async () => {
    mockRunCypher.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await runCriticalityForProject(PROJECT_ID);
    expect(result.scores).toEqual([]);
    expect(result.fromCache).toBe(false);
    expect(result.computedAt).toBeInstanceOf(Date);
  });

  it('returns FULL sorted score list (not sliced) for non-empty project', async () => {
    const els = [
      cypherElement({ id: 'a', name: 'A', type: 'application_component', layer: 'application', riskLevel: 'high', maturityLevel: 2 }),
      cypherElement({ id: 'b', name: 'B', type: 'application_component', layer: 'application', riskLevel: 'low', maturityLevel: 5 }),
      cypherElement({ id: 'c', name: 'C', type: 'application_component', layer: 'application', riskLevel: 'critical', maturityLevel: 1 }),
    ];
    mockRunCypher.mockResolvedValueOnce(els).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await runCriticalityForProject(PROJECT_ID);
    expect(result.scores).toHaveLength(3);
    expect(result.scores[0].totalScore).toBeGreaterThanOrEqual(result.scores[1].totalScore);
    expect(result.scores[1].totalScore).toBeGreaterThanOrEqual(result.scores[2].totalScore);
  });

  it('returns cached scores + fromCache=true when hash matches', async () => {
    mockRunCypher
      .mockResolvedValueOnce([cypherElement({ id: 'a', name: 'A', type: 'application_component', layer: 'application', riskLevel: 'high', maturityLevel: 2 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const cachedAt = new Date('2026-01-01T00:00:00Z');
    mockGetCachedScores.mockResolvedValueOnce({
      scores: [{ elementId: 'cached', name: 'Cached', type: 't', layer: 'application', totalScore: 99, factors: {}, dominantFactor: null }],
      weights: {},
      computedAt: cachedAt,
    });
    const result = await runCriticalityForProject(PROJECT_ID);
    expect(result.fromCache).toBe(true);
    expect(result.scores).toHaveLength(1);
    expect(result.scores[0].elementId).toBe('cached');
    expect(result.computedAt).toEqual(cachedAt);
    expect(mockSaveCachedScores).not.toHaveBeenCalled();
  });

  it('forceRefresh=true bypasses cache and persists full set', async () => {
    mockRunCypher
      .mockResolvedValueOnce([cypherElement({ id: 'a', name: 'A', type: 'application_component', layer: 'application', riskLevel: 'high', maturityLevel: 2 })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockGetCachedScores.mockResolvedValue({
      scores: [{ elementId: 'stale', name: '', type: '', layer: '', totalScore: 0, factors: {}, dominantFactor: null }],
      weights: {},
      computedAt: new Date(),
    });
    const result = await runCriticalityForProject(PROJECT_ID, { forceRefresh: true });
    expect(result.fromCache).toBe(false);
    expect(result.scores[0].elementId).toBe('a');
    expect(mockSaveCachedScores).toHaveBeenCalledTimes(1);
  });

  it('returns gracefully when cycle Cypher query rejects', async () => {
    mockRunCypher
      .mockResolvedValueOnce([cypherElement({ id: 'a', name: 'A', type: 'application_component', layer: 'application', riskLevel: 'high', maturityLevel: 2 })])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('cycle timeout'));
    const result = await runCriticalityForProject(PROJECT_ID);
    expect(result.scores).toHaveLength(1);
    expect(result.fromCache).toBe(false);
  });
});
