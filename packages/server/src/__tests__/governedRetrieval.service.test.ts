/**
 * governedRetrieval unit tests (THE-422 / UC-CTXGOV-001 Read-Side, Chunk 1).
 *
 * Structured corpus read: eligibility (non-stale) + version-pin (served from Mongo).
 * Uses the in-memory corpus seam (`__setCorpusForTests` + `makeFakeCorpus`).
 * Corpus keys are `source:paragraph` with a COLON (buildRegulationKey emits e.g. `gdpr:art-30`).
 */
jest.mock('../services/dataServer.service', () => ({
  queryDocuments: jest.fn(),
}));

import {
  resolveGovernedRegulations,
  governedQuery,
  getGovernedStats,
  resetGovernedStats,
} from '../services/governedRetrieval.service';
import { __setCorpusForTests, getCurrentVersionHashes } from '../services/corpusClient.service';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

/** Build a QueryChunk with sane defaults; override `metadata`/`text` per test. */
function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'QDRANT-BODY', score: 0.9, ...overrides };
}

afterEach(() => __setCorpusForTests(null));

describe('getCurrentVersionHashes — max-version-wins (was nondeterministic last-wins)', () => {
  test('returns the max version hash regardless of return order (descending)', async () => {
    __setCorpusForTests(makeFakeCorpus([
      { regulationKey: 'k1', versionHash: 'hB', version: 2 },
      { regulationKey: 'k1', versionHash: 'hA', version: 1 },
    ]));
    const map = await getCurrentVersionHashes(['k1']);
    expect(map.get('k1')).toBe('hB');
  });

  test('returns the max version hash regardless of return order (ascending)', async () => {
    __setCorpusForTests(makeFakeCorpus([
      { regulationKey: 'k1', versionHash: 'hA', version: 1 },
      { regulationKey: 'k1', versionHash: 'hB', version: 2 },
    ]));
    const map = await getCurrentVersionHashes(['k1']);
    expect(map.get('k1')).toBe('hB');
  });
});

describe('resolveGovernedRegulations — pin + eligibility (Chunk 1)', () => {
  beforeEach(() => {
    resetGovernedStats();
    __setCorpusForTests(makeFakeCorpus([
      { regulationKey: 'gdpr:art-30', versionHash: 'h1', version: 1, fullText: 'OLD' },
      { regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 2, fullText: 'NEW' },
    ]));
  });

  test('eligibleOnly (default) returns only the current version', async () => {
    const out = await resolveGovernedRegulations({ keys: ['gdpr:art-30'] });
    expect(out).toHaveLength(1);
    expect(out[0].versionHash).toBe('h2');
    expect(out[0].fullText).toBe('NEW');
  });

  test('explicit pin serves the exact pinned version from Mongo (AC-3)', async () => {
    const out = await resolveGovernedRegulations({
      keys: ['gdpr:art-30'],
      pin: { 'gdpr:art-30': 'h1' },
    });
    expect(out[0].versionHash).toBe('h1');
    expect(out[0].fullText).toBe('OLD');
    expect(getGovernedStats().pinnedServed).toBe(1);
  });

  test('pin to a vanished version drops it + counts staleDropped', async () => {
    const out = await resolveGovernedRegulations({
      keys: ['gdpr:art-30'],
      pin: { 'gdpr:art-30': 'GONE' },
    });
    expect(out).toHaveLength(0);
    expect(getGovernedStats().staleDropped).toBe(1);
  });

  test('duplicated pinned key is deduped — one view, pinnedServed === 1 (minor-2)', async () => {
    const out = await resolveGovernedRegulations({
      keys: ['gdpr:art-30', 'gdpr:art-30'],
      pin: { 'gdpr:art-30': 'h1' },
    });
    expect(out).toHaveLength(1);
    expect(out[0].versionHash).toBe('h1');
    expect(getGovernedStats().pinnedServed).toBe(1);
  });
});

describe('governedQuery — vector-path stale-drop + pin fallback (Chunk 2)', () => {
  beforeEach(() => {
    resetGovernedStats();
    mockQuery.mockReset();
    __setCorpusForTests(makeFakeCorpus([
      { regulationKey: 'gdpr:art-30', versionHash: 'h1', version: 1, fullText: 'OLD' },
      { regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 2, fullText: 'NEW' },
    ]));
  });

  test('drops stale chunks, keeps current, counts staleDropped (AC-2)', async () => {
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'a', metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
        chunk({ chunkId: 'b', metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h1' } }),
        chunk({ chunkId: 'c', metadata: {} }),
      ],
    });
    const res = await governedQuery({ projectId: 'p1', text: 'records of processing' });
    const hashes = res.chunks.map(c => c.metadata.versionHash);
    expect(hashes).toContain('h2');
    expect(hashes).not.toContain('h1');
    expect(getGovernedStats().staleDropped).toBe(1);
  });

  test('pin serves Mongo fullText for pinned key, never the Qdrant chunk (AC-3)', async () => {
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'a', metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
      ],
    });
    const res = await governedQuery({ projectId: 'p1', text: 'x', pin: { 'gdpr:art-30': 'h1' } });
    const pinned = res.chunks.find(c => c.metadata.regulationKey === 'gdpr:art-30');
    expect(pinned?.text).toBe('OLD'); // from Mongo v1, not the Qdrant chunk body
    expect(pinned?.metadata.versionHash).toBe('h1');
    expect(pinned?.metadata.pinned).toBe(true);
    expect(getGovernedStats().pinnedServed).toBe(1);
  });

  test('law chunk with NO versionHash is kept + counted unverifiable (legacy point, AC-5 safety)', async () => {
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'legacy', metadata: { regulationKey: 'gdpr:art-30' } }),
      ],
    });
    const res = await governedQuery({ projectId: 'p1', text: 'records' });
    expect(
      res.chunks.some(
        c => c.metadata.regulationKey === 'gdpr:art-30' && c.metadata.versionHash === undefined,
      ),
    ).toBe(true);
    expect(getGovernedStats().unverifiable).toBeGreaterThanOrEqual(1);
  });

  test('regulation_key / version_hash snake_case fallback is honored', async () => {
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'snake', metadata: { regulation_key: 'gdpr:art-30', version_hash: 'h1' } }),
      ],
    });
    const res = await governedQuery({ projectId: 'p1', text: 'records' });
    expect(res.chunks).toHaveLength(0); // h1 is stale vs current h2
    expect(getGovernedStats().staleDropped).toBe(1);
  });

  test('non-law chunk (no regulationKey) passes through untouched', async () => {
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'current', metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
        chunk({ chunkId: 'upload', text: 'internal doc', metadata: { documentTitle: 'notes' } }),
      ],
    });
    const res = await governedQuery({ projectId: 'p1', text: 'internal doc' });
    expect(res.chunks.some(c => c.metadata.regulationKey === undefined)).toBe(true);
  });
});
