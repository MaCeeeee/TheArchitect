/**
 * UC-SIM-001 / REQ-SIM-001 — elementSimilarity.service Unit Tests
 *
 * Tests the foundation service in isolation:
 * - text→embedding-input formatting (lossy on purpose)
 * - score→tier mapping (the PoC-validated boundaries)
 * - workspaceId validation (tenant-isolation tripwire)
 * - findSimilarElements with mocked Qdrant client
 *   - happy path with multiple results
 *   - excludeElementIds (self-exclude when querying by elementId)
 *   - confidence calculation (gap-based)
 *   - workspace-isolation: invalid IDs rejected
 * - upsert/delete error paths
 *
 * Sidecar HTTP is mocked via fetch stubbing.
 *
 * Run: cd packages/server && npx jest src/__tests__/elementSimilarity.service.test.ts --forceExit
 */

// Stub the qdrant client BEFORE importing the service
jest.mock('@qdrant/js-client-rest', () => {
  const mockClient = {
    getCollection: jest.fn(),
    createCollection: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    search: jest.fn(),
    retrieve: jest.fn(),
    getCollections: jest.fn().mockResolvedValue({ collections: [] }),
  };
  return {
    QdrantClient: jest.fn().mockImplementation(() => mockClient),
    __mockClient: mockClient,
  };
});

import {
  elementToEmbeddingText,
  elementIdToPointId,
  scoreTier,
  findSimilarElements,
  upsertEmbedding,
  deleteEmbedding,
  WorkspaceMismatchError,
} from '../services/elementSimilarity.service';

// Reach back into the mocked module to inspect calls
// eslint-disable-next-line @typescript-eslint/no-var-requires
const qdrantMockModule = require('@qdrant/js-client-rest');
const mockQdrant = qdrantMockModule.__mockClient as Record<string, jest.Mock>;

// ─── Sidecar fetch mock ─────────────────────────────────────────────────────

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default sidecar response: 768-dim vector of 0.5s
  fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      vector: new Array(768).fill(0.5),
      dim: 768,
      model: 'sentence-transformers/all-mpnet-base-v2',
    }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ─── elementToEmbeddingText ─────────────────────────────────────────────────

describe('elementToEmbeddingText', () => {
  it('formats name + type + layer prefix without description', () => {
    const text = elementToEmbeddingText({
      id: 'e1',
      name: 'Customer-Master',
      type: 'data_object',
      layer: 'information',
      projectId: 'p1',
    });
    expect(text).toBe('Customer-Master — data_object (information)');
  });

  it('appends description when present', () => {
    const text = elementToEmbeddingText({
      id: 'e1',
      name: 'Customer-Master',
      description: 'Holds PII data',
      type: 'data_object',
      layer: 'information',
      projectId: 'p1',
    });
    expect(text).toBe('Customer-Master — data_object (information). Holds PII data');
  });

  it('truncates description to 400 chars', () => {
    const longDesc = 'x'.repeat(500);
    const text = elementToEmbeddingText({
      id: 'e1',
      name: 'X',
      description: longDesc,
      type: 'data_object',
      layer: 'information',
      projectId: 'p1',
    });
    // 400-char body + the joining ". " + prefix
    const descPart = text.split('. ')[1];
    expect(descPart.length).toBe(400);
  });
});

// ─── scoreTier ──────────────────────────────────────────────────────────────

describe('scoreTier (PoC-validated boundaries)', () => {
  it.each([
    [1.0, 'same'],
    [0.95, 'same'],
    [0.85, 'same'],
    [0.849, 'similar'],
    [0.75, 'similar'],
    [0.65, 'similar'],
    [0.649, 'unique'],
    [0.3, 'unique'],
    [0.0, 'unique'],
    [-0.5, 'unique'],
  ])('score=%s → %s', (score, expected) => {
    expect(scoreTier(score)).toBe(expected);
  });
});

// ─── Workspace-Isolation tripwire ───────────────────────────────────────────

