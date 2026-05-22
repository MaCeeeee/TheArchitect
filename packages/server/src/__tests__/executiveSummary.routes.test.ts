/**
 * REQ-EXEC-001 — Supertest for GET /api/projects/:projectId/executive-summary.
 *
 * Run: cd packages/server && npx jest src/__tests__/executiveSummary.routes.test.ts --forceExit
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

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
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

const mockProjectFindById = jest.fn();
jest.mock('../models/Project', () => ({
  Project: {
    findById: (...args: unknown[]) => mockProjectFindById(...args),
    updateOne: jest.fn(),
  },
}));

jest.mock('../models/AuditLog', () => ({
  AuditLog: { create: jest.fn(), countDocuments: jest.fn(), findOne: jest.fn() },
}));

const mockBuildExecutiveSummary = jest.fn();
jest.mock('../services/executiveSummary.service', () => ({
  buildExecutiveSummary: (...args: unknown[]) => mockBuildExecutiveSummary(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const architectureRouter = require('../routes/architecture.routes').default;

const app = express();
app.use(express.json());
app.use('/api/projects', architectureRouter);

const PROJECT_ID = 'p-exec-route';

const sampleSummary = {
  projectId: PROJECT_ID,
  generatedAt: '2026-05-22T12:00:00.000Z',
  fromCache: false,
  ceo: {
    headline: { title: 'Transformation on track', subtitle: '60% progress · 16 regulations covered', tone: 'positive' },
    complianceCoverage: { regulationsCrawled: 16, standardMappings: 12, mappingCoveragePct: 50 },
    transformationProgress: { percent: 60, atTarget: 30, total: 50 },
    strategicRisks: { criticalDriverCount: 1, topRiskName: 'EU CSRD' },
    activeInitiatives: { scenarioCount: 3, roadmapStatus: 'completed' },
  },
  cio: {
    headline: { title: '5 architectural hotspots require attention', subtitle: 'Top: Payment Gateway (score 87)', tone: 'critical' },
    criticalHotspots: { count: 5, topName: 'Payment Gateway', topScore: 87 },
    techDebtIndex: { score: 35, immatureElements: 10 },
    spofs: { count: 2, topElement: 'Auth Service' },
    complianceStatus: { regulationsCrawled: 16, mappedElementCount: 12, coveragePct: 50 },
    roadmapHealth: { waves: 4, status: 'completed' },
  },
  cfo: {
    headline: { title: 'Cost profile stable', subtitle: 'Total TCO $2.5M', tone: 'neutral' },
    totalTco: { value: 2_500_000, p10: 1_800_000, p90: 3_600_000 },
    costHotspots: { dominantTier: 2, topElement: 'BigSpender', topElementCost: 800_000 },
    probabilisticCost: { p10: 1_800_000, p50: 2_500_000, p90: 3_600_000 },
    optimizationPotential: { value: 375_000, percentOfTco: 15 },
    investmentHeatmap: { tierCounts: [10, 5, 3, 0] },
  },
};

describe('GET /api/projects/:projectId/executive-summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProjectFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockBuildExecutiveSummary.mockResolvedValue(sampleSummary);
  });

  it('1. returns 200 + full ExecutiveSummary shape', async () => {
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/executive-summary`);
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(PROJECT_ID);
    expect(res.body.ceo).toBeDefined();
    expect(res.body.cio).toBeDefined();
    expect(res.body.cfo).toBeDefined();
    expect(res.body.ceo.headline.tone).toMatch(/positive|warning|critical|neutral/);
    expect(res.body.cio.headline.tone).toMatch(/positive|warning|critical|neutral/);
    expect(res.body.cfo.headline.tone).toMatch(/positive|warning|critical|neutral/);
  });

  it('2. propagates ?fresh=true to the service as forceRefresh', async () => {
    await request(app).get(`/api/projects/${PROJECT_ID}/executive-summary?fresh=true`);
    expect(mockBuildExecutiveSummary).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ forceRefresh: true }),
    );
  });

  it('3. passes per-project criticality weights through', async () => {
    mockProjectFindById.mockReturnValue({
      lean: () => Promise.resolve({
        settings: { criticality: { weights: { spof: 0.5, riskConnectivity: 1.0, maturityFloor: 1.0, complianceGap: 1.5, costBurden: 1.0, stakeholderBottleneck: 0.5, cycleTangle: 1.5 } } },
      }),
    });
    await request(app).get(`/api/projects/${PROJECT_ID}/executive-summary`);
    expect(mockBuildExecutiveSummary).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ weights: expect.objectContaining({ spof: 0.5 }) }),
    );
  });

  it('4. returns 500 with error envelope when aggregator throws', async () => {
    mockBuildExecutiveSummary.mockRejectedValue(new Error('boom'));
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/executive-summary`);
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/executive summary/i);
  });

  it('5. falls back to undefined weights when project has no criticality settings', async () => {
    mockProjectFindById.mockReturnValue({ lean: () => Promise.resolve({ name: 'demo' }) });
    await request(app).get(`/api/projects/${PROJECT_ID}/executive-summary`);
    expect(mockBuildExecutiveSummary).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.objectContaining({ weights: undefined }),
    );
  });
});
