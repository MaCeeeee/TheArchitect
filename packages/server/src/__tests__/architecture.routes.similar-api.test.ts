/**
 * REQ-SIM-003 — Public Similar-API Supertest
 *
 * Covers POST /api/projects/:projectId/elements/similar
 *
 * Happy paths (5):
 *   1. text query returns ranked results
 *   2. elementId query returns ranked results
 *   3. excludeElementIds is honored
 *   4. topK is honored (clamped to max 50)
 *   5. scoreThreshold passed through to service
 *
 * Error paths (3):
 *   6. missing both text and elementId → 400
 *   7. both text and elementId → 400 (mutually exclusive)
 *   8. service throws "not found in workspace index" → 404 (not 500)
 *
 * Run: cd packages/server && npx jest src/__tests__/architecture.routes.similar-api.test.ts --forceExit
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
}));

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

const mockFindSimilar = jest.fn();
const mockUpsertEmbedding = jest.fn().mockResolvedValue(undefined);
const mockDeleteEmbedding = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/elementSimilarity.service', () => ({
  findSimilarElements: (...args: unknown[]) => mockFindSimilar(...args),
  upsertEmbedding: (...args: unknown[]) => mockUpsertEmbedding(...args),
  deleteEmbedding: (...args: unknown[]) => mockDeleteEmbedding(...args),
}));

jest.mock('../services/policy-evaluation.service', () => ({
  evaluateElementPolicies: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/connectionSuggestion.service', () => ({
  suggestConnectionsForIsolatedElements: jest.fn().mockResolvedValue({ created: 0 }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const architectureRouter = require('../routes/architecture.routes').default;

const app = express();
app.use(express.json());
app.use('/api/projects', architectureRouter);

const PROJECT_ID = 'project-test-id';

const SAMPLE_RESULT = {
  results: [
    {
      elementId: 'el-1',
      name: 'Emissions-Record',
      type: 'data_object',
      layer: 'information',
      projectId: PROJECT_ID,
      score: 0.91,
      tier: 'same' as const,
    },
    {
      elementId: 'el-2',
      name: 'GHG-Accounting',
      type: 'business_process',
      layer: 'business',
      projectId: PROJECT_ID,
      score: 0.72,
      tier: 'similar' as const,
    },
  ],
  confidence: 'high' as const,
  topGap: 0.19,
};

beforeEach(() => {
  mockFindSimilar.mockClear();
  mockFindSimilar.mockResolvedValue(SAMPLE_RESULT);
});

describe('REQ-SIM-003 — POST /elements/similar happy paths', () => {
  it('1. text query returns ranked results', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ text: 'Emissions-Record', scoreThreshold: 0.5 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results).toHaveLength(2);
    expect(res.body.data.results[0].elementId).toBe('el-1');
    expect(res.body.data.confidence).toBe('high');

    expect(mockFindSimilar).toHaveBeenCalledTimes(1);
    const [ws, opts] = mockFindSimilar.mock.calls[0];
    expect(ws).toBe(PROJECT_ID);
    expect(opts.text).toBe('Emissions-Record');
  });

  it('2. elementId query returns ranked results', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ elementId: 'el-source' });

    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(2);
    expect(mockFindSimilar.mock.calls[0][1].elementId).toBe('el-source');
  });

  it('3. excludeElementIds is forwarded to the service', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({
        text: 'q',
        excludeElementIds: ['el-9', 'el-10'],
      });

    expect(res.status).toBe(200);
    expect(mockFindSimilar.mock.calls[0][1].excludeElementIds).toEqual(['el-9', 'el-10']);
  });

  it('4. topK is forwarded (and capped at 50 by Zod)', async () => {
    const ok = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ text: 'q', topK: 25 });
    expect(ok.status).toBe(200);
    expect(mockFindSimilar.mock.calls[0][1].topK).toBe(25);

    const overLimit = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ text: 'q', topK: 1000 });
    expect(overLimit.status).toBe(400);
  });

  it('5. scoreThreshold passed through (including negative values)', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ text: 'q', scoreThreshold: -0.5 });

    expect(res.status).toBe(200);
    expect(mockFindSimilar.mock.calls[0][1].scoreThreshold).toBe(-0.5);
  });
});

describe('REQ-SIM-003 — POST /elements/similar error paths', () => {
  it('6. missing both text and elementId → 400', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ topK: 5 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation failed');
    expect(mockFindSimilar).not.toHaveBeenCalled();
  });

  it('7. both text and elementId → 400 (mutually exclusive)', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ text: 'foo', elementId: 'el-1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(mockFindSimilar).not.toHaveBeenCalled();
  });

  it('8. service throws "not found in workspace index" → 404 (not 500)', async () => {
    mockFindSimilar.mockRejectedValueOnce(
      new Error('element el-missing not found in workspace index'),
    );

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/elements/similar`)
      .send({ elementId: 'el-missing' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('not found in workspace index');
  });
});
