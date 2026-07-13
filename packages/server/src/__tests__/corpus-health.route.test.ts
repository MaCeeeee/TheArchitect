/**
 * THE-419 — GET /api/regulations/corpus/health exposes cutover-readiness telemetry.
 *
 * Before flipping CORPUS_STRICT_READS the operator must confirm the corpus serves
 * every read (no app-DB fallbacks over a full traffic window). Until now that was
 * only observable by grepping prod logs for the THE-419 warn line — a fragile check
 * (a shell typo fakes a "0"). This pins the machine-readable alternative: the public
 * corpus-health endpoint surfaces the in-memory fallback counters, the strict-reads
 * flag, and process uptime.
 *
 * Uses supertest against an in-process app (NOT axios/live-server — see THE-435).
 *
 * Run: cd packages/server && npx jest src/__tests__/corpus-health.route.test.ts --forceExit
 */
import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Health route sits above router.use(authenticate); mock to avoid JWT/config deps.
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

// Import AFTER mocks
import regulationsRoutes from '../routes/regulations.routes';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { resetFallbackStats, getRegulationsForProject } from '../services/regulationResolver.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const HEALTH = '/api/regulations/corpus/health';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', regulationsRoutes);
  return app;
}

describe('THE-419 — corpus/health telemetry endpoint', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    __setCorpusForTests(null);
    delete process.env.CORPUS_MONGODB_URI;
    delete process.env.CORPUS_STRICT_READS;
  });

  beforeEach(() => {
    resetFallbackStats();
    delete process.env.CORPUS_STRICT_READS;
    // Corpus "configured" (env) + injected empty model → reads hit the fake, not a
    // real connection. isCorpusConfigured() keys off CORPUS_MONGODB_URI.
    process.env.CORPUS_MONGODB_URI = 'mongodb://fake-corpus/db';
    __setCorpusForTests(makeFakeCorpus([]));
  });

  it('returns the telemetry shape with zeroed counters after reset', async () => {
    const res = await request(app).get(HEALTH);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      configured: true,
      strictReads: false,
      fallbackStats: { corpusUnconfigured: 0, corpusMiss: 0 },
    });
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reflects strictReads from CORPUS_STRICT_READS at request time', async () => {
    process.env.CORPUS_STRICT_READS = 'true';
    const res = await request(app).get(HEALTH);
    expect(res.body.strictReads).toBe(true);
  });

  it('surfaces a real corpusMiss fallback in the counter (the readiness signal)', async () => {
    // Project has no ComplianceMappings → no keys → corpus yields nothing →
    // app-DB fallback recorded as corpusMiss (corpus IS configured).
    await getRegulationsForProject('507f1f77bcf86cd799439099');

    const res = await request(app).get(HEALTH);
    expect(res.body.fallbackStats.corpusMiss).toBe(1);
    expect(res.body.fallbackStats.corpusUnconfigured).toBe(0);
    // A non-zero counter is exactly what must block the STRICT_READS flip.
  });
});
