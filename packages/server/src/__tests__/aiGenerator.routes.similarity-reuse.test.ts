/**
 * REQ-SIM-004 Stage 2 — V2 Similarity-Based Reuse Tier Logic
 *
 * Verifies the dedup-by-similarity behavior the data-object generator
 * uses in place of (or in addition to) V1's exact-name match:
 *
 *   Tier 1 — V1 exact-name match           → silent reuse, via='exact-name'
 *   Tier 2a — similarity score ≥ 0.85      → silent reuse, via='similarity'
 *   Tier 2b — similarity score 0.65-0.85   → pending-confirm, NO create
 *   Tier 3  — score < 0.65 / no match      → CREATE new element
 *   findSimilarElements throws             → fall through to CREATE (resilient)
 *   similar match but wrong type           → ignored (type must be data-*)
 *   mixed batch                            → each item handled independently
 *
 * Run: cd packages/server && npx jest src/__tests__/aiGenerator.routes.similarity-reuse.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const TEST_USER_ID = new mongoose.Types.ObjectId();
const PROJECT_ID = 'project-test-id';
const PROCESS_ID = 'process-test-id';

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { _id: TEST_USER_ID, role: 'admin' };
    next();
  },
}));

jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/rateLimit.middleware', () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: any, _res: any, next: any) => next(),
  createAuditEntry: jest.fn().mockResolvedValue(undefined),
}));

// ─── Neo4j: track CREATE calls + V1 exact-name lookup behavior ─────────────

const existingByName = new Map<string, string>(); // V1-existence simulation
const createdElementIds: string[] = [];

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn(async (query: string, params: Record<string, unknown>) => {
    if (query.includes("WHERE e.type IN ['data_object'") && (params as any).name) {
      const existingId = existingByName.get((params as any).name as string);
      if (existingId) {
        return [{ get: (k: string) => (k === 'id' ? existingId : null) }];
      }
      return [];
    }
    if (query.includes('CREATE (e:ArchitectureElement') && (params as any).name) {
      const id = (params as any).id as string;
      createdElementIds.push(id);
      existingByName.set((params as any).name as string, id);
      return [];
    }
    if (query.includes('MERGE (p)-[r:CONNECTS_TO')) {
      return [{ get: () => (params as any).connId }];
    }
    return [];
  }),
}));

// ─── elementSimilarity service: configurable per-test ───────────────────────

const mockFindSimilarElements = jest.fn();
const mockUpsertEmbedding = jest.fn().mockResolvedValue(undefined);

jest.mock('../services/elementSimilarity.service', () => ({
  findSimilarElements: (...args: unknown[]) => mockFindSimilarElements(...args),
  upsertEmbedding: (...args: unknown[]) => mockUpsertEmbedding(...args),
  deleteEmbedding: jest.fn(),
}));

// ─── Heavy mocks ────────────────────────────────────────────────────────────

jest.mock('../services/dataObjectGenerator.service', () => ({
  generateDataObjectsForProcess: jest.fn(),
}));
jest.mock('../services/activityGenerator.service', () => ({
  generateActivitiesForProcess: jest.fn(),
}));
jest.mock('../services/processGenerator.service', () => ({
  generateProcessesForCapability: jest.fn(),
}));
jest.mock('../services/architectureGenerator.service', () => ({
  extractArchitectureFromDocument: jest.fn(),
}));
jest.mock('../services/document-parser.service', () => ({
  extractText: jest.fn(),
  isSupportedDocument: jest.fn(),
  getSupportedFormats: jest.fn(() => []),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const aiGeneratorRouter = require('../routes/aiGenerator.routes').default;

const app = express();
app.use(express.json());
app.use('/api/ai-generator', aiGeneratorRouter);

const flushMicrotasks = () => new Promise<void>((r) => setImmediate(r));

beforeEach(() => {
  existingByName.clear();
  createdElementIds.length = 0;
  mockFindSimilarElements.mockReset();
  mockUpsertEmbedding.mockClear();
  // Default: no similar matches (Tier 3 — create)
  mockFindSimilarElements.mockResolvedValue({ results: [], confidence: 'low', topGap: 0 });
});

const sampleDataObject = (overrides: Record<string, unknown> = {}) => ({
  name: 'Emissions-Record',
  description: 'Scope 1/2/3 GHG measurements',
  archimateType: 'data_object',
  crudOperations: 'CRUD',
  sensitivity: 'internal',
  dataClass: 'operational',
  ...overrides,
});

const post = (dataObjects: unknown[]) =>
  request(app)
    .post(`/api/ai-generator/projects/${PROJECT_ID}/processes/${PROCESS_ID}/apply-data-objects`)
    .send({ dataObjects });

// ─── Tier 1 — exact-name (V1) ──────────────────────────────────────────────

describe('Tier 1 — V1 exact-name match', () => {
  it('reuses by exact name without calling findSimilar', async () => {
    existingByName.set('Emissions-Record', 'pre-existing-id-1');

    const res = await post([sampleDataObject()]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataObjectIds).toEqual([]); // nothing newly created
    expect(res.body.reused).toHaveLength(1);
    expect(res.body.reused[0]).toMatchObject({
      originalName: 'Emissions-Record',
      reusedAs: 'pre-existing-id-1',
      via: 'exact-name',
    });
    expect(res.body.pendingConfirm).toEqual([]);
    // V1 is the cheap fast path — V2 must not even be called
    expect(mockFindSimilarElements).not.toHaveBeenCalled();
    expect(mockUpsertEmbedding).not.toHaveBeenCalled();
  });
});

// ─── Tier 2a — similarity SAME (≥0.85) ──────────────────────────────────────

describe('Tier 2a — similarity SAME tier auto-reuses silently', () => {
  it('reuses the top similar element when score >= 0.85', async () => {
    mockFindSimilarElements.mockResolvedValueOnce({
      results: [
        { elementId: 'sim-id-1', name: 'GHG-Record', type: 'data_object',
          layer: 'information', projectId: PROJECT_ID, score: 0.91, tier: 'same' },
      ],
      confidence: 'high',
      topGap: 0.1,
    });

    const res = await post([sampleDataObject()]);

    expect(res.status).toBe(200);
    expect(res.body.dataObjectIds).toEqual([]); // no create
    expect(res.body.reused).toHaveLength(1);
    expect(res.body.reused[0]).toMatchObject({
      reusedAs: 'sim-id-1',
      via: 'similarity',
      score: 0.91,
    });
    expect(res.body.pendingConfirm).toEqual([]);
    expect(mockUpsertEmbedding).not.toHaveBeenCalled();
  });

  it('uses name + description in the similarity query', async () => {
    mockFindSimilarElements.mockResolvedValueOnce({
      results: [{ elementId: 'x', name: 'X', type: 'data_object',
        layer: 'information', projectId: PROJECT_ID, score: 0.95, tier: 'same' }],
      confidence: 'high', topGap: 0,
    });

    await post([sampleDataObject({ name: 'Foo', description: 'Bar-Desc' })]);

    expect(mockFindSimilarElements).toHaveBeenCalledTimes(1);
    const [ws, opts] = mockFindSimilarElements.mock.calls[0];
    expect(ws).toBe(PROJECT_ID);
    expect(opts.text).toBe('Foo — Bar-Desc');
    expect(opts.scoreThreshold).toBe(0.65);
  });
});

// ─── Tier 2b — similarity SIMILAR (0.65-0.85) → pending-confirm ─────────────

describe('Tier 2b — similarity SIMILAR tier emits pendingConfirm', () => {
  it('puts the item into pendingConfirm without creating element or connection', async () => {
    mockFindSimilarElements.mockResolvedValueOnce({
      results: [
        { elementId: 'sim-id-2', name: 'GHG-Inventory', type: 'data_object',
          layer: 'information', projectId: PROJECT_ID, score: 0.72, tier: 'similar' },
      ],
      confidence: 'high',
      topGap: 0.05,
    });

    const res = await post([sampleDataObject()]);

    expect(res.status).toBe(200);
    expect(res.body.dataObjectIds).toEqual([]);
    expect(res.body.reused).toEqual([]);
    expect(res.body.pendingConfirm).toHaveLength(1);
    expect(res.body.pendingConfirm[0]).toMatchObject({
      originalIndex: 0,
      original: { name: 'Emissions-Record' },
      suggestion: { elementId: 'sim-id-2', score: 0.72 },
    });
    expect(createdElementIds).toHaveLength(0);
  });
});

// ─── Tier 3 — UNIQUE → CREATE ───────────────────────────────────────────────

describe('Tier 3 — no match creates a new element', () => {
  it('creates when findSimilar returns no results', async () => {
    // beforeEach default already returns empty results
    const res = await post([sampleDataObject({ name: 'BrandNew-DataObj' })]);

    expect(res.status).toBe(200);
    expect(res.body.dataObjectIds).toHaveLength(1);
    expect(res.body.reused).toEqual([]);
    expect(res.body.pendingConfirm).toEqual([]);
    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
  });
});

// ─── Resilience: findSimilar throws → CREATE ───────────────────────────────

describe('Resilience: findSimilar failure does not block creation', () => {
  it('falls through to CREATE when the embedding stack is unavailable', async () => {
    mockFindSimilarElements.mockRejectedValueOnce(new Error('sidecar timeout'));

    const res = await post([sampleDataObject({ name: 'WhileSidecarDown' })]);

    expect(res.status).toBe(200);
    expect(res.body.dataObjectIds).toHaveLength(1);
    expect(res.body.reused).toEqual([]);
    expect(res.body.pendingConfirm).toEqual([]);
  });
});

// ─── Type safety: SIMILAR but wrong type ────────────────────────────────────

describe('Type filter: only data-* types are considered for reuse', () => {
  it('ignores a high-scoring match if its type is not data_*', async () => {
    mockFindSimilarElements.mockResolvedValueOnce({
      results: [
        // perfect score but wrong type — must NOT trigger reuse
        { elementId: 'process-id', name: 'Some Process', type: 'business_process',
          layer: 'business', projectId: PROJECT_ID, score: 0.99, tier: 'same' },
      ],
      confidence: 'high',
      topGap: 0,
    });

    const res = await post([sampleDataObject({ name: 'NewDO' })]);

    expect(res.status).toBe(200);
    // No reuse: top match was a process, not a data-*. Must create.
    expect(res.body.reused).toEqual([]);
    expect(res.body.pendingConfirm).toEqual([]);
    expect(res.body.dataObjectIds).toHaveLength(1);
  });
});

// ─── Mixed batch: each item routed independently ───────────────────────────

describe('Mixed batch: items take different tiers in a single request', () => {
  it('handles one reused, one pending-confirm, and one new in a single call', async () => {
    existingByName.set('AlreadyHere', 'pre-existing-id');

    // findSimilar will be called 0× for the first (V1 hit), 1× for the second
    // (SIMILAR tier), 1× for the third (no match → create).
    mockFindSimilarElements
      .mockResolvedValueOnce({
        results: [{ elementId: 'similar-id', name: 'Close Match',
          type: 'data_object', layer: 'information', projectId: PROJECT_ID,
          score: 0.72, tier: 'similar' }],
        confidence: 'high', topGap: 0,
      })
      .mockResolvedValueOnce({ results: [], confidence: 'low', topGap: 0 });

    const res = await post([
      sampleDataObject({ name: 'AlreadyHere' }),          // Tier 1 V1-exact
      sampleDataObject({ name: 'Maybe-Similar' }),         // Tier 2b SIMILAR
      sampleDataObject({ name: 'Fresh' }),                 // Tier 3 CREATE
    ]);

    expect(res.status).toBe(200);
    expect(res.body.dataObjectIds).toHaveLength(1);  // only 'Fresh' created
    expect(res.body.reused).toHaveLength(1);
    expect(res.body.reused[0].originalName).toBe('AlreadyHere');
    expect(res.body.reused[0].via).toBe('exact-name');
    expect(res.body.pendingConfirm).toHaveLength(1);
    expect(res.body.pendingConfirm[0].original.name).toBe('Maybe-Similar');
    expect(res.body.count).toBe(1); // count = dataObjectIds.length

    // V1 hit short-circuited findSimilar for #0, so only 2 calls expected
    expect(mockFindSimilarElements).toHaveBeenCalledTimes(2);
    // Only 1 upsertEmbedding fired (only 'Fresh' was created)
    await flushMicrotasks();
    expect(mockUpsertEmbedding).toHaveBeenCalledTimes(1);
  });
});
