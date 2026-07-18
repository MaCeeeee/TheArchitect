import request from 'supertest';
import express from 'express';

const mockDiscover = jest.fn();
jest.mock('../services/lawDiscovery.service', () => ({ discoverCandidates: (...a: unknown[]) => mockDiscover(...a) }));
jest.mock('../middleware/auth.middleware', () => ({ authenticate: (_req: unknown, _res: unknown, next: () => void) => next() }));

function appWith(flag: string | undefined) {
  if (flag === undefined) delete process.env.LAW_DISCOVERY_ENABLED; else process.env.LAW_DISCOVERY_ENABLED = flag;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/norms.routes').default;
  const app = express(); app.use(express.json()); app.use('/api/projects', router);
  return app;
}

describe('POST /:projectId/norms/discover', () => {
  beforeEach(() => mockDiscover.mockResolvedValue({ projectId: 'p1', corpusConfigured: true, candidates: [{ family: 'ai-act', sources: ['ai-act-en'], jurisdiction: 'EU', score: 0.9, hitCount: 1, topHits: [] }] }));

  it('Flag an ⇒ 200 + Kandidaten', async () => {
    const res = await request(appWith('true')).post('/api/projects/p1/norms/discover');
    expect(res.status).toBe(200);
    expect(res.body.data.candidates[0].family).toBe('ai-act');
  });

  it('Flag aus ⇒ 404 (Feature nicht sichtbar)', async () => {
    const res = await request(appWith(undefined)).post('/api/projects/p1/norms/discover');
    expect(res.status).toBe(404);
  });
});
