/**
 * REQ-SIM-002 — Similarity Re-Embed Hook Supertest
 *
 * Verifies that the architecture routes' fire-and-forget similarity hooks
 * are wired correctly:
 *
 *   POST /:projectId/elements                  → upsertEmbedding called
 *   PUT  /:projectId/elements/:elementId (name) → upsertEmbedding called
 *   PUT  /:projectId/elements/:elementId (cost) → upsertEmbedding NOT called
 *   DELETE /:projectId/elements/:elementId      → deleteEmbedding called
 *
 * Hooks are fire-and-forget — we await microtasks before assertion so the
 * promise has a chance to run.
 *
 * Run: cd packages/server && npx jest src/__tests__/architecture.routes.similarity-hook.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';

// ─── Stub middleware before route import ────────────────────────────────────

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

// ─── Mock Neo4j ─────────────────────────────────────────────────────────────

const mockRunCypher = jest.fn();
jest.mock('../config/neo4j', () => ({
  runCypher: (...args: unknown[]) => mockRunCypher(...args),
  serializeNeo4jProperties: (props: Record<string, unknown>) => props,
}));

// ─── Mock the similarity service so we can spy on the hook fire ─────────────

const mockUpsertEmbedding = jest.fn().mockResolvedValue(undefined);
const mockDeleteEmbedding = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/elementSimilarity.service', () => ({
  upsertEmbedding: (...args: unknown[]) => mockUpsertEmbedding(...args),
  deleteEmbedding: (...args: unknown[]) => mockDeleteEmbedding(...args),
}));

// ─── Mock policy evaluation + connection suggestion to avoid heavy imports ──

jest.mock('../services/policy-evaluation.service', () => ({
  evaluateElementPolicies: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/connectionSuggestion.service', () => ({
  suggestConnectionsForIsolatedElements: jest.fn().mockResolvedValue({ created: 0 }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const architectureRouter = require('../routes/architecture.routes').default;

// ─── Test app ───────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/api/architecture', architectureRouter);

const PROJECT_ID = 'project-test-id';

/**
 * Helper to flush pending microtasks. The hook fires after res.json(...),
 * so we yield once to let the awaited Promise schedule run.
 */
const flushMicrotasks = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => {
  // mockClear (not mockReset) so the default mockResolvedValue(undefined) survives.
  mockRunCypher.mockClear();
  mockUpsertEmbedding.mockClear();
  mockDeleteEmbedding.mockClear();
});

