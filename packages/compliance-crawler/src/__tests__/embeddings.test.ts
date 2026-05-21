/**
 * Embeddings Tests — REQ-ICM-001.3 / THE-277
 *
 * Covers:
 *   - sidecar.ts: embedText success / error / dim-mismatch / health
 *   - qdrant.ts:  collection naming, ID hashing, ensureCollection logic (mocked client)
 *   - index.ts:   regulationToEmbeddingText, isEmbeddingConfigured
 *
 * Run: cd packages/compliance-crawler && npx jest src/__tests__/embeddings.test.ts --verbose
 */

import { embedText, checkSidecarHealth, EmbeddingSidecarError, EMBEDDING_DIM } from '../embeddings/sidecar';
import {
  regulationCollectionName,
  regulationIdToPointId,
  QdrantConfigError,
  ensureRegulationCollection,
  upsertRegulationVector,
} from '../embeddings/qdrant';
import { regulationToEmbeddingText, isEmbeddingConfigured } from '../embeddings';

// ──────────────────────────────────────────────────────────
// sidecar.ts
// ──────────────────────────────────────────────────────────

describe('sidecar.embedText() (REQ-ICM-001.3)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns 768-dim vector on successful call', async () => {
    const vector = new Array(EMBEDDING_DIM).fill(0.1);
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ vector, dim: 768, model: 'all-mpnet-base-v2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await embedText('hello world', 'http://sidecar:8001');
    expect(result).toHaveLength(EMBEDDING_DIM);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://sidecar:8001/embed',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('hello world'),
      })
    );
  });

  it('throws EmbeddingSidecarError on HTTP 500', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('Internal error', { status: 500 }));
    await expect(embedText('x', 'http://sidecar:8001')).rejects.toThrow(/500/);
  });

  it('throws EmbeddingSidecarError of correct class on transport failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(embedText('x', 'http://sidecar:8001')).rejects.toBeInstanceOf(EmbeddingSidecarError);
  });

  it('throws EmbeddingSidecarError on dim mismatch', async () => {
    const wrongVector = new Array(100).fill(0.1);
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ vector: wrongVector, dim: 100, model: 'wrong' }), {
        status: 200,
      })
    );
    await expect(embedText('x', 'http://sidecar:8001')).rejects.toThrow(/unexpected embedding dim 100/);
  });

  it('throws EmbeddingSidecarError on network failure', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(embedText('x', 'http://sidecar:8001')).rejects.toThrow(EmbeddingSidecarError);
  });
});

