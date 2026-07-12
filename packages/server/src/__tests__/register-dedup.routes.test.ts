/**
 * THE-446 AC-2/AC-3/AC-4/AC-5 — stable fingerprint + dedup + occurrence counter over the real
 * service + in-memory Mongo.
 * Run: cd packages/server && npx jest src/__tests__/register-dedup.routes.test.ts
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
import { computeFingerprint } from '../services/register.service';

const PROJECT_ID = new mongoose.Types.ObjectId().toString();

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', registerRoutes);
  return app;
}

// Two Sentry-shaped reports of the SAME fault: reworded title, shifted line number,
// same component + errorType + top frame file/function.
const sentryFirst = {
  source: 'sentry',
  systemComponent: 'backend_api',
  environment: 'production',
  title: 'Memory Leak in Data Parsing Module',
  errorType: 'MemoryError',
  stackTrace: 'at parseNodeArray (parser.ts:142)\nat ingest (pipeline.ts:88)',
  eventId: 'evt_001',
  severity: 4,
  urgency: 1,
  criticality: 4,
  mitigation: 0,
};
const sentrySecond = {
  ...sentryFirst,
  title: 'High memory consumption when processing 3D node arrays', // reworded
  stackTrace: 'at parseNodeArray (parser.ts:150)\nat ingest (pipeline.ts:91)', // lines shifted
  eventId: 'evt_002',
};

describe('register dedup (THE-446)', () => {
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

  describe('AC-2: stable fingerprint (pure)', () => {
    it('collides for reworded title + shifted line numbers (same fault)', () => {
      expect(computeFingerprint(sentryFirst)).toBe(computeFingerprint(sentrySecond));
    });

    it('differs for a different errorType, component, or top frame', () => {
      expect(computeFingerprint({ ...sentryFirst, errorType: 'TypeError' })).not.toBe(
        computeFingerprint(sentryFirst),
      );
      expect(computeFingerprint({ ...sentryFirst, systemComponent: 'frontend' })).not.toBe(
        computeFingerprint(sentryFirst),
      );
      expect(
        computeFingerprint({
          ...sentryFirst,
          stackTrace: 'at renderScene (scene.ts:10)',
        }),
      ).not.toBe(computeFingerprint(sentryFirst));
    });

    it('falls back to normalized title when no stacktrace is present', () => {
      const a = computeFingerprint({
        systemComponent: 'docs',
        title: 'Broken Link on Landing Page',
      });
      const b = computeFingerprint({
        systemComponent: 'docs',
        title: '  broken link on landing page ',
      });
      expect(a).toBe(b);
    });
  });

  it('AC-5: two payloads, same cause, different title → exactly one defect chain, counter = 2', async () => {
    const first = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send(sentryFirst);
    expect(first.status).toBe(201);
    expect(first.body.data.occurrenceCounter).toBe(1);

    const second = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send(sentrySecond);
    expect(second.status).toBe(201);

    // no new defect: the second row supersedes the first (same chain), counter incremented
    expect(second.body.data.occurrenceCounter).toBe(2);
    expect(second.body.data.supersedes).toBe(first.body.data._id);
    expect(second.body.data.fingerprint).toBe(first.body.data.fingerprint);
    // chain keeps the canonical first title; the reworded report is linked as evidence (AC-3)
    expect(second.body.data.title).toBe(sentryFirst.title);
    const occ = second.body.data.evidence.occurrences;
    expect(occ).toHaveLength(2);
    expect(occ[1].title).toBe(sentrySecond.title);
    expect(occ[1].eventId).toBe('evt_002');

    // exactly one logical defect: every row shares the fingerprint, single chain head
    const rows = await RegisterEntry.find({ projectId: PROJECT_ID });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.fingerprint)).size).toBe(1);
  });

  it('AC-3: audits the occurrence instead of a fresh ingest', async () => {
    await request(app).post(`/api/projects/${PROJECT_ID}/register/ingest`).send(sentryFirst);
    mockAudit.mockClear();
    await request(app).post(`/api/projects/${PROJECT_ID}/register/ingest`).send(sentrySecond);
    const actions = mockAudit.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toContain('register.occurrence');
    expect(actions).not.toContain('register.ingest');
  });

  it('AC-4: urgency escalates with the occurrence counter and lifts the pScore', async () => {
    let last: request.Response | undefined;
    for (let i = 0; i < 4; i++) {
      last = await request(app)
        .post(`/api/projects/${PROJECT_ID}/register/ingest`)
        .send({ ...sentryFirst, eventId: `evt_${i}` });
    }
    // counter 4 → urgencyFromOccurrences = 3 > reported 1
    expect(last!.body.data.occurrenceCounter).toBe(4);
    expect(last!.body.data.urgency).toBe(3);
    // 2·4 + 1·3 + 1.5·4 − 0 = 17 → escalated to critical (was 15 = normal at urgency 1)
    expect(last!.body.data.pScore).toBe(17);
    expect(last!.body.data.routingPath).toBe('critical');
  });

  it('a terminal chain (noise-confirmed) does NOT absorb new occurrences — fresh defect starts', async () => {
    const first = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send({ ...sentryFirst, severity: 1, urgency: 1, criticality: 1, mitigation: 3 });
    expect(first.body.data.routingPath).toBe('noise');

    // human confirms the noise rejection → terminal status on the superseding row
    const gate = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/${first.body.data._id}/gate`)
      .send({ actionType: 'reject_noise', decision: 'approve' });
    expect(gate.body.data.status).toBe('noise');

    // same fault reported again → NOT attached to the closed chain
    const again = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send({ ...sentryFirst, severity: 1, urgency: 1, criticality: 1, mitigation: 3 });
    expect(again.body.data.occurrenceCounter).toBe(1);
    expect(again.body.data.supersedes).toBeNull();
  });

  it('carries human gate decisions over to the superseding occurrence row', async () => {
    const first = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send({ ...sentryFirst, severity: 5, urgency: 4, criticality: 5 }); // critical
    const gated = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/${first.body.data._id}/gate`)
      .send({ actionType: 'create_blocker', decision: 'approve' });
    expect(gated.status).toBe(200);

    const occurrence = await request(app)
      .post(`/api/projects/${PROJECT_ID}/register/ingest`)
      .send({ ...sentryFirst, severity: 5, urgency: 4, criticality: 5, eventId: 'evt_x' });
    const blocker = occurrence.body.data.proposedActions.find(
      (a: { type: string }) => a.type === 'create_blocker',
    );
    expect(blocker.status).toBe('approved'); // decision survives the WORM roll-forward
    expect(occurrence.body.data.occurrenceCounter).toBe(2);
  });
});
