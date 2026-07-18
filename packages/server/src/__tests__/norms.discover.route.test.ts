/**
 * UC-LAW-002 Slice-2 (THE-462/463): `/discover` now returns the hybrid-merged
 * ApplicabilityReport (discoverAndJudge), not the raw Slice-1 candidate list —
 * see norms.discover.judge.route.test.ts for the full confirm/reject/flag matrix.
 */
import request from 'supertest';
import express from 'express';

const mockDiscoverAndJudge = jest.fn();
jest.mock('../services/lawDiscovery.service', () => ({ discoverAndJudge: (...a: unknown[]) => mockDiscoverAndJudge(...a) }));
jest.mock('../middleware/auth.middleware', () => ({ authenticate: (_req: unknown, _res: unknown, next: () => void) => next() }));
jest.mock('../middleware/projectAccess.middleware', () => ({ requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next() }));

function appWith(flag: string | undefined) {
  if (flag === undefined) delete process.env.LAW_DISCOVERY_ENABLED; else process.env.LAW_DISCOVERY_ENABLED = flag;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/norms.routes').default;
  const app = express(); app.use(express.json()); app.use('/api/projects', router);
  return app;
}

describe('POST /:projectId/norms/discover', () => {
  beforeEach(() => mockDiscoverAndJudge.mockResolvedValue({
    projectId: 'p1',
    generatedAt: new Date().toISOString(),
    elementCount: 3,
    wizardElementCount: 1,
    assumedJurisdictions: ['EU'],
    signals: [],
    assessments: [{ ruleId: 'ai-act', label: 'AI Act', corpusSourceIds: ['ai-act-en'], jurisdiction: 'EU', kind: 'legislation', bindingness: 'binding', verdict: 'applicable', score: 0, contributions: [], rationale: 'r', referenced: false, inPipeline: false, availableInCorpus: true, provenance: 'corpus' }],
    disclaimer: 'not legal advice',
    coverage: { stageARuleCount: 0, stageBCorpusCount: 1, corpusVersion: 'H' },
  }));

  it('Flag an ⇒ 200 + gemergter Report mit coverage', async () => {
    const res = await request(appWith('true')).post('/api/projects/p1/norms/discover');
    expect(res.status).toBe(200);
    expect(res.body.data.assessments[0].ruleId).toBe('ai-act');
    expect(res.body.data.coverage).toEqual({ stageARuleCount: 0, stageBCorpusCount: 1, corpusVersion: 'H' });
  });

  it('Flag aus ⇒ 404 (Feature nicht sichtbar)', async () => {
    const res = await request(appWith(undefined)).post('/api/projects/p1/norms/discover');
    expect(res.status).toBe(404);
  });
});
