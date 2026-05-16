/**
 * REQ-RED-001 — Redundancies endpoint Supertest
 *
 * Covers GET /api/projects/:projectId/redundancies
 *
 * Coverage:
 *   1. Happy path — returns pair list with enriched names + scanned counter
 *   2. type-Filter narrows the input set before service call
 *   3. Default type filter = data-* (data_object/data_entity/data_model)
 *   4. scoreThreshold / topK / limit pass through to service
 *   5. sameTypeOnly='false' is forwarded
 *   6. Validation: scoreThreshold > 1 -> 400
 *   7. Empty project (no elements) -> empty pair list, scanned=0
 *   8. Service throws -> 500
 *
 * Run: cd packages/server && npx jest src/__tests__/architecture.routes.redundancies.test.ts --forceExit
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
jest.mock('../middleware/rateLimit.middleware', () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
  serializeNeo4jProperties: (p: Record<string, unknown>) => p,
}));

const mockFindRedundancies = jest.fn();
const mockFindSimilar = jest.fn();
const mockUpsertEmbedding = jest.fn().mockResolvedValue(undefined);
const mockDeleteEmbedding = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/elementSimilarity.service', () => ({
  findRedundancies: (...args: unknown[]) => mockFindRedundancies(...args),
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

// Helper: build a "Neo4j record" with a .get(key) method that the route
// uses to read element properties.
const cypherRecord = (props: Record<string, string>) => ({
  get: (k: string) => props[k] ?? null,
});

const sampleElements = [
  { id: 'e1', name: 'Customer-Master', type: 'data_object', layer: 'information' },
  { id: 'e2', name: 'Customer Records', type: 'data_object', layer: 'information' },
  { id: 'e3', name: 'Order-Stream', type: 'data_object', layer: 'information' },
  { id: 'cap1', name: 'CRM-Capability', type: 'business_capability', layer: 'strategy' },
];

beforeEach(() => {
  mockRunCypher.mockReset();
  mockFindRedundancies.mockReset();
  mockRunCypher.mockResolvedValue(sampleElements.map(cypherRecord));
  mockFindRedundancies.mockResolvedValue([]);
});

describe('GET /:projectId/redundancies (REQ-RED-001)', () => {
  it('1. happy path — returns enriched pair list', async () => {
    mockFindRedundancies.mockResolvedValueOnce([
      {
        aId: 'e1', aName: '', aType: 'data_object', aLayer: '',
        bId: 'e2', bName: 'Customer Records', bType: 'data_object', bLayer: 'information',
        score: 0.91, tier: 'same',
      },
    ]);

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/redundancies`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pairs).toHaveLength(1);

    const pair = res.body.data.pairs[0];
    // Both names enriched from the Neo4j fetch — even the one the service left empty
    expect(pair.aName).toBe('Customer-Master');
    expect(pair.bName).toBe('Customer Records');
    expect(pair.score).toBe(0.91);
    expect(pair.tier).toBe('same');
  });

  it('2. explicit type-filter narrows the input set passed to the service', async () => {
    await request(app)
      .get(`/api/projects/${PROJECT_ID}/redundancies`)
      .query({ type: 'business_capability' });

    expect(mockFindRedundancies).toHaveBeenCalledTimes(1);
    const [, scannedElements] = mockFindRedundancies.mock.calls[0];
    // Only cap1 (business_capability) passed through
    expect(scannedElements).toEqual([{ id: 'cap1', type: 'business_capability' }]);
  });

  it('3. default type-filter is data-* (3 element types)', async () => {
    await request(app).get(`/api/projects/${PROJECT_ID}/redundancies`);

    const [, scannedElements] = mockFindRedundancies.mock.calls[0];
    // 3 data_object elements, cap1 dropped
    expect(scannedElements.map((e: { id: string }) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });

  it('4. scoreThreshold / topK / limit pass through to service opts', async () => {
    await request(app)
      .get(`/api/projects/${PROJECT_ID}/redundancies`)
      .query({ scoreThreshold: '0.8', topK: '10', limit: '25' });

    const [, , opts] = mockFindRedundancies.mock.calls[0];
    expect(opts.scoreThreshold).toBe(0.8);
    expect(opts.topK).toBe(10);
    expect(opts.limit).toBe(25);
  });

  it('5. sameTypeOnly=false is forwarded as boolean false', async () => {
    await request(app)
      .get(`/api/projects/${PROJECT_ID}/redundancies`)
      .query({ sameTypeOnly: 'false' });

    const [, , opts] = mockFindRedundancies.mock.calls[0];
    expect(opts.sameTypeOnly).toBe(false);
  });

  it('5b. sameTypeOnly default is true', async () => {
    await request(app).get(`/api/projects/${PROJECT_ID}/redundancies`);
    const [, , opts] = mockFindRedundancies.mock.calls[0];
    expect(opts.sameTypeOnly).toBe(true);
  });

  it('6. validation: scoreThreshold > 1 returns 400', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/redundancies`)
      .query({ scoreThreshold: '1.5' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation failed');
  });

  it('6b. validation: topK > 20 returns 400', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/redundancies`)
      .query({ topK: '100' });

    expect(res.status).toBe(400);
  });

  it('7. empty project returns empty pair list', async () => {
    mockRunCypher.mockResolvedValueOnce([]);

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/redundancies`);

    expect(res.status).toBe(200);
    expect(res.body.data.pairs).toEqual([]);
    expect(res.body.data.scanned).toBe(0);
    expect(res.body.data.totalElements).toBe(0);
  });

  it('8. service throws -> 500 with generic error message', async () => {
    mockFindRedundancies.mockRejectedValueOnce(new Error('qdrant down'));

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/redundancies`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Failed to detect redundancies');
  });

  it('reports totalElements and scanned separately (data filter vs full set)', async () => {
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/redundancies`);

    expect(res.body.data.totalElements).toBe(4); // 4 elements in project
    expect(res.body.data.scanned).toBe(3); // 3 passed data-* filter
  });

  // ─── REQ-RED-002 — Cross-Type Mode ─────────────────────────────────────

  describe('cross-type mode (sameTypeOnly=false)', () => {
    it('cross-type scans the full element set, not just data-*', async () => {
      await request(app)
        .get(`/api/projects/${PROJECT_ID}/redundancies`)
        .query({ sameTypeOnly: 'false' });

      const [, scannedElements] = mockFindRedundancies.mock.calls[0];
      // ALL 4 elements (3 data-* + 1 capability)
      expect(scannedElements).toHaveLength(4);
      expect(scannedElements.map((e: { id: string }) => e.id).sort()).toEqual(
        ['cap1', 'e1', 'e2', 'e3'],
      );
    });

    it('cross-type bumps default threshold to 0.7 (precision over recall)', async () => {
      await request(app)
        .get(`/api/projects/${PROJECT_ID}/redundancies`)
        .query({ sameTypeOnly: 'false' });

      const [, , opts] = mockFindRedundancies.mock.calls[0];
      expect(opts.scoreThreshold).toBe(0.7);
      expect(opts.sameTypeOnly).toBe(false);
    });

    it('cross-type respects explicit scoreThreshold over the 0.7 default', async () => {
      await request(app)
        .get(`/api/projects/${PROJECT_ID}/redundancies`)
        .query({ sameTypeOnly: 'false', scoreThreshold: '0.5' });

      const [, , opts] = mockFindRedundancies.mock.calls[0];
      expect(opts.scoreThreshold).toBe(0.5);
    });

    it('explicit type filter still wins in cross-type mode (advanced query)', async () => {
      await request(app)
        .get(`/api/projects/${PROJECT_ID}/redundancies`)
        .query({ sameTypeOnly: 'false', type: 'business_capability' });

      const [, scannedElements] = mockFindRedundancies.mock.calls[0];
      // Only the explicit type, even in cross-type mode
      expect(scannedElements).toEqual([{ id: 'cap1', type: 'business_capability' }]);
    });
  });
});