describe('REQ-SIM-002 — async re-embed hook in architecture.routes', () => {
  it('POST /elements triggers upsertEmbedding with projectId as workspace key', async () => {
    mockRunCypher.mockResolvedValue([]);

    const res = await request(app)
      .post(`/api/architecture/${PROJECT_ID}/elements`)
      .send({
        id: 'el-1',
        name: 'Emissions-Record',
        description: 'Scope 1/2/3 GHG measurements',
        type: 'data_object',
        layer: 'information',
        togafDomain: 'data',
        position3D: { x: 0, y: 0, z: 0 },
      });

    expect(res.status).toBe(201);
    await flushMicrotasks();

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
    const [ws, el] = mockUpsertEmbedding.mock.calls[0];
    expect(ws).toBe(PROJECT_ID);
    expect(el.id).toBe('el-1');
    expect(el.name).toBe('Emissions-Record');
    expect(el.type).toBe('data_object');
    expect(el.layer).toBe('information');
  });

  it('PUT /elements with name change triggers upsertEmbedding (re-fetch then re-embed)', async () => {
    // First call: SET cypher (update). Second call: re-fetch element.
    mockRunCypher
      .mockResolvedValueOnce([]) // SET
      .mockResolvedValueOnce([
        {
          get: () => ({
            properties: {
              id: 'el-1',
              name: 'Emissions-Record-V2',
              description: 'updated',
              type: 'data_object',
              layer: 'information',
            },
          }),
        },
      ]); // RETURN e

    const res = await request(app)
      .put(`/api/architecture/${PROJECT_ID}/elements/el-1`)
      .send({ name: 'Emissions-Record-V2' });

    expect(res.status).toBe(200);
    await flushMicrotasks();
    await flushMicrotasks(); // hook does: runCypher (microtask) → upsertEmbedding

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
    const [ws, el] = mockUpsertEmbedding.mock.calls[0];
    expect(ws).toBe(PROJECT_ID);
    expect(el.name).toBe('Emissions-Record-V2');
    expect(el.type).toBe('data_object');
  });

  it('PUT /elements with only cost-field change does NOT re-embed', async () => {
    mockRunCypher.mockResolvedValue([]);

    const res = await request(app)
      .put(`/api/architecture/${PROJECT_ID}/elements/el-1`)
      .send({ annualCost: 50000 });

    expect(res.status).toBe(200);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockUpsertEmbedding).not.toHaveBeenCalled();
  });

  it('PUT /elements with description change triggers upsertEmbedding', async () => {
    mockRunCypher
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          get: () => ({
            properties: {
              id: 'el-1',
              name: 'Emissions-Record',
              description: 'New description',
              type: 'data_object',
              layer: 'information',
            },
          }),
        },
      ]);

    const res = await request(app)
      .put(`/api/architecture/${PROJECT_ID}/elements/el-1`)
      .send({ description: 'New description' });

    expect(res.status).toBe(200);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
    expect(mockUpsertEmbedding.mock.calls[0][1].description).toBe('New description');
  });

  it('PUT /elements with layer change triggers upsertEmbedding', async () => {
    mockRunCypher
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          get: () => ({
            properties: {
              id: 'el-1',
              name: 'Emissions-Record',
              description: 'desc',
              type: 'data_object',
              layer: 'business',
            },
          }),
        },
      ]);

    const res = await request(app)
      .put(`/api/architecture/${PROJECT_ID}/elements/el-1`)
      .send({ layer: 'business' });

    expect(res.status).toBe(200);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
    expect(mockUpsertEmbedding.mock.calls[0][1].layer).toBe('business');
  });

  it('DELETE /elements triggers deleteEmbedding with projectId as workspace key', async () => {
    mockRunCypher.mockResolvedValue([]);

    const res = await request(app).delete(`/api/architecture/${PROJECT_ID}/elements/el-1`);

    expect(res.status).toBe(200);
    await flushMicrotasks();

    expect(mockDeleteEmbedding).toHaveBeenCalledTimes(1);
    expect(mockDeleteEmbedding.mock.calls[0][0]).toBe(PROJECT_ID);
    expect(mockDeleteEmbedding.mock.calls[0][1]).toBe('el-1');
  });

  it('POST /elements/reindex backfills every element in the project', async () => {
    // First call: MATCH … RETURN e (the listing query). Mock 3 elements.
    mockRunCypher.mockResolvedValueOnce([
      { get: () => ({ properties: { id: 'el-a', name: 'A', type: 'data_object', layer: 'information', description: '' } }) },
      { get: () => ({ properties: { id: 'el-b', name: 'B', type: 'business_process', layer: 'business', description: 'desc-b' } }) },
      { get: () => ({ properties: { id: 'el-c', name: 'C', type: 'application_component', layer: 'application', description: '' } }) },
    ]);

    const res = await request(app)
      .post(`/api/architecture/${PROJECT_ID}/elements/reindex`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.succeeded).toBe(3);
    expect(res.body.data.failed).toBe(0);

    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(3);
    expect(mockUpsertEmbedding.mock.calls[0][1].id).toBe('el-a');
    expect(mockUpsertEmbedding.mock.calls[2][1].id).toBe('el-c');
  });

  it('POST /elements/reindex counts partial failures without aborting', async () => {
    mockRunCypher.mockResolvedValueOnce([
      { get: () => ({ properties: { id: 'el-x', name: 'X', type: 'data_object', layer: 'information', description: '' } }) },
      { get: () => ({ properties: { id: 'el-y', name: 'Y', type: 'data_object', layer: 'information', description: '' } }) },
    ]);
    mockUpsertEmbedding
      .mockRejectedValueOnce(new Error('sidecar down'))
      .mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post(`/api/architecture/${PROJECT_ID}/elements/reindex`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.succeeded).toBe(1);
    expect(res.body.data.failed).toBe(1);
  });

  it('upsertEmbedding rejection does not crash the route or affect response', async () => {
    mockRunCypher.mockResolvedValue([]);
    mockUpsertEmbedding.mockRejectedValueOnce(new Error('sidecar timeout'));

    const res = await request(app)
      .post(`/api/architecture/${PROJECT_ID}/elements`)
      .send({
        id: 'el-2',
        name: 'X',
        description: '',
        type: 'data_object',
        layer: 'information',
        togafDomain: 'data',
        position3D: { x: 0, y: 0, z: 0 },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Give the rejection a tick to settle so it doesn't become an unhandled rejection
    await flushMicrotasks();
  });
});
