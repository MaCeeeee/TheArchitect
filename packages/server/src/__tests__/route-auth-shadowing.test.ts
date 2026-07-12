/**
 * THE-453 — regression: a path-less `router.use(authenticate)` in one `/api` router
 * must not shadow the public health endpoints of routers mounted after it.
 *
 * Uses the REAL authenticate middleware (no mock) so that a token-less request is
 * genuinely rejected — the point is to prove which paths fall through to a public
 * handler and which stay 401. Mount order mirrors index.ts (ragRoutes BEFORE
 * regulationsRoutes at /api), because that order is exactly what triggered the bug.
 *
 * No Mongo connection: every asserted path short-circuits before any DB query
 * (401 before the handler, or corpus-unconfigured returns early).
 *
 * Run: cd packages/server && npx jest src/__tests__/route-auth-shadowing.test.ts
 */
import express from 'express';
import request from 'supertest';

jest.mock('../config/logger', () => ({
  log: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// imported after mocks
import ragRoutes from '../routes/rag.routes';
import regulationsRoutes from '../routes/regulations.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  // Same order as index.ts: rag is mounted at /api BEFORE regulations.
  app.use('/api', ragRoutes);
  app.use('/api/projects', ragRoutes);
  app.use('/api', regulationsRoutes);
  app.use('/api/projects', regulationsRoutes);
  return app;
}

describe('route auth shadowing (THE-453)', () => {
  let app: express.Express;

  beforeAll(() => {
    // Guarantee the corpus-unconfigured branch so corpus/health needs no DB.
    delete process.env.CORPUS_MONGODB_URI;
    app = makeApp();
  });

  it('serves the PUBLIC corpus/health without a token (not shadowed by ragRoutes)', async () => {
    const res = await request(app).get('/api/regulations/corpus/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('configured');
    expect(res.body).toHaveProperty('ok');
    // Deliberately NOT a 401 — this is the whole point of the fix.
    expect(res.body.error).toBeUndefined();
  });

  it('keeps rag/health authenticated (401 without a token)', async () => {
    const res = await request(app).get('/api/rag/health');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('keeps crawler/health authenticated — it exposes the internal crawler URL (401 without a token)', async () => {
    const res = await request(app).get('/api/regulations/crawler/health');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('keeps the project-scoped rag query route protected (401 without a token)', async () => {
    const res = await request(app)
      .post('/api/projects/000000000000000000000000/rag/query')
      .send({ text: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});
