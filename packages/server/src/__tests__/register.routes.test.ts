/**
 * THE-445 AC-1/AC-4/AC-5 — register ingest + human gate over the real service + in-memory Mongo.
 * Run: cd packages/server && npx jest src/__tests__/register.routes.test.ts
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

const PROJECT_ID = new mongoose.Types.ObjectId().toString();

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', registerRoutes);
  return app;
}

const validBody = {
  source: 'manual',
  systemComponent: 'backend_api',
  environment: 'production',
  title: 'Memory leak in data parsing module',
  severity: 5,
  urgency: 4,
  criticality: 5,
  mitigation: 0,
};

describe('register.routes (THE-445)', () => {
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

  it('AC-1: rejects a payload missing required fields with 400 and creates no row', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeDefined();
    expect(await RegisterEntry.countDocuments()).toBe(0);
  });

  it('AC-1: accepts a valid payload and persists exactly one WORM row (201)', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(await RegisterEntry.countDocuments()).toBe(1);
  });

  it('AC-3/AC-4: deterministic pScore, critical routing, actions proposed (not executed)', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send(validBody);
    // 2·5 + 1·4 + 1.5·5 − 0 = 21.5 → critical
    expect(res.body.data.pScore).toBe(21.5);
    expect(res.body.data.routingPath).toBe('critical');
    expect(res.body.data.proposedActions.length).toBeGreaterThan(0);
    for (const a of res.body.data.proposedActions) {
      expect(a.requiresApproval).toBe(true);
      expect(a.status).toBe('proposed'); // Asilomar #16 — nothing auto-executed
    }
  });

  it('AC-4: low-signal payload routes to noise and proposes a human-confirmed reject', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send({ ...validBody, severity: 1, urgency: 1, criticality: 1, mitigation: 3 });
    // 2·1 + 1·1 + 1.5·1 − 3 = 1.5 → noise
    expect(res.body.data.routingPath).toBe('noise');
    expect(res.body.data.proposedActions[0].type).toBe('reject_noise');
  });

  it('AC-5: emits an audit entry for the ingest, score and routing steps', async () => {
    await request(app).post(`/api/projects/${PROJECT_ID}/register/ingest`).send(validBody);
    const actions = mockAudit.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(
      expect.arrayContaining(['register.ingest', 'register.scored', 'register.routed']),
    );
  });

  it('AC-4: gate approval writes a new WORM row that supersedes the original', async () => {
    const ingest = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send(validBody);
    const id = ingest.body.data._id;

    const gate = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/${id}/gate`)
      .send({ actionType: 'create_blocker', decision: 'approve' });

    expect(gate.status).toBe(200);
    expect(gate.body.data.supersedes).toBe(id);
    expect(await RegisterEntry.countDocuments()).toBe(2); // original + superseding row
    const approved = gate.body.data.proposedActions.find(
      (a: { type: string }) => a.type === 'create_blocker',
    );
    expect(approved.status).toBe('approved');
  });

  it('gate on a missing entry returns 404', async () => {
    const missing = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/${missing}/gate`)
      .send({ actionType: 'create_blocker', decision: 'approve' });
    expect(res.status).toBe(404);
  });
});
