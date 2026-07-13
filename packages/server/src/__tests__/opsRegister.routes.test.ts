/**
 * THE-476 — platform-wide ops register (system-scoped, no projectId).
 * Run: cd packages/server && npx jest src/__tests__/opsRegister.routes.test.ts
 */
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mockAudit = jest.fn().mockResolvedValue(undefined);

// authenticate sets req.user; role is controllable via the X-Test-Role header (default admin).
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: express.Request, _res: unknown, next: () => void) => {
    const role = (req.headers['x-test-role'] as string) || 'chief_architect';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).user = { _id: new (require('mongoose').Types.ObjectId)(), role };
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
import opsRegisterRoutes, { OPS_PROJECT_ID } from '../routes/opsRegister.routes';
import { RegisterEntry } from '../models/RegisterEntry';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ops', opsRegisterRoutes);
  return app;
}

const defect = (over: Record<string, unknown> = {}) => ({
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

describe('ops register (THE-476)', () => {
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

  it('AC-2: a non-admin role is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/ops/register/ingest')
      .set('X-Test-Role', 'viewer')
      .send(defect());
    expect(res.status).toBe(403);
    expect(await RegisterEntry.countDocuments()).toBe(0);
  });

  it('AC-1: a system admin ingests WITHOUT a projectId → 201, row carries the ops sentinel', async () => {
    const res = await request(app).post('/api/ops/register/ingest').send(defect());
    expect(res.status).toBe(201);
    expect(res.body.data.projectId).toBe(OPS_PROJECT_ID);
    expect(res.body.data.chainId).toBeTruthy();
    // deterministic engine still applied
    expect(res.body.data.pScore).toBe(11.5); // 2·3 + 1·1 + 1.5·3
    expect(res.body.data.routingPath).toBe('normal');
  });

  it('AC-1: strict schema still rejects a malformed payload with 400', async () => {
    const res = await request(app).post('/api/ops/register/ingest').send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it('AC-3: GET /register returns ONLY ops entries, not project-scoped ones', async () => {
    // one ops entry via the endpoint
    await request(app).post('/api/ops/register/ingest').send(defect());
    // one project-scoped entry inserted directly (different projectId)
    const pid = new mongoose.Types.ObjectId();
    await RegisterEntry.create({
      _id: new mongoose.Types.ObjectId(),
      chainId: new mongoose.Types.ObjectId(),
      firstSeenAt: new Date(),
      projectId: pid,
      kind: 'defect',
      fingerprint: 'proj-scoped',
      source: 'manual',
      systemComponent: 'x',
      environment: 'production',
      title: 'project defect',
      severity: 2,
      urgency: 2,
      criticality: 2,
      mitigation: 0,
      pScore: 9,
      weightsVersion: 'v1',
      routingPath: 'normal',
      status: 'assessed',
    });

    const res = await request(app).get('/api/ops/register');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].projectId).toBe(OPS_PROJECT_ID);
    // sanity: two rows exist in the collection overall
    expect(await RegisterEntry.countDocuments()).toBe(2);
  });

  it('AC-5: ingest → list → gate → close, all without a projectId', async () => {
    const ing = await request(app)
      .post('/api/ops/register/ingest')
      .send(defect({ severity: 5, urgency: 4, criticality: 5 })); // critical
    const chainId = ing.body.data.chainId;
    expect(ing.body.data.routingPath).toBe('critical');

    const list = await request(app).get('/api/ops/register');
    expect(list.body.data.total).toBe(1);

    const gate = await request(app)
      .post(`/api/ops/register/${chainId}/gate`)
      .send({ actionType: 'create_blocker', decision: 'approve' });
    expect(gate.status).toBe(200);
    expect(gate.body.data.supersedes).toBe(ing.body.data._id);

    const close = await request(app)
      .post(`/api/ops/register/${chainId}/close`)
      .send({ testsGreen: true, fixRef: 'PR#9' });
    expect(close.status).toBe(200);
    expect(close.body.data.verified).toBe(true);
    expect(close.body.data.entry.status).toBe('resolved');
  });

  it('sla-sweep runs system-scoped without a projectId', async () => {
    const res = await request(app).post('/api/ops/register/sla-sweep').send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('count');
  });
});
