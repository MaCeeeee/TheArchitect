/**
 * REQ-CRIT-002 — Criticality endpoint Supertest
 *
 * Covers GET /api/projects/:projectId/criticality?topN=N
 *
 * Run: cd packages/server && npx jest src/__tests__/criticality.routes.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  createAuditEntry: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../middleware/rateLimit.middleware', () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

jest.mock('../services/elementSimilarity.service', () => ({
  findRedundancies: jest.fn(),
  findSimilarElements: jest.fn(),
  upsertEmbedding: jest.fn().mockResolvedValue(undefined),
  deleteEmbedding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/policy-evaluation.service', () => ({
  evaluateElementPolicies: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/connectionSuggestion.service', () => ({
  suggestConnectionsForIsolatedElements: jest.fn().mockResolvedValue({ created: 0 }),
}));

jest.mock('../services/redundancyResolution.service', () => ({
  applyRedundancyDecisions: jest.fn(),
  mergeElements: jest.fn(),
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

jest.mock('../models/AuditLog', () => ({
  AuditLog: { create: jest.fn(), countDocuments: jest.fn(), findOne: jest.fn() },
}));

const mockProjectFindById = jest.fn();
const mockProjectUpdateOne = jest.fn();
jest.mock('../models/Project', () => ({
  Project: {
    findById: (...args: unknown[]) => mockProjectFindById(...args),
    updateOne: (...args: unknown[]) => mockProjectUpdateOne(...args),
  },
}));

const mockGetCachedScores = jest.fn();
const mockSaveCachedScores = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/criticalityCache.service', () => ({
  computeInputHash: jest.fn().mockReturnValue('abc123'),
  getCachedScores: (...args: unknown[]) => mockGetCachedScores(...args),
  saveCachedScores: (...args: unknown[]) => mockSaveCachedScores(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const architectureRouter = require('../routes/architecture.routes').default;

const app = express();
app.use(express.json());
app.use('/api/projects', architectureRouter);

const PROJECT_ID = 'project-test-id';

const cypherElement = (props: Record<string, unknown>) => ({
  get: (k: string) => {
    if (k === 'e') return { properties: props };
    return (props as Record<string, unknown>)[k] ?? null;
  },
});

const cypherEdge = (sid: string, tid: string) => ({
  get: (k: string) => (k === 'sid' ? sid : k === 'tid' ? tid : null),
});

const cypherCycleNode = (id: string) => ({
  get: (k: string) => (k === 'nid' ? id : null),
});

const emptyMappings = () => ({ lean: () => Promise.resolve([]) });
const emptyRoadmap = () => ({ sort: () => ({ lean: () => Promise.resolve(null) }) });

describe('REQ-CRIT-002 GET /api/projects/:projectId/criticality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // mockReset clears Once-queues from previous tests
    mockGetCachedScores.mockReset();
    mockSaveCachedScores.mockReset();
    mockMappingFind.mockReturnValue(emptyMappings());
    mockRoadmapFindOne.mockReturnValue(emptyRoadmap());
    mockProjectFindById.mockReturnValue({
      lean: () => Promise.resolve(null),
    });
    mockGetCachedScores.mockResolvedValue(null);
    mockSaveCachedScores.mockResolvedValue(undefined);
  });

  it('1. returns empty scores for project with no elements', async () => {
    mockRunCypher
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality`);
    expect(res.status).toBe(200);
    expect(res.body.scores).toEqual([]);
    expect(res.body.topN).toBe(10);
  });

  it('2. computes scores + sorts DESC + applies topN', async () => {
    const elements = [
      cypherElement({
        id: 'e1',
        name: 'SAP S/4HANA',
        type: 'application_component',
        layer: 'application',
        riskLevel: 'critical',
        maturityLevel: 2,
      }),
      cypherElement({
        id: 'e2',
        name: 'Customer-Vault',
        type: 'data_object',
        layer: 'information',
        riskLevel: 'low',
        maturityLevel: 5,
      }),
      cypherElement({
        id: 'e3',
        name: 'ESG-Reporter Hub',
        type: 'application_service',
        layer: 'application',
        riskLevel: 'high',
        maturityLevel: 3,
      }),
    ];
    const connections = [
      cypherEdge('e2', 'e1'),
      cypherEdge('e3', 'e1'),
      cypherEdge('e3', 'e2'),
    ];
    mockRunCypher
      .mockResolvedValueOnce(elements)
      .mockResolvedValueOnce(connections)
      .mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality?topN=2`);
    expect(res.status).toBe(200);
    expect(res.body.scores).toHaveLength(2);
    expect(res.body.scores[0].totalScore).toBeGreaterThanOrEqual(
      res.body.scores[1].totalScore,
    );
  });

  it('3. caps topN at 50', async () => {
    mockRunCypher
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality?topN=9999`);
    expect(res.status).toBe(200);
    expect(res.body.topN).toBe(50);
  });

  it('4. enforces topN minimum of 1', async () => {
    mockRunCypher
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality?topN=0`);
    expect(res.status).toBe(200);
    expect(res.body.topN).toBe(1);
  });

  it('5. continues gracefully when cycle detection fails', async () => {
    const elements = [
      cypherElement({
        id: 'e1',
        name: 'X',
        type: 'application_component',
        layer: 'application',
        riskLevel: 'high',
        maturityLevel: 2,
      }),
    ];
    mockRunCypher
      .mockResolvedValueOnce(elements)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('cycle query timeout'));
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality`);
    expect(res.status).toBe(200);
    expect(res.body.scores).toBeDefined();
  });

  it('6. honors standardMappings for compliance-gap factor', async () => {
    const elements = [
      cypherElement({
        id: 'e1',
        name: 'GapElement',
        type: 'application_component',
        layer: 'application',
        riskLevel: 'low',
        maturityLevel: 5,
      }),
    ];
    mockRunCypher
      .mockResolvedValueOnce(elements)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockMappingFind.mockReturnValue({
      lean: () => Promise.resolve([
        { elementId: 'e1', status: 'gap' },
        { elementId: 'e1', status: 'gap' },
      ]),
    });
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality`);
    expect(res.status).toBe(200);
    const e1 = res.body.scores.find((s: { elementId: string }) => s.elementId === 'e1');
    expect(e1).toBeDefined();
    expect(e1.factors.complianceGap.raw).toBe(2);
  });

  it('7. uses roadmap wave data for cost-burden factor', async () => {
    const elements = [
      cypherElement({
        id: 'big',
        name: 'BigSpender',
        type: 'application_component',
        layer: 'application',
        riskLevel: 'low',
        maturityLevel: 5,
      }),
    ];
    mockRunCypher
      .mockResolvedValueOnce(elements)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockRoadmapFindOne.mockReturnValue({
      sort: () => ({
        lean: () => Promise.resolve({
          waves: [
            {
              totalCost: 1000000,
              elements: [{ elementId: 'big', cost: 400000 }],
            },
          ],
        }),
      }),
    });
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality`);
    expect(res.status).toBe(200);
    const big = res.body.scores.find((s: { elementId: string }) => s.elementId === 'big');
    expect(big.factors.costBurden.raw).toBeGreaterThan(0);
  });

  it('8b. returns cached scores when hash matches (REQ-CRIT-006)', async () => {
    const elements = [
      cypherElement({
        id: 'e1',
        name: 'CachedX',
        type: 'application_component',
        layer: 'application',
        riskLevel: 'high',
        maturityLevel: 2,
      }),
    ];
    mockRunCypher
      .mockResolvedValueOnce(elements)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockGetCachedScores.mockResolvedValueOnce({
      scores: [
        {
          elementId: 'e1',
          name: 'CachedX',
          type: 'application_component',
          layer: 'application',
          totalScore: 77,
          factors: {},
          dominantFactor: null,
        },
      ],
      weights: {
        spof: 1,
        riskConnectivity: 1,
        maturityFloor: 1,
        complianceGap: 1.5,
        costBurden: 1,
        stakeholderBottleneck: 0.5,
        cycleTangle: 1.5,
      },
      computedAt: new Date('2026-05-20T00:00:00Z'),
    });
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality`);
    expect(res.status).toBe(200);
    expect(res.body.fromCache).toBe(true);
    expect(res.body.scores[0].totalScore).toBe(77);
    // Cache hit means saveCachedScores must NOT be called
    expect(mockSaveCachedScores).not.toHaveBeenCalled();
  });

  it('8c. ?refresh=true forces recompute despite cache hit', async () => {
    const elements = [
      cypherElement({
        id: 'e1',
        name: 'FreshX',
        type: 'application_component',
        layer: 'application',
        riskLevel: 'low',
        maturityLevel: 5,
      }),
    ];
    mockRunCypher
      .mockResolvedValueOnce(elements)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockGetCachedScores.mockResolvedValueOnce({
      scores: [{ elementId: 'stale', name: 'Stale', type: 't', layer: 'l', totalScore: 99, factors: {}, dominantFactor: null }],
      weights: {} as never,
      computedAt: new Date(),
    });
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality?refresh=true`);
    expect(res.status).toBe(200);
    expect(res.body.fromCache).toBe(false);
    expect(mockSaveCachedScores).toHaveBeenCalled();
  });

  it('8. marks cycleTangle when element is in cycleMembers', async () => {
    const elements = [
      cypherElement({
        id: 'inCycle',
        name: 'CycleElement',
        type: 'application_component',
        layer: 'application',
        riskLevel: 'medium',
        maturityLevel: 3,
      }),
      cypherElement({
        id: 'clean',
        name: 'CleanElement',
        type: 'application_service',
        layer: 'application',
        riskLevel: 'low',
        maturityLevel: 5,
      }),
    ];
    mockRunCypher
      .mockResolvedValueOnce(elements)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([cypherCycleNode('inCycle')]);
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality`);
    expect(res.status).toBe(200);
    const c = res.body.scores.find((s: { elementId: string }) => s.elementId === 'inCycle');
    expect(c.factors.cycleTangle.raw).toBe(1);
  });
});

describe('REQ-CRIT-007 Criticality Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('9. GET /settings returns defaults when project has none', async () => {
    mockProjectFindById.mockReturnValue({
      lean: () => Promise.resolve({ _id: PROJECT_ID, settings: {} }),
    });
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/criticality/settings`);
    expect(res.status).toBe(200);
    expect(res.body.topN).toBe(10);
    expect(res.body.weights.spof).toBe(1.0);
    expect(res.body.weights.cycleTangle).toBe(1.5);
  });

  it('10. PATCH /settings persists weights + clamps to [0, 2]', async () => {
    mockProjectFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: PROJECT_ID,
          settings: { criticality: { topN: 20, weights: { spof: 2.0, riskConnectivity: 0, maturityFloor: 1, complianceGap: 1.5, costBurden: 1, stakeholderBottleneck: 0.5, cycleTangle: 1.5 } } },
        }),
    });
    mockProjectUpdateOne.mockResolvedValue({ matchedCount: 1 });
    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/criticality/settings`)
      .send({
        topN: 20,
        weights: { spof: 5.0, riskConnectivity: -1, maturityFloor: 1, complianceGap: 1.5, costBurden: 1, stakeholderBottleneck: 0.5, cycleTangle: 1.5 },
      });
    expect(res.status).toBe(200);
    expect(mockProjectUpdateOne).toHaveBeenCalled();
    const updateCall = mockProjectUpdateOne.mock.calls[0][1];
    expect(updateCall.$set['settings.criticality.topN']).toBe(20);
    expect(updateCall.$set['settings.criticality.weights'].spof).toBe(2.0); // clamped from 5
    expect(updateCall.$set['settings.criticality.weights'].riskConnectivity).toBe(0); // clamped from -1
  });

  it('11. PATCH /settings rejects all-zero weights', async () => {
    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}/criticality/settings`)
      .send({
        weights: { spof: 0, riskConnectivity: 0, maturityFloor: 0, complianceGap: 0, costBurden: 0, stakeholderBottleneck: 0, cycleTangle: 0 },
      });
    expect(res.status).toBe(400);
    expect(mockProjectUpdateOne).not.toHaveBeenCalled();
  });
});
