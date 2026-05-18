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
    mockMappingFind.mockReturnValue(emptyMappings());
    mockRoadmapFindOne.mockReturnValue(emptyRoadmap());
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
