/**
 * governedRetrieval traced-wrapper tests (THE-423 Task 4 / AC-2).
 *
 * The three traced wrappers (`tracedResolveGovernedRegulations`, `tracedGovernedQuery`,
 * `tracedGovernedCorpusSearch`) call the underlying governedRetrieval function, build a
 * `consumed[]` array from the returned hits, persist a ContextTrace via
 * `recordContextTrace`, and return `{data, contextTraceId}`. Uses the mongodb-memory-server
 * harness (mirrors contextTrace.service.test.ts) so `recordContextTrace` actually writes,
 * plus the existing `dataServer.service`/`corpusVectorSearch.service`/corpusClient mocking
 * seams used by the sibling governedRetrieval test suites.
 */
jest.mock('../services/dataServer.service', () => ({
  queryDocuments: jest.fn(),
}));
const mockRaw = jest.fn();
jest.mock('../services/corpusVectorSearch.service', () => ({
  corpusVectorSearch: (...a: unknown[]) => mockRaw(...a),
}));

import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContextTrace } from '../models/ContextTrace';
import {
  tracedResolveGovernedRegulations,
  tracedGovernedQuery,
  tracedGovernedCorpusSearch,
  resetGovernedStats,
} from '../services/governedRetrieval.service';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

/** Build a QueryChunk with sane defaults; override `metadata`/`text`/`score` per test. */
function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'BODY', score: 0.9, ...overrides };
}

describe('governedRetrieval traced wrappers (THE-423 Task 4)', () => {
  let mongoServer: MongoMemoryServer;
  const originalContext = process.env.CONTEXT_TRACING_ENABLED;
  let projectId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    process.env.CONTEXT_TRACING_ENABLED = 'true';
    projectId = new Types.ObjectId().toString();
    resetGovernedStats();
    mockQuery.mockReset();
    mockRaw.mockReset();
    __setCorpusForTests(
      makeFakeCorpus([
        { regulationKey: 'gdpr:art-30', versionHash: 'h1', version: 1, fullText: 'OLD' },
        { regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 2, fullText: 'NEW' },
      ]),
    );
  });

  afterEach(async () => {
    await ContextTrace.deleteMany({});
    __setCorpusForTests(null);
    if (originalContext === undefined) delete process.env.CONTEXT_TRACING_ENABLED;
    else process.env.CONTEXT_TRACING_ENABLED = originalContext;
  });

  describe('tracedResolveGovernedRegulations', () => {
    it('records consumed set with retrievalMethod:direct and no score', async () => {
      const { views, contextTraceId } = await tracedResolveGovernedRegulations({
        keys: ['gdpr:art-30'],
        projectId,
        feature: 'reqgen',
      });
      expect(views).toHaveLength(1);
      expect(views[0].versionHash).toBe('h2');

      const t = await ContextTrace.findOne({ requestId: contextTraceId });
      expect(t).not.toBeNull();
      expect(t!.feature).toBe('reqgen');
      expect(t!.consumed).toHaveLength(1);
      expect(t!.consumed[0].regulationKey).toBe('gdpr:art-30');
      expect(t!.consumed[0].versionHash).toBe('h2');
      expect(t!.consumed[0].retrievalMethod).toBe('direct');
      expect(t!.consumed[0].score).toBeUndefined();
    });
  });

  describe('tracedGovernedQuery', () => {
    it('records consumed set from kept law chunks with retrievalMethod:dense and score', async () => {
      mockQuery.mockResolvedValue({
        chunks: [
          chunk({ chunkId: 'a', text: 'current', score: 0.87, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
        ],
      });
      const { result, contextTraceId } = await tracedGovernedQuery({
        projectId,
        text: 'records of processing',
        feature: 'rag-query',
      });
      expect(result.chunks).toHaveLength(1);

      const t = await ContextTrace.findOne({ requestId: contextTraceId });
      expect(t).not.toBeNull();
      expect(t!.consumed).toHaveLength(1);
      expect(t!.consumed[0]).toMatchObject({
        regulationKey: 'gdpr:art-30',
        versionHash: 'h2',
        score: 0.87,
        retrievalMethod: 'dense',
      });
    });

    it('filters non-law chunks lacking key/hash from governedQuery consumed set', async () => {
      mockQuery.mockResolvedValue({
        chunks: [
          chunk({ chunkId: 'law', text: 'current', score: 0.9, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
          chunk({ chunkId: 'upload', text: 'internal doc', score: 0.8, metadata: { documentTitle: 'notes' } }),
        ],
      });
      const { result, contextTraceId } = await tracedGovernedQuery({
        projectId,
        text: 'x',
        feature: 'rag-query',
      });
      // both chunks pass through governedQuery (non-law untouched)
      expect(result.chunks).toHaveLength(2);

      const t = await ContextTrace.findOne({ requestId: contextTraceId });
      expect(t!.consumed).toHaveLength(1);
      expect(t!.consumed[0].regulationKey).toBe('gdpr:art-30');
    });
  });

  describe('tracedGovernedCorpusSearch', () => {
    it('records consumed set from corpus hits', async () => {
      mockRaw.mockResolvedValue([
        { regulationKey: 'gdpr:art-30', versionHash: 'h2', source: 'gdpr', paragraphNumber: 'art-30', title: 't', jurisdiction: 'EU', language: 'en', score: 0.75 },
      ]);

      const { hits, contextTraceId } = await tracedGovernedCorpusSearch({
        projectId,
        text: 'x',
        topK: 5,
        feature: 'discovery',
      });
      const t = await ContextTrace.findOne({ requestId: contextTraceId });
      expect(t!.consumed.map(c => c.regulationKey)).toEqual(hits.map(h => h.regulationKey));
      expect(t!.consumed[0].retrievalMethod).toBe('dense');
      expect(t!.consumed[0].score).toBe(0.75);
    });
  });
});