describe('workspaceId validation (REQ-SIM-005 tripwire)', () => {
  it('rejects empty workspaceId on findSimilar', async () => {
    await expect(
      findSimilarElements('', { text: 'foo' }),
    ).rejects.toThrow(WorkspaceMismatchError);
  });

  it('rejects workspaceId with injection characters on findSimilar', async () => {
    await expect(
      findSimilarElements('foo;DROP-COLLECTION', { text: 'q' }),
    ).rejects.toThrow(WorkspaceMismatchError);
  });

  it('rejects workspaceId with path traversal on upsert', async () => {
    await expect(
      upsertEmbedding('../etc', {
        id: 'e',
        name: 'n',
        type: 't',
        layer: 'l',
        projectId: 'p',
      }),
    ).rejects.toThrow(WorkspaceMismatchError);
  });

  it('rejects workspaceId with slashes on delete', async () => {
    await expect(
      deleteEmbedding('foo/bar', 'e'),
    ).rejects.toThrow(WorkspaceMismatchError);
  });

  it('accepts valid Mongo-ObjectId-style workspaceId', async () => {
    mockQdrant.getCollection.mockResolvedValue({});
    mockQdrant.search.mockResolvedValue([]);
    await expect(
      findSimilarElements('69f8f4a2294bc9a462db6288', { text: 'q' }),
    ).resolves.toBeDefined();
  });
});

// ─── findSimilarElements ────────────────────────────────────────────────────

