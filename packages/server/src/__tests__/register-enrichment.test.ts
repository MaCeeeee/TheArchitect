/**
 * THE-448 — LLM enrichment (suggestion-only) + human-confirm problem creation + notify.
 * The LLM client is injected/stubbed; the deterministic engine is exercised with NO LLM too.
 * Run: cd packages/server && npx jest src/__tests__/register-enrichment.test.ts
 */
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mockAudit = jest.fn().mockResolvedValue(undefined);

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: express.Request, _res: unknown, next: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).user = { _id: new mongoose.Types.ObjectId(), role: 'editor' };
    next();
  },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  createAuditEntry: (...args: unknown[]) => mockAudit(...args),
}));
jest.mock('../config/logger', () => ({
  log: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// imported after mocks
import registerRoutes from '../routes/register.routes';
import { RegisterEntry } from '../models/RegisterEntry';
import { ingestEntry, type IngestInput } from '../services/register.service';
import {
  suggestDuplicates,
  suggestProblemClusters,
  type LlmClient,
} from '../services/registerEnrichment.service';
import {
  buildCriticalBlocks,
  deliverBlocks,
} from '../services/opsNotify.service';

const PROJECT_ID = new mongoose.Types.ObjectId().toString();
const ACTOR = { userId: new mongoose.Types.ObjectId().toString() };
const BASE = `/api/projects/${PROJECT_ID}/register`;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', registerRoutes);
  return app;
}

const defect = (over: Record<string, unknown>): IngestInput =>
  ({
    source: 'sentry',
    environment: 'production',
    severity: 3,
    urgency: 1,
    criticality: 3,
    mitigation: 0,
    ...over,
  }) as unknown as IngestInput;

function stubLlm(text: string): LlmClient {
  return { complete: jest.fn().mockResolvedValue({ text, model: 'stub-model' }) };
}

describe('register enrichment + notify (THE-448)', () => {
  let mongoServer: MongoMemoryServer;
  let app: express.Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    app = makeApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await RegisterEntry.deleteMany({});
    mockAudit.mockClear();
  });

  describe('AC-4 notify (pure + graceful)', () => {
    it('builds a critical Block Kit payload from an entry', () => {
      const blocks = buildCriticalBlocks({
        title: 'NPE in renderer',
        systemComponent: 'backend_api',
        pScore: 21.5,
        routingPath: 'critical',
        severity: 5,
        chainId: 'abc',
      });
      const flat = JSON.stringify(blocks);
      expect(flat).toContain('NPE in renderer');
      expect(flat).toContain('backend_api');
      expect(flat).toContain('21.5');
    });

    it('delivery is a graceful no-op when no webhook is configured (never throws)', async () => {
      delete process.env.OPS_NOTIFY_WEBHOOK_URL;
      const res = await deliverBlocks([{ type: 'section' }]);
      expect(res.delivered).toBe(false);
      expect(res.reason).toMatch(/no webhook/i);
    });
  });

  describe('AC-1 duplicate suggestions (LLM = suggestion only)', () => {
    it('returns candidate duplicates marked as suggestions, from the pool only', async () => {
      const target = await ingestEntry(
        PROJECT_ID,
        defect({ systemComponent: 'billing', errorType: 'TypeError', title: 'charge failed', stackTrace: 'at charge (billing.ts:10)' }),
        ACTOR,
      );
      const other = await ingestEntry(
        PROJECT_ID,
        defect({ systemComponent: 'billing', errorType: 'RangeError', title: 'charge retry blew up', stackTrace: 'at retry (billing.ts:22)' }),
        ACTOR,
      );

      const llm = stubLlm(
        `[{"chainId":"${other.chainId}","confidence":0.85,"reasoning":"same billing charge path"},` +
          `{"chainId":"deadbeefdeadbeefdeadbeef","confidence":0.99,"reasoning":"hallucinated id"}]`,
      );
      const result = await suggestDuplicates(PROJECT_ID, target.chainId.toString(), ACTOR, llm);

      expect(result.degraded).toBe(false);
      expect(result.model).toBe('stub-model');
      expect(result.promptHash).toBeTruthy();
      // hallucinated id dropped; only the real pool candidate survives
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].chainId).toBe(other.chainId.toString());
      expect(result.suggestions[0].suggestion).toBe(true);
      expect(result.suggestions[0].confidence).toBeCloseTo(0.85);
      // AC-3: the LLM run is logged with model + prompt hash
      const enrich = mockAudit.mock.calls
        .map((c) => c[0] as { action: string; after?: Record<string, unknown> })
        .find((a) => a.action === 'register.enrichment');
      expect(enrich?.after?.model).toBe('stub-model');
      expect(enrich?.after?.promptHash).toBeTruthy();
    });

    it('AC-5: degrades to an empty result with no LLM client — engine unaffected', async () => {
      const target = await ingestEntry(PROJECT_ID, defect({ systemComponent: 'a', title: 'x' }), ACTOR);
      await ingestEntry(PROJECT_ID, defect({ systemComponent: 'b', title: 'y', errorType: 'E' }), ACTOR);

      const result = await suggestDuplicates(PROJECT_ID, target.chainId.toString(), ACTOR, null);
      expect(result.degraded).toBe(true);
      expect(result.suggestions).toEqual([]);
      // the deterministic rows are untouched
      expect(await RegisterEntry.countDocuments({ projectId: PROJECT_ID })).toBe(2);
    });

    it('AC-5: an LLM error degrades gracefully (no throw)', async () => {
      const target = await ingestEntry(PROJECT_ID, defect({ systemComponent: 'a', title: 'x' }), ACTOR);
      await ingestEntry(PROJECT_ID, defect({ systemComponent: 'b', title: 'y', errorType: 'E' }), ACTOR);
      const llm: LlmClient = { complete: jest.fn().mockRejectedValue(new Error('LLM down')) };

      const result = await suggestDuplicates(PROJECT_ID, target.chainId.toString(), ACTOR, llm);
      expect(result.degraded).toBe(true);
      expect(result.suggestions).toEqual([]);
      expect(result.promptHash).toBeTruthy(); // records what was attempted
    });

    it('404 for an unknown target chain', async () => {
      await expect(
        suggestDuplicates(PROJECT_ID, new mongoose.Types.ObjectId().toString(), ACTOR, stubLlm('[]')),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('AC-2 problem clustering → human confirm → cascade', () => {
    it('suggests a cluster, then a human-created problem resolves via the slice-3 cascade', async () => {
      const d1 = await ingestEntry(PROJECT_ID, defect({ systemComponent: 'billing', errorType: 'TypeError', title: 'charge failed', stackTrace: 'at charge (billing.ts:10)' }), ACTOR);
      const d2 = await ingestEntry(PROJECT_ID, defect({ systemComponent: 'billing', errorType: 'RangeError', title: 'refund failed', stackTrace: 'at refund (billing.ts:40)' }), ACTOR);

      // LLM proposes clustering both under one systemic problem (suggestion only)
      const llm = stubLlm(
        `[{"title":"Billing money-movement failures","defectChainIds":["${d1.chainId}","${d2.chainId}"],"reasoning":"same billing subsystem"}]`,
      );
      const clusters = await suggestProblemClusters(PROJECT_ID, ACTOR, llm);
      expect(clusters.suggestions).toHaveLength(1);
      expect(clusters.suggestions[0].defectChainIds).toEqual(
        expect.arrayContaining([d1.chainId.toString(), d2.chainId.toString()]),
      );

      // human confirms → creates the problem, links both defects
      const created = await request(app)
        .post(`${BASE}/problem`)
        .send({ title: 'Billing money-movement failures', defectChainIds: [d1.chainId, d2.chainId] });
      expect(created.status).toBe(201);
      const problemChainId = created.body.data.chainId;

      // both defects now point at the problem
      const d1Head = await RegisterEntry.findOne({ projectId: PROJECT_ID, chainId: d1.chainId }).sort({ createdAt: -1 });
      expect(d1Head!.parentRef!.toString()).toBe(problemChainId);

      // resolve both defects → cascade resolves the problem
      await request(app).post(`${BASE}/${d1.chainId}/close`).send({ testsGreen: true });
      const close2 = await request(app).post(`${BASE}/${d2.chainId}/close`).send({ testsGreen: true });
      expect(close2.body.data.cascade.problemResolved).toBe(true);

      const problemHead = await RegisterEntry.findOne({ projectId: PROJECT_ID, chainId: problemChainId }).sort({ createdAt: -1 });
      expect(problemHead!.status).toBe('resolved');
    });
  });
});
