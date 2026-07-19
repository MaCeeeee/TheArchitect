/**
 * rag-query route → ContextTrace wiring — THE-423 Task 11 (DD-6).
 *
 * `POST /api/projects/:projectId/rag/query` reads corpus via the traced wrapper
 * `tracedGovernedQuery(feature:'rag-query')` and returns the result unchanged —
 * this route persists NO output (DD-6), it only threads a `contextTraceId`
 * through the response. Mirrors the mocked-middleware + real-Mongo harness of
 * `requirements.routes.contextTrace.test.ts`, plus the `queryDocuments` /
 * `__setCorpusForTests` seam used by `governedRetrieval.trace.test.ts`.
 *
 * Run: cd packages/server && npx jest src/__tests__/rag.routes.contextTrace.test.ts --verbose
 */
import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContextTrace } from '../models/ContextTrace';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { resetGovernedStats } from '../services/governedRetrieval.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

// ─── Middleware stubs (mirrors requirements.routes.contextTrace.test.ts) ────
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { _id: new mongoose.Types.ObjectId('507f191e810c19729de860ea') };
    next();
  },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

// dataServer.service is the RAG-vector seam — stub it out, no live Data-Server.
jest.mock('../services/dataServer.service', () => ({
  queryDocuments: jest.fn(),
  ingestDocument: jest.fn(),
  health: jest.fn(),
  isConfigured: jest.fn().mockReturnValue(true),
  DataServerNotConfiguredError: class DataServerNotConfiguredError extends Error {},
}));

// Import AFTER mocks
import ragRoutes from '../routes/rag.routes';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

const PROJECT_ID = '507f1f77bcf86cd799439011';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', ragRoutes);
  return app;
}

function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'BODY', score: 0.9, ...overrides };
}

describe('rag-query route → ContextTrace (THE-423 Task 11)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ContextTrace.ensureIndexes();
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.env = originalEnv;
    __setCorpusForTests(null);
  });

  beforeEach(() => {
    process.env = { ...originalEnv, CONTEXT_TRACING_ENABLED: 'true' };
    resetGovernedStats();
    mockQuery.mockReset();
    __setCorpusForTests(
      makeFakeCorpus([
        { regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 2, fullText: 'NEW' },
      ]),
    );
  });

  afterEach(async () => {
    await ContextTrace.deleteMany({});
    __setCorpusForTests(null);
  });

  it('returns contextTraceId in the response and writes a ContextTrace(feature:rag-query)', async () => {
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({
          chunkId: 'a',
          text: 'current',
          score: 0.87,
          metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' },
        }),
      ],
    });

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/rag/query`)
      .send({ text: 'records of processing' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Response shape otherwise unchanged: `data` still carries the QueryResult.
    expect(res.body.data.chunks).toHaveLength(1);
    const contextTraceId: string | undefined = res.body.contextTraceId;
    expect(contextTraceId).toBeDefined();

    const trace = await ContextTrace.findOne({ requestId: contextTraceId });
    expect(trace).not.toBeNull();
    expect(trace!.feature).toBe('rag-query');
    expect(trace!.projectId.toString()).toBe(PROJECT_ID);
    expect(trace!.userId).toBe('507f191e810c19729de860ea');
    expect(trace!.consumed).toHaveLength(1);
    expect(trace!.consumed[0]).toMatchObject({
      regulationKey: 'gdpr:art-30',
      versionHash: 'h2',
      score: 0.87,
      retrievalMethod: 'dense',
    });
  });

  it('still returns a generated contextTraceId when tracing is disabled (no trace persisted)', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    mockQuery.mockResolvedValue({ chunks: [] });

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/rag/query`)
      .send({ text: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.contextTraceId).toBeDefined();
    const traces = await ContextTrace.find({ feature: 'rag-query' });
    expect(traces).toHaveLength(0);
  });
});
