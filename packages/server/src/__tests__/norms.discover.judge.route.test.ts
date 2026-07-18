/**
 * UC-LAW-002 Slice-2 (THE-462/463) Endpoint Tests.
 *
 *   POST /:projectId/norms/discover          — discoverAndJudge (merged report)
 *   POST /:projectId/norms/discover/confirm  — {family, corpusVersionHash} → confirmed
 *   POST /:projectId/norms/discover/reject   — {family, corpusVersionHash} → rejected
 *
 * All three are flag-gated (LAW_DISCOVERY_ENABLED) and editor-access-gated
 * (Review-Fix 6: /discover now spends LLM money, not just retrieval).
 *
 * Run: cd packages/server && npx jest src/__tests__/norms.discover.judge.route.test.ts --verbose
 */
import request from 'supertest';
import express from 'express';

const mockDiscoverAndJudge = jest.fn();
jest.mock('../services/lawDiscovery.service', () => ({ discoverAndJudge: (...a: unknown[]) => mockDiscoverAndJudge(...a) }));

const mockSetFindingStatus = jest.fn();
jest.mock('../services/lawDiscoveryFinding.service', () => ({ setFindingStatus: (...a: unknown[]) => mockSetFindingStatus(...a) }));

const mockAudit = jest.fn().mockResolvedValue(undefined);
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: (...a: unknown[]) => mockAudit(...a) }));

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { _id: { toString: () => 'user-1' } };
    next();
  },
}));

const mockRequireProjectAccess = jest.fn((_minRole?: string) => (_req: unknown, _res: unknown, next: () => void) => next());
jest.mock('../middleware/projectAccess.middleware', () => ({ requireProjectAccess: (...a: unknown[]) => mockRequireProjectAccess(...(a as [string?])) }));

function appWith(flag: string | undefined) {
  if (flag === undefined) delete process.env.LAW_DISCOVERY_ENABLED; else process.env.LAW_DISCOVERY_ENABLED = flag;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/norms.routes').default;
  const app = express(); app.use(express.json()); app.use('/api/projects', router);
  return app;
}

const mergedReport = {
  projectId: 'p1',
  generatedAt: new Date().toISOString(),
  elementCount: 3,
  wizardElementCount: 1,
  assumedJurisdictions: ['EU'],
  signals: [],
  assessments: [
    { ruleId: 'ai-act', label: 'AI Act', corpusSourceIds: ['ai-act-en'], jurisdiction: 'EU', kind: 'legislation', bindingness: 'binding', verdict: 'applicable', score: 0, contributions: [], rationale: 'r', referenced: false, inPipeline: false, availableInCorpus: true, provenance: 'corpus' },
  ],
  disclaimer: 'not legal advice',
  coverage: { stageARuleCount: 0, stageBCorpusCount: 1, corpusVersion: 'H' },
};

describe('UC-LAW-002 Slice-2 discover/confirm/reject endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverAndJudge.mockResolvedValue(mergedReport);
    mockSetFindingStatus.mockResolvedValue(true);
  });

  describe('POST /:projectId/norms/discover', () => {
    it('Flag an ⇒ 200 + gemergter Report (mit coverage)', async () => {
      const res = await request(appWith('true')).post('/api/projects/p1/norms/discover');
      expect(res.status).toBe(200);
      expect(res.body.data.coverage).toEqual({ stageARuleCount: 0, stageBCorpusCount: 1, corpusVersion: 'H' });
      expect(mockDiscoverAndJudge).toHaveBeenCalledWith('p1');
    });

    it('Flag aus ⇒ 404', async () => {
      const res = await request(appWith(undefined)).post('/api/projects/p1/norms/discover');
      expect(res.status).toBe(404);
    });

    it('is gated by requireProjectAccess (editor)', async () => {
      await request(appWith('true')).post('/api/projects/p1/norms/discover');
      expect(mockRequireProjectAccess).toHaveBeenCalledWith('editor');
    });

    it('creates an audit entry for the discovery run (Spec-Fix 2 — costs LLM money + persists findings)', async () => {
      await request(appWith('true')).post('/api/projects/p1/norms/discover');
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'law.discovery.run' }));
    });
  });

  describe('POST /:projectId/norms/discover/confirm', () => {
    it('Flag an ⇒ 200 + status confirmed', async () => {
      const res = await request(appWith('true'))
        .post('/api/projects/p1/norms/discover/confirm')
        .send({ family: 'ai-act', corpusVersionHash: 'H' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('confirmed');
      expect(mockSetFindingStatus).toHaveBeenCalledWith('p1', 'ai-act', 'H', 'confirmed');
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'law.discovery.confirm' }));
    });

    it('Flag aus ⇒ 404', async () => {
      const res = await request(appWith(undefined))
        .post('/api/projects/p1/norms/discover/confirm')
        .send({ family: 'ai-act', corpusVersionHash: 'H' });
      expect(res.status).toBe(404);
    });

    it('invalid body ⇒ 400', async () => {
      const res = await request(appWith('true')).post('/api/projects/p1/norms/discover/confirm').send({});
      expect(res.status).toBe(400);
    });

    it('no matching finding ⇒ 404', async () => {
      mockSetFindingStatus.mockResolvedValue(false);
      const res = await request(appWith('true'))
        .post('/api/projects/p1/norms/discover/confirm')
        .send({ family: 'ghost-law', corpusVersionHash: 'H' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /:projectId/norms/discover/reject', () => {
    it('Flag an ⇒ 200 + status rejected', async () => {
      const res = await request(appWith('true'))
        .post('/api/projects/p1/norms/discover/reject')
        .send({ family: 'ai-act', corpusVersionHash: 'H' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
      expect(mockSetFindingStatus).toHaveBeenCalledWith('p1', 'ai-act', 'H', 'rejected');
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'law.discovery.reject' }));
    });

    it('Flag aus ⇒ 404', async () => {
      const res = await request(appWith(undefined))
        .post('/api/projects/p1/norms/discover/reject')
        .send({ family: 'ai-act', corpusVersionHash: 'H' });
      expect(res.status).toBe(404);
    });
  });

  it('discover/confirm and discover/reject are registered BEFORE :workId routes (never swallowed as a workId)', async () => {
    const res = await request(appWith('true'))
      .post('/api/projects/p1/norms/discover/confirm')
      .send({ family: 'ai-act', corpusVersionHash: 'H' });
    // If the :workId/pipeline route had matched instead, this would 404/500 via getNorm — 200 proves the static route won.
    expect(res.status).toBe(200);
  });
});
