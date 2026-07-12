/**
 * THE-447 — closed loop: verify-closure, cascade-close, SLA-breach escalation.
 * Real service + model + in-memory Mongo.
 * Run: cd packages/server && npx jest src/__tests__/register-closeloop.routes.test.ts
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
import { sweepSla } from '../services/register.service';

const PROJECT_ID = new mongoose.Types.ObjectId().toString();
const ACTOR = { userId: new mongoose.Types.ObjectId().toString() };
const BASE = `/api/projects/${PROJECT_ID}/register`;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', registerRoutes);
  return app;
}

const defectBody = (over: Record<string, unknown> = {}) => ({
  source: 'sentry',
  systemComponent: 'backend_api',
  environment: 'production',
  title: 'NPE in report renderer',
  errorType: 'TypeError',
  stackTrace: 'at render (report.ts:44)',
  severity: 3,
  urgency: 1,
  criticality: 3,
  mitigation: 0,
  ...over,
});

let fpCounter = 0;
async function insertRow(over: Record<string, unknown> = {}) {
  const _id = new mongoose.Types.ObjectId();
  return RegisterEntry.create({
    _id,
    chainId: _id,
    firstSeenAt: new Date(),
    projectId: PROJECT_ID,
    kind: 'defect',
    fingerprint: `fp-${fpCounter++}`,
    source: 'manual',
    systemComponent: 'backend_api',
    environment: 'production',
    title: 'fixture',
    severity: 3,
    urgency: 3,
    criticality: 3,
    mitigation: 0,
    pScore: 12,
    weightsVersion: 'v1',
    routingPath: 'normal',
    status: 'assessed',
    ...over,
  });
}

async function head(chainId: mongoose.Types.ObjectId | string) {
  return RegisterEntry.findOne({ projectId: PROJECT_ID, chainId }).sort({ createdAt: -1, _id: -1 });
}

describe('register closed loop (THE-447)', () => {
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

  describe('AC-1: verify-closure', () => {
    it('resolves a defect when the fix is verified (tests green)', async () => {
      const ing = await request(app).post(`${BASE}/ingest`).send(defectBody());
      const chainId = ing.body.data.chainId;

      const res = await request(app)
        .post(`${BASE}/${chainId}/close`)
        .send({ testsGreen: true, fixRef: 'PR#123' });

      expect(res.status).toBe(200);
      expect(res.body.data.verified).toBe(true);
      expect(res.body.data.entry.status).toBe('resolved');
      expect(res.body.data.entry.evidence.closure.verified).toBe(true);
      expect(res.body.data.entry.supersedes).toBe(ing.body.data._id);
      // WORM: original row untouched, resolution is a new row
      expect(await RegisterEntry.countDocuments({ projectId: PROJECT_ID })).toBe(2);
    });

    it('reopens (does NOT resolve) when tests are not green', async () => {
      const ing = await request(app).post(`${BASE}/ingest`).send(defectBody());
      const res = await request(app)
        .post(`${BASE}/${ing.body.data.chainId}/close`)
        .send({ testsGreen: false });

      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.entry.status).toBe('open');
      expect(res.body.data.entry.evidence.reopen.reason).toMatch(/not green/i);
    });

    it('reopens when the defect recurred after the fix was applied (no new incidents in window)', async () => {
      const ing = await request(app).post(`${BASE}/ingest`).send(defectBody());
      // the ingest occurrence is stamped "now"; claim the fix was applied in the past
      const res = await request(app)
        .post(`${BASE}/${ing.body.data.chainId}/close`)
        .send({ testsGreen: true, appliedAt: '2000-01-01T00:00:00.000Z' });

      expect(res.body.data.verified).toBe(false);
      expect(res.body.data.entry.status).toBe('open');
      expect(res.body.data.entry.evidence.reopen.reason).toMatch(/recurred/i);
    });

    it('404 when closing an unknown chain', async () => {
      const missing = new mongoose.Types.ObjectId().toString();
      const res = await request(app).post(`${BASE}/${missing}/close`).send({ testsGreen: true });
      expect(res.status).toBe(404);
    });
  });

  describe('AC-2: cascade-close', () => {
    it('closes child incidents and resolves the parent problem only when all its defects are closed', async () => {
      const problem = await insertRow({ kind: 'problem', title: 'systemic report failures' });
      const d1 = await insertRow({ kind: 'defect', parentRef: problem.chainId });
      const d2 = await insertRow({ kind: 'defect', parentRef: problem.chainId });
      const incident = await insertRow({ kind: 'incident', parentRef: d1.chainId });

      // close D1 → D1 resolved, its child incident cascade-closed, problem still open (D2 open)
      const r1 = await request(app)
        .post(`${BASE}/${d1.chainId}/close`)
        .send({ testsGreen: true });
      expect(r1.body.data.cascade.incidentsClosed).toBe(1);
      expect(r1.body.data.cascade.problemResolved).toBe(false);
      expect((await head(incident.chainId))!.status).toBe('resolved');
      expect((await head(problem.chainId))!.status).toBe('assessed');

      // close D2 → all child defects resolved → problem resolves
      const r2 = await request(app)
        .post(`${BASE}/${d2.chainId}/close`)
        .send({ testsGreen: true });
      expect(r2.body.data.cascade.problemResolved).toBe(true);
      expect((await head(problem.chainId))!.status).toBe('resolved');
    });
  });

  describe('AC-3: SLA-breach escalation', () => {
    it('proposes (not executes) an escalation for open entries past their deadline, idempotently', async () => {
      // normal routing → 14-day SLA
      const ing = await request(app).post(`${BASE}/ingest`).send(defectBody());
      const chainId = ing.body.data.chainId as string;
      expect(ing.body.data.slaDeadline).toBeTruthy();

      // not yet breached
      const none = await sweepSla(PROJECT_ID, ACTOR, Date.now());
      expect(none).toHaveLength(0);

      // 15 days later → breached
      const future = Date.now() + 15 * 24 * 60 * 60 * 1000;
      const breached = await sweepSla(PROJECT_ID, ACTOR, future);
      expect(breached).toHaveLength(1);
      expect(breached[0].chainId).toBe(chainId);

      const h = await head(chainId);
      const escalate = h!.proposedActions.find((a) => a.type === 'escalate');
      expect(escalate).toBeDefined();
      expect(escalate!.requiresApproval).toBe(true);
      expect(escalate!.status).toBe('proposed'); // Asilomar #16 — not executed
      expect(mockAudit.mock.calls.map((c) => (c[0] as { action: string }).action)).toContain(
        'register.sla_breach',
      );

      // idempotent: sweeping again does not stack another escalation row
      const before = await RegisterEntry.countDocuments({ projectId: PROJECT_ID });
      const again = await sweepSla(PROJECT_ID, ACTOR, future);
      expect(again).toHaveLength(0);
      expect(await RegisterEntry.countDocuments({ projectId: PROJECT_ID })).toBe(before);
    });

    it('does not escalate a resolved (terminal) entry even if past deadline', async () => {
      const resolved = await insertRow({
        status: 'resolved',
        routingPath: 'normal',
        slaDeadline: new Date(Date.now() - 1000),
      });
      const breached = await sweepSla(PROJECT_ID, ACTOR, Date.now());
      expect(breached).toHaveLength(0);
      expect((await head(resolved.chainId))!.status).toBe('resolved');
    });
  });
});
