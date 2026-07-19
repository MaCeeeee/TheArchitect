/**
 * Oracle assessment route → ContextTrace(feature:'oracle') wiring — THE-423 Task 10 (AC-4).
 *
 * The Oracle consumes Neo4j architecture context (NOT the governed corpus), so it has
 * no `consumed` refs to record — this test asserts `consumed:[]` and that the oracle's
 * per-agent `_audit` (previously built in-memory and discarded) is now persisted as the
 * ContextTrace's `audit` payload, uncapped (unlike AiTrace's 4000-char rawResponse cap).
 *
 * Mirrors the mocked-middleware + real-Mongo harness of
 * requirements.routes.contextTrace.test.ts. The oracle has no `recordAiTrace` call
 * anywhere (DD-5) — `llmTraceRef` must stay unset.
 *
 * LLM calls are mocked at the `@anthropic-ai/sdk` boundary (provider=anthropic via
 * ANTHROPIC_API_KEY); Neo4j calls are mocked at `../config/neo4j` and
 * `../services/mirofish/agentContextFilter` so the test never touches real infra.
 *
 * Run: cd packages/server && npx jest src/__tests__/oracle.contextTrace.test.ts --verbose
 */
import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { OracleAssessment } from '../models/OracleAssessment';
import { ContextTrace } from '../models/ContextTrace';

// ─── Middleware stubs (mirrors requirements.routes.contextTrace.test.ts) ─────
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      _id: new mongoose.Types.ObjectId('507f191e810c19729de860ea'),
      name: 'Test Architect',
      email: 'architect@example.com',
      role: 'chief_architect',
      emailVerified: true,
    };
    next();
  },
}));

jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

// A very long reasoning string proves the audit trail is NOT truncated
// (ContextTrace.audit.rawResponse has no maxlength, unlike AiTrace's 4000-char cap).
const LONG_REASONING = 'This domain impact analysis is unusually detailed. '.repeat(120); // > 6000 chars

const mockCreate = jest.fn(async (params: any) => {
  const sys = String(params.system || '');
  if (sys.includes('Output Format (STRICT JSON — no markdown, no text outside JSON)')) {
    // Per-agent oracle assessment call
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            domainImpact: 'Loses a legacy tool, gains a modern consolidated platform.',
            position: 'approve',
            reasoning: LONG_REASONING,
            concerns: ['Minor retraining required'],
            acceptanceScore: 72,
          }),
        },
      ],
    };
  }
  // Mitigation-generation call
  return {
    content: [
      { type: 'text', text: JSON.stringify(['Run a stakeholder workshop.', 'Phase the rollout.', 'Assign change champions.']) },
    ],
  };
});

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  serializeNeo4jProperties: jest.fn((p: unknown) => p),
}));

jest.mock('../services/mirofish/agentContextFilter', () => ({
  buildAgentContext: jest.fn().mockResolvedValue('MOCK ARCHITECTURE CONTEXT SUMMARY'),
}));

// Import AFTER mocks
import oracleRoutes from '../routes/oracle.routes';

const PROJECT_ID = '507f1f77bcf86cd799439011';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', oracleRoutes);
  return app;
}

describe('Oracle assess route → ContextTrace (THE-423 Task 10, AC-4)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await OracleAssessment.ensureIndexes();
    await ContextTrace.ensureIndexes();
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.env = originalEnv;
  });

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CONTEXT_TRACING_ENABLED: 'true',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      OPENAI_API_KEY: '',
    };
    mockCreate.mockClear();
  });

  afterEach(async () => {
    await OracleAssessment.deleteMany({});
    await ContextTrace.deleteMany({});
  });

  const proposalPayload = {
    title: 'Consolidate CRM Systems',
    description: 'Consolidate 3 legacy CRM systems into one unified platform.',
    affectedElementIds: ['el-1', 'el-2'],
    changeType: 'consolidate' as const,
    estimatedCost: 250000,
    estimatedDuration: 6,
  };

  it('records ContextTrace(feature:oracle, consumed:[]) with the uncapped multi-agent audit payload and stamps OracleAssessment.contextTraceId', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/oracle/assess`)
      .send(proposalPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const assessmentId: string = res.body.assessmentId;
    expect(assessmentId).toBeDefined();

    const persisted = await OracleAssessment.findById(assessmentId);
    expect(persisted).not.toBeNull();
    expect(persisted!.contextTraceId).toBeDefined();
    expect(typeof persisted!.contextTraceId).toBe('string');

    const trace = await ContextTrace.findOne({ requestId: persisted!.contextTraceId });
    expect(trace).not.toBeNull();
    expect(trace!.feature).toBe('oracle');
    expect(trace!.consumed).toHaveLength(0); // oracle reads Neo4j, not the governed corpus

    // Audit payload carries the (previously discarded) per-agent _audit data, uncapped.
    expect(trace!.audit).toBeDefined();
    expect(trace!.audit!.rawResponse).toBeDefined();
    expect(trace!.audit!.rawResponse!.length).toBeGreaterThan(4000); // AiTrace caps rawResponse at 4000 — this must NOT be truncated
    expect(trace!.audit!.systemPrompt).toBeDefined();
    expect(trace!.audit!.systemPrompt!.length).toBeGreaterThan(0);
    expect(trace!.audit!.architectureContextRef).toBeDefined();
    expect(trace!.audit!.modelParams).toBeDefined();

    // DD-5: oracle has no recordAiTrace call anywhere in its flow.
    expect(trace!.llmTraceRef).toBeUndefined();
  });

  it('still persists the assessment fine (no contextTraceId regression) when context-tracing is disabled', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/oracle/assess`)
      .send(proposalPayload);

    expect(res.status).toBe(200);
    const assessmentId: string = res.body.assessmentId;
    const persisted = await OracleAssessment.findById(assessmentId);
    expect(persisted).not.toBeNull();
    // recordContextTrace still returns a generated id even when tracing is off,
    // so the stamp is present, but nothing was actually persisted to ContextTrace.
    expect(persisted!.contextTraceId).toBeDefined();

    const traces = await ContextTrace.find({ feature: 'oracle' });
    expect(traces).toHaveLength(0);
  });
});
