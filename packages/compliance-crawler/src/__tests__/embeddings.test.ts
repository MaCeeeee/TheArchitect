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
  CORPUS_COLLECTION,
  regulationKeyToPointId,
  QdrantConfigError,
  ensureCorpusCollection,
  upsertRegulationVector,
} from '../embeddings/qdrant';
import { regulationToEmbeddingText, isEmbeddingConfigured } from '../embeddings';
import { buildRegulationKey, computeVersionHash, normaliseParagraph } from '../db/regulationKey';

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

describe('regulationKey + versionHash (ADR-0001)', () => {
  it('builds a stable, project-independent key', () => {
    expect(buildRegulationKey('nis2', 'Art. 23')).toBe('nis2:art-23');
    expect(buildRegulationKey('lksg', '§ 6')).toBe('lksg:6');
    expect(buildRegulationKey('dsgvo', 'Art. 32')).toBe('dsgvo:art-32');
  });

  it('normalises paragraph labels', () => {
    expect(normaliseParagraph('Art. 20')).toBe('art-20');
    expect(normaliseParagraph('§ 9')).toBe('9');
  });

  it('throws when key parts are empty', () => {
    expect(() => buildRegulationKey('', 'Art. 1')).toThrow();
    expect(() => buildRegulationKey('nis2', '!!!')).toThrow();
  });

  it('versionHash is deterministic sha256 hex of fullText', () => {
    const a = computeVersionHash('some legal text');
    const b = computeVersionHash('some legal text');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(computeVersionHash('other text')).not.toBe(a);
  });
});

describe('CORPUS_COLLECTION', () => {
  it('is the single shared corpus collection', () => {
    expect(CORPUS_COLLECTION).toBe('regulations-corpus');
  });
});

describe('regulationKeyToPointId()', () => {
  it('produces UUID-shaped string', () => {
    const id = regulationKeyToPointId('nis2:art-21');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is deterministic — same key → same point id', () => {
    expect(regulationKeyToPointId('nis2:art-21')).toBe(regulationKeyToPointId('nis2:art-21'));
  });

  it('different keys produce different ids', () => {
    expect(regulationKeyToPointId('nis2:art-21')).not.toBe(regulationKeyToPointId('nis2:art-22'));
  });
});

// ──────────────────────────────────────────────────────────
// qdrant.ts — with mocked QdrantClient
// ──────────────────────────────────────────────────────────

describe('ensureCorpusCollection() + upsertRegulationVector()', () => {
  const payload = {
    regulationKey: 'nis2:art-21',
    versionHash: 'a'.repeat(64),
    source: 'nis2',
    paragraphNumber: 'Art. 21',
    title: 'Risk management',
    effectiveFrom: '2024-10-17',
    jurisdiction: 'EU',
    language: 'en',
  };

  it('does not create collection when it already exists', async () => {
    const mockClient = {
      getCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
      createCollection: jest.fn(),
    } as any;

    const name = await ensureCorpusCollection(mockClient);
    expect(name).toBe('regulations-corpus');
    expect(mockClient.getCollection).toHaveBeenCalledWith('regulations-corpus');
    expect(mockClient.createCollection).not.toHaveBeenCalled();
  });

  it('creates collection with correct vector config when missing', async () => {
    const mockClient = {
      getCollection: jest.fn().mockRejectedValue(new Error('not found')),
      createCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
    } as any;

    await ensureCorpusCollection(mockClient);
    expect(mockClient.createCollection).toHaveBeenCalledWith(
      'regulations-corpus',
      { vectors: { size: 768, distance: 'Cosine' } }
    );
  });

  it('upserts into the shared corpus collection keyed by regulationKey', async () => {
    const mockClient = {
      getCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
      createCollection: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ status: 'completed' }),
    } as any;

    const vector = new Array(768).fill(0.1);
    await upsertRegulationVector({ client: mockClient, vector, payload });

    expect(mockClient.upsert).toHaveBeenCalledWith(
      'regulations-corpus',
      expect.objectContaining({
        wait: true,
        points: [
          expect.objectContaining({
            id: regulationKeyToPointId('nis2:art-21'),
            vector,
            payload: expect.objectContaining({
              regulationKey: 'nis2:art-21',
              versionHash: 'a'.repeat(64),
            }),
          }),
        ],
      })
    );
  });

  it('throws on dim mismatch', async () => {
    const mockClient = {
      getCollection: jest.fn().mockResolvedValue({ status: 'ok' }),
      upsert: jest.fn(),
    } as any;

    await expect(
      upsertRegulationVector({ client: mockClient, vector: new Array(100).fill(0.1), payload })
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
