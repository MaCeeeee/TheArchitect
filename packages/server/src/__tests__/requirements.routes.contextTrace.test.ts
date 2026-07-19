/**
 * Requirements confirm route → ContextTrace wiring — THE-423 Task 7.
 *
 * Mirrors the mocked-middleware + real-Mongo harness of requirements.routes.test.ts,
 * but exercises the CORPUS-NORM confirm path so `getPipelineNorm` +
 * `tracedResolveGovernedRegulations` run for real against an injected fake corpus
 * (the same `__setCorpusForTests` seam used by governedRetrieval.service.test.ts).
 * No `AiTrace` exists for reqgen (DD-5) — `llmTraceRef` must stay unset.
 *
 * Run: cd packages/server && npx jest src/__tests__/requirements.routes.contextTrace.test.ts --verbose
 */
import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { ContextTrace } from '../models/ContextTrace';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

// ─── Middleware stubs (mirrors requirements.routes.test.ts) ─────
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { _id: new mongoose.Types.ObjectId('507f191e810c19729de860ea') };
    next();
  },
}));

jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: jest.fn().mockResolvedValue(undefined),
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

// requirementGenerator/complianceElements not exercised on the confirm path,
// but the route module imports them — stub to keep the module graph LLM-free.
jest.mock('../services/complianceElements.service', () => ({
  loadProjectCandidateElements: jest.fn(),
  normalizeElementType: (t: string) => t,
}));
jest.mock('../services/requirementGenerator.service', () => ({
  generateRequirementsFromText: jest.fn(),
  RequirementGeneratorError: class extends Error {},
}));

// Import AFTER mocks
import requirementsRoutes from '../routes/requirements.routes';

const PROJECT_ID = '507f1f77bcf86cd799439011';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', requirementsRoutes);
  return app;
}

describe('Requirements confirm route → ContextTrace (THE-423 Task 7)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ComplianceRequirement.ensureIndexes();
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
    process.env = { ...originalEnv, CONTEXT_TRACING_ENABLED: 'true', CORPUS_MONGODB_URI: 'mongodb://fake-corpus/x' };
    __setCorpusForTests(
      makeFakeCorpus([
        {
          regulationKey: 'lksg:para-6',
          versionHash: 'HASH-LKSG-6-V1',
          version: 1,
          source: 'lksg',
          paragraphNumber: '§ 6',
          title: 'Risikoanalyse',
          fullText: 'Lieferanten müssen einer Risikoanalyse unterzogen werden.',
        },
      ]),
    );
  });

  afterEach(async () => {
    await ComplianceRequirement.deleteMany({});
    await ContextTrace.deleteMany({});
    __setCorpusForTests(null);
  });

  const requirementsPayload = [
    {
      title: 'Risikoanalyse durchführen',
      description: 'Lieferanten müssen einer Risikoanalyse unterzogen werden.',
      priority: 'must' as const,
      linkedElementIds: ['cap-1'],
    },
  ];

  it('stamps contextTraceId on persisted requirements + records ContextTrace(feature:reqgen) with the source norm, llmTraceRef unset', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/requirements`)
      .send({
        normId: 'corpus:lksg',
        sectionEId: 'lksg:para-6',
        sourceParagraph: 'Lieferanten müssen einer Risikoanalyse unterzogen werden.',
        requirements: requirementsPayload,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const contextTraceId: string | undefined = res.body.data[0].contextTraceId;
    expect(contextTraceId).toBeDefined();

    const persisted = await ComplianceRequirement.findOne({
      projectId: new mongoose.Types.ObjectId(PROJECT_ID),
      title: 'Risikoanalyse durchführen',
    });
    expect(persisted!.contextTraceId).toBe(contextTraceId);

    const trace = await ContextTrace.findOne({ requestId: contextTraceId });
    expect(trace).not.toBeNull();
    expect(trace!.feature).toBe('reqgen');
    expect(trace!.consumed).toHaveLength(1);
    expect(trace!.consumed[0]).toMatchObject({
      regulationKey: 'lksg:para-6',
      versionHash: 'HASH-LKSG-6-V1',
      retrievalMethod: 'direct',
    });
    // DD-5: reqgen has no recordAiTrace call anywhere in its flow.
    expect(trace!.llmTraceRef).toBeUndefined();
  });

  it('still persists (no contextTraceId regression) when context-tracing is disabled', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/requirements`)
      .send({
        normId: 'corpus:lksg',
        sectionEId: 'lksg:para-6',
        sourceParagraph: 'Lieferanten müssen einer Risikoanalyse unterzogen werden.',
        requirements: requirementsPayload,
      });

    expect(res.status).toBe(200);
    // recordContextTrace still returns a generated id even when tracing is off.
    expect(res.body.data[0].contextTraceId).toBeDefined();
    const traces = await ContextTrace.find({ feature: 'reqgen' });
    expect(traces).toHaveLength(0);
  });

  it('legacy regulationId confirm path (no corpus norm) still stamps a trace with empty consumed', async () => {
    const { Regulation } = await import('../models/Regulation');
    const reg = await Regulation.create({
      projectId: new mongoose.Types.ObjectId(PROJECT_ID),
      title: 'Custom Regulation',
      fullText: 'a'.repeat(60),
      sourceUrl: 'https://example.org',
      effectiveFrom: new Date('2024-01-01'),
      language: 'de',
      jurisdiction: 'DE',
      source: 'custom',
      paragraphNumber: 'p1',
    });

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/requirements`)
      .send({
        regulationId: reg._id?.toString(),
        sourceParagraph: 'a'.repeat(40),
        requirements: requirementsPayload,
      });

    expect(res.status).toBe(200);
    const contextTraceId: string | undefined = res.body.data[0].contextTraceId;
    expect(contextTraceId).toBeDefined();
    const trace = await ContextTrace.findOne({ requestId: contextTraceId });
    expect(trace).not.toBeNull();
    expect(trace!.consumed).toHaveLength(0);

    await Regulation.deleteMany({});
  });
});