describe('findSimilarElements', () => {
  beforeEach(() => {
    mockQdrant.getCollection.mockResolvedValue({});
  });

  it('returns ranked results with tier mapping', async () => {
    mockQdrant.search.mockResolvedValue([
      {
        id: 'a',
        score: 0.92,
        payload: { elementId: 'a', name: 'A', type: 't', layer: 'business', projectId: 'p' },
      },
      {
        id: 'b',
        score: 0.72,
        payload: { elementId: 'b', name: 'B', type: 't', layer: 'business', projectId: 'p' },
      },
      {
        id: 'c',
        score: 0.55,
        payload: { elementId: 'c', name: 'C', type: 't', layer: 'business', projectId: 'p' },
      },
    ]);

    const res = await findSimilarElements('ws1', { text: 'query' });
    expect(res.results).toHaveLength(3);
    expect(res.results[0].tier).toBe('same');     // 0.92 ≥ 0.85
    expect(res.results[1].tier).toBe('similar');  // 0.65–0.85
    expect(res.results[2].tier).toBe('unique');   // < 0.65 (but still in mock results since threshold not enforced by mock)
  });

  it('excludes the source element when querying by elementId', async () => {
    mockQdrant.retrieve.mockResolvedValue([
      { id: 'self', vector: new Array(768).fill(0.5) },
    ]);
    mockQdrant.search.mockResolvedValue([
      {
        id: 'self',
        score: 1.0,
        payload: { elementId: 'self', name: 'Self', type: 't', layer: 'business', projectId: 'p' },
      },
      {
        id: 'other',
        score: 0.88,
        payload: { elementId: 'other', name: 'Other', type: 't', layer: 'business', projectId: 'p' },
      },
    ]);

    const res = await findSimilarElements('ws1', { elementId: 'self', topK: 5 });
    expect(res.results.map((r) => r.elementId)).not.toContain('self');
    expect(res.results[0].elementId).toBe('other');
  });

  it('respects explicit excludeElementIds', async () => {
    mockQdrant.search.mockResolvedValue([
      { id: 'a', score: 0.9, payload: { elementId: 'a', name: 'A', type: 't', layer: 'l', projectId: 'p' } },
      { id: 'b', score: 0.85, payload: { elementId: 'b', name: 'B', type: 't', layer: 'l', projectId: 'p' } },
    ]);
    const res = await findSimilarElements('ws1', {
      text: 'q',
      excludeElementIds: ['a'],
    });
    expect(res.results.map((r) => r.elementId)).toEqual(['b']);
  });

  it('confidence=high when top↔bottom gap >= 0.05', async () => {
    mockQdrant.search.mockResolvedValue([
      { id: '1', score: 0.95, payload: { elementId: '1', name: '1', type: 't', layer: 'l', projectId: 'p' } },
      { id: '2', score: 0.80, payload: { elementId: '2', name: '2', type: 't', layer: 'l', projectId: 'p' } },
      { id: '3', score: 0.70, payload: { elementId: '3', name: '3', type: 't', layer: 'l', projectId: 'p' } },
    ]);
    const res = await findSimilarElements('ws1', { text: 'q' });
    expect(res.confidence).toBe('high');
    expect(res.topGap).toBeCloseTo(0.25, 2);
  });

  it('confidence=low when top↔bottom gap < 0.05 (the negative-test pattern from PoC)', async () => {
    mockQdrant.search.mockResolvedValue([
      { id: '1', score: 0.22, payload: { elementId: '1', name: '1', type: 't', layer: 'l', projectId: 'p' } },
      { id: '2', score: 0.215, payload: { elementId: '2', name: '2', type: 't', layer: 'l', projectId: 'p' } },
      { id: '3', score: 0.21, payload: { elementId: '3', name: '3', type: 't', layer: 'l', projectId: 'p' } },
    ]);
    const res = await findSimilarElements('ws1', { text: 'q' });
    expect(res.confidence).toBe('low');
    expect(res.topGap).toBeLessThan(0.05);
  });

  it('topK is clamped between 1 and 50', async () => {
    mockQdrant.search.mockResolvedValue([]);
    await findSimilarElements('ws1', { text: 'q', topK: 999 });
    expect(mockQdrant.search).toHaveBeenCalledWith(
      'elements-ws1',
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('throws when neither text nor elementId is given', async () => {
    await expect(findSimilarElements('ws1', {})).rejects.toThrow(
      'requires either text or elementId',
    );
  });
});

// ─── upsertEmbedding ───────────────────────────────────────────────────────

describe('upsertEmbedding', () => {
  it('creates collection if missing then upserts the vector', async () => {
    mockQdrant.getCollection.mockRejectedValueOnce(new Error('not found'));

    await upsertEmbedding('ws1', {
      id: 'e1',
      name: 'Test',
      description: 'Hello',
      type: 'data_object',
      layer: 'information',
      projectId: 'p1',
    });

    expect(mockQdrant.createCollection).toHaveBeenCalledWith(
      'elements-ws1',
      expect.objectContaining({
        vectors: { size: 768, distance: 'Cosine' },
      }),
    );
    expect(mockQdrant.upsert).toHaveBeenCalledWith(
      'elements-ws1',
      expect.objectContaining({
        points: expect.arrayContaining([
          expect.objectContaining({
            id: elementIdToPointId('e1'),
            payload: expect.objectContaining({ elementId: 'e1' }),
          }),
        ]),
      }),
    );
  });
});

// ─── elementIdToPointId ─────────────────────────────────────────────────────

describe('elementIdToPointId', () => {
  it('produces a UUID-shaped string', () => {
    const id = elementIdToPointId('e1');
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  });

  it('is deterministic — same input → same output', () => {
    expect(elementIdToPointId('bp-1778003-act-ai-1')).toBe(
      elementIdToPointId('bp-1778003-act-ai-1'),
    );
  });

  it('different element IDs → different point IDs', () => {
    expect(elementIdToPointId('e1')).not.toBe(elementIdToPointId('e2'));
  });
});

// ─── deleteEmbedding ───────────────────────────────────────────────────────

describe('deleteEmbedding', () => {
  it('calls qdrant.delete with the element-id (hashed)', async () => {
    await deleteEmbedding('ws1', 'e1');
    expect(mockQdrant.delete).toHaveBeenCalledWith(
      'elements-ws1',
      expect.objectContaining({ points: [elementIdToPointId('e1')] }),
    );
  });

  it('swallows errors from missing collection (idempotent)', async () => {
    mockQdrant.delete.mockRejectedValueOnce(new Error('collection not found'));
    await expect(deleteEmbedding('ws1', 'e1')).resolves.not.toThrow();
  });
});
