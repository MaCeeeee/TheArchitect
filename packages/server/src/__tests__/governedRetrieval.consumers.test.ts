/**
 * governedRetrieval consumer-wiring / regression tests (THE-422 / UC-CTXGOV-001, Chunk 3).
 *
 * The 4 RAG generators (activity/process/dataObject/connectionSuggestion) and the
 * `/rag/query` route now fetch context through `governedQuery` instead of the raw
 * `queryDocuments`. These tests pin two guarantees at the gate boundary that every
 * consumer inherits:
 *   1. REGRESSION — with an all-current corpus, the governed result is byte-identical
 *      to the raw `queryDocuments` result (the generators' downstream
 *      score-threshold + slice therefore produce exactly the pre-change context).
 *   2. STALE-DROP — a seeded stale law chunk is excluded from the context.
 * Plus a structural wiring guard that no consumer still calls `queryDocuments` directly.
 *
 * Corpus keys are `source:paragraph` with a COLON (e.g. `gdpr:art-30`).
 */
jest.mock('../services/dataServer.service', () => ({
  queryDocuments: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { governedQuery, getGovernedStats, resetGovernedStats } from '../services/governedRetrieval.service';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

/** Build a QueryChunk with sane defaults; override `metadata`/`text`/`score` per test. */
function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'BODY', score: 0.9, ...overrides };
}

/** Mirror of the generators' post-query context selection (queryRagSafe). */
function selectContext(chunks: QueryChunk[]): string[] {
  return chunks
    .filter(c => c.score >= 0.55)
    .map(c => c.text)
    .slice(0, 5);
}

beforeEach(() => {
  resetGovernedStats();
  mockQuery.mockReset();
  __setCorpusForTests(
    makeFakeCorpus([
      { regulationKey: 'gdpr:art-30', versionHash: 'h1', version: 1, fullText: 'OLD' },
      { regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 2, fullText: 'NEW' },
    ]),
  );
});
afterEach(() => __setCorpusForTests(null));

describe('generator RAG path — regression on all-current corpus', () => {
  test('governedQuery is transparent: current law chunks pass through byte-identical', async () => {
    const raw = {
      chunks: [
        chunk({ chunkId: 'a', text: 'current-A', score: 0.91, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
        chunk({ chunkId: 'b', text: 'current-B', score: 0.72, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
      ],
    };
    mockQuery.mockResolvedValue(raw);
    const res = await governedQuery({ projectId: 'p1', text: 'records of processing', topK: 5 });
    // Identical chunks → identical downstream generator context.
    expect(res.chunks).toEqual(raw.chunks);
    expect(selectContext(res.chunks)).toEqual(['current-A', 'current-B']);
    expect(getGovernedStats().staleDropped).toBe(0);
  });

  test('non-law user-upload chunks pass through untouched (regression)', async () => {
    const raw = {
      chunks: [chunk({ chunkId: 'u', text: 'internal doc', score: 0.8, metadata: { documentTitle: 'notes' } })],
    };
    mockQuery.mockResolvedValue(raw);
    const res = await governedQuery({ projectId: 'p1', text: 'internal doc', topK: 5 });
    expect(res.chunks).toEqual(raw.chunks);
  });
});

describe('generator RAG path — seeded stale chunk is excluded', () => {
  test('stale law chunk (versionHash h1) is dropped from generator context', async () => {
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'cur', text: 'current-text', score: 0.9, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
        chunk({ chunkId: 'stale', text: 'stale-text', score: 0.9, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h1' } }),
      ],
    });
    const res = await governedQuery({ projectId: 'p1', text: 'records', topK: 5 });
    const context = selectContext(res.chunks);
    expect(context).toContain('current-text');
    expect(context).not.toContain('stale-text');
    expect(getGovernedStats().staleDropped).toBe(1);
  });
});

describe('AC-4 wiring guard — consumers route through the gate, not queryDocuments', () => {
  const srcRoot = join(__dirname, '..');
  const consumers = [
    'services/activityGenerator.service.ts',
    'services/connectionSuggestion.service.ts',
    'services/processGenerator.service.ts',
    'services/dataObjectGenerator.service.ts',
    'routes/rag.routes.ts',
  ];

  // THE-423 Task 9: the 4 Neo4j generators (activity/connection/process/dataobject)
  // migrated from `governedQuery` to the traced wrapper `tracedGovernedQuery` — both
  // route through the same gate (`tracedGovernedQuery` calls the underlying, UNCHANGED
  // `governedQuery` internally), so either call-site satisfies this wiring guard.
  test.each(consumers)('%s calls governedQuery (directly or via tracedGovernedQuery) and no longer calls queryDocuments directly', file => {
    const src = readFileSync(join(srcRoot, file), 'utf8');
    expect(src).toMatch(/\b(?:traced)?governedQuery\(/i);
    expect(src).not.toMatch(/\bqueryDocuments\(/);
  });
});