describe('sidecar.checkSidecarHealth()', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns true when /health returns 200', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    expect(await checkSidecarHealth('http://sidecar:8001')).toBe(true);
  });

  it('returns false when /health returns 503', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('down', { status: 503 }));
    expect(await checkSidecarHealth('http://sidecar:8001')).toBe(false);
  });

  it('returns false on network error (no throw)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('timeout'));
    expect(await checkSidecarHealth('http://sidecar:8001')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────
// qdrant.ts — pure functions
// ──────────────────────────────────────────────────────────

describe('regulationCollectionName()', () => {
  it('builds canonical name from valid projectId', () => {
    expect(regulationCollectionName('507f1f77bcf86cd799439011')).toBe(
      'regulations-507f1f77bcf86cd799439011'
    );
  });

  it('accepts hyphenated and underscored IDs', () => {
    expect(regulationCollectionName('proj-abc_123')).toBe('regulations-proj-abc_123');
  });

  it('throws on empty projectId', () => {
    expect(() => regulationCollectionName('')).toThrow(QdrantConfigError);
  });

  it('throws on projectId with only invalid chars', () => {
    expect(() => regulationCollectionName('!@#$%')).toThrow(QdrantConfigError);
  });
});

describe('regulationIdToPointId()', () => {
  it('produces UUID-shaped string', () => {
    const id = regulationIdToPointId('507f1f77bcf86cd799439011');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is deterministic — same input → same output', () => {
    const a = regulationIdToPointId('test-id');
    const b = regulationIdToPointId('test-id');
    expect(a).toBe(b);
  });

  it('different inputs produce different outputs', () => {
    const a = regulationIdToPointId('test-id-1');
    const b = regulationIdToPointId('test-id-2');
    expect(a).not.toBe(b);
  });
});

// ──────────────────────────────────────────────────────────
// qdrant.ts — with mocked QdrantClient
// ──────────────────────────────────────────────────────────

describe('ensureRegulationCollection() + upsertRegulationVector()', () => {
  const projectId = '507f1f77bcf86cd799439011';

  it('does not create collection when it already exists', async () => {
    const mockClient = {
      getCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
      createCollection: jest.fn(),
    } as any;

    const name = await ensureRegulationCollection(mockClient, projectId);
    expect(name).toBe(`regulations-${projectId}`);
    expect(mockClient.getCollection).toHaveBeenCalledWith(`regulations-${projectId}`);
    expect(mockClient.createCollection).not.toHaveBeenCalled();
  });

  it('creates collection with correct vector config when missing', async () => {
    const mockClient = {
      getCollection: jest.fn().mockRejectedValue(new Error('not found')),
      createCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
    } as any;

    await ensureRegulationCollection(mockClient, projectId);
    expect(mockClient.createCollection).toHaveBeenCalledWith(
      `regulations-${projectId}`,
      { vectors: { size: 768, distance: 'Cosine' } }
    );
  });

  it('upsertRegulationVector calls upsert with correct point shape', async () => {
    const mockClient = {
      getCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
      createCollection: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ status: 'completed' }),
    } as any;

    const vector = new Array(768).fill(0.1);
    const payload = {
      regulationId: 'reg-1',
      source: 'nis2',
      paragraphNumber: 'Art. 21',
      title: 'Risk management',
      effectiveFrom: '2024-10-17',
      jurisdiction: 'EU',
      language: 'en',
    };

    await upsertRegulationVector({
      client: mockClient,
      projectId,
      regulationId: 'reg-1',
      vector,
      payload,
    });

    expect(mockClient.upsert).toHaveBeenCalledWith(
      `regulations-${projectId}`,
      expect.objectContaining({
        wait: true,
        points: [
          expect.objectContaining({
            vector,
            payload: expect.objectContaining({ regulationId: 'reg-1' }),
          }),
        ],
      })
    );
    // ID must be UUID-shape
    const [, call] = mockClient.upsert.mock.calls[0];
    expect(call.points[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('upsertRegulationVector throws on dim mismatch', async () => {
    const mockClient = {
      getCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
      upsert: jest.fn(),
    } as any;

    const tooShort = new Array(100).fill(0.1);
    await expect(
      upsertRegulationVector({
        client: mockClient,
        projectId,
        regulationId: 'reg-1',
        vector: tooShort,
        payload: {
          regulationId: 'reg-1',
          source: 'nis2',
          paragraphNumber: 'Art. 21',
          title: 't',
          effectiveFrom: '2024-10-17',
          jurisdiction: 'EU',
          language: 'en',
        },
      })
    ).rejects.toThrow(/dim mismatch/);
    expect(mockClient.upsert).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────
// index.ts — public helpers
// ──────────────────────────────────────────────────────────

describe('regulationToEmbeddingText()', () => {
  it('includes title and fullText', () => {
    const text = regulationToEmbeddingText({
      title: 'Cybersecurity risk management',
      fullText: 'Member States shall ensure that essential and important entities take appropriate measures.',
      summary: undefined,
    } as any);
    expect(text).toContain('Cybersecurity risk management');
    expect(text).toContain('essential and important entities');
  });

  it('includes summary when present', () => {
    const text = regulationToEmbeddingText({
      title: 'T',
      summary: 'Short summary line.',
      fullText: 'Long body text that exceeds fifty characters easily for the validator.',
    } as any);
    expect(text).toContain('Short summary line.');
  });

  it('truncates fullText to 8000 chars', () => {
    const huge = 'A'.repeat(10000);
    const text = regulationToEmbeddingText({
      title: 'T',
      fullText: huge,
    } as any);
    expect(text.length).toBeLessThan(8100); // T + sep + 8000
  });
});

describe('isEmbeddingConfigured()', () => {
  it('returns true when both URLs are set', () => {
    expect(
      isEmbeddingConfigured({ sidecarUrl: 'http://x', qdrantUrl: 'http://y' })
    ).toBe(true);
  });

  it('returns false when sidecarUrl missing', () => {
    expect(isEmbeddingConfigured({ qdrantUrl: 'http://y' })).toBe(false);
  });

  it('returns false when qdrantUrl missing', () => {
    expect(isEmbeddingConfigured({ sidecarUrl: 'http://x' })).toBe(false);
  });

  it('returns false when both missing', () => {
    expect(isEmbeddingConfigured({})).toBe(false);
  });
});
