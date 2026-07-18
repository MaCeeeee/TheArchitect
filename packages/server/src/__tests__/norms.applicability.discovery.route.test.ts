/**
 * UC-LAW-002 Slice-2b (THE-464) Task 1 — Verfügbarkeits-Gating auf
 * GET /:projectId/norms/applicability (`discovery`-Feld) + persistierte
 * Findings billig sichtbar (Review-Fix 4) + GET /:projectId/norms/discover/findings.
 *
 * Run: cd packages/server && npx jest src/__tests__/norms.applicability.discovery.route.test.ts --verbose
 */
import request from 'supertest';
import express from 'express';

const mockBuildReport = jest.fn();
jest.mock('../services/regulationApplicability.service', () => ({
  buildApplicabilityReport: (...a: unknown[]) => mockBuildReport(...a),
  loadNormWorldState: (...a: unknown[]) => mockLoadWorld(...a),
}));

const mockConfigured = jest.fn();
jest.mock('../services/corpusClient.service', () => ({ isCorpusConfigured: () => mockConfigured() }));

const mockListFindings = jest.fn();
jest.mock('../services/lawDiscoveryFinding.service', () => ({
  listFindings: (...a: unknown[]) => mockListFindings(...a),
  setFindingStatus: jest.fn(),
}));

const mockDiscoverAndJudge = jest.fn();
jest.mock('../services/lawDiscovery.service', () => ({ discoverAndJudge: (...a: unknown[]) => mockDiscoverAndJudge(...a) }));

const mockMerge = jest.fn();
jest.mock('../services/lawApplicabilityMerge.service', () => ({ mergeApplicability: (...a: unknown[]) => mockMerge(...a) }));

const mockLoadWorld = jest.fn();

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: unknown, next: () => void) => {
    req.user = { _id: { toString: () => 'user-1' } };
    next();
  },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn().mockResolvedValue(undefined) }));

function appWith(flag: string | undefined) {
  if (flag === undefined) delete process.env.LAW_DISCOVERY_ENABLED;
  else process.env.LAW_DISCOVERY_ENABLED = flag;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../routes/norms.routes').default;
  const app = express();
  app.use(express.json());
  app.use('/api/projects', router);
  return app;
}

const stageAReport = {
  projectId: 'p1',
  generatedAt: new Date().toISOString(),
  elementCount: 3,
  wizardElementCount: 1,
  assumedJurisdictions: ['EU'],
  signals: [],
  assessments: [],
  disclaimer: 'not legal advice',
};

const world = { referencedCorpusSources: new Set(), availableCorpusSources: new Set(), pipelineNormIds: new Set(), uploadTitles: [] };

describe('GET /:projectId/norms/applicability — discovery gating (THE-464 Task 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    mockBuildReport.mockResolvedValue(stageAReport);
    mockConfigured.mockReturnValue(true);
    mockListFindings.mockResolvedValue([]);
    mockLoadWorld.mockResolvedValue(world);
    mockMerge.mockImplementation((stageA: unknown) => stageA);
  });

  it('always includes a `discovery` envelope field reflecting flag/corpus/provider config', async () => {
    process.env.ANTHROPIC_API_KEY = 'key';
    mockConfigured.mockReturnValue(false);
    const res = await request(appWith('true')).get('/api/projects/p1/norms/applicability');
    expect(res.status).toBe(200);
    expect(res.body.discovery).toEqual({ enabled: true, corpusConfigured: false, providerConfigured: true });
  });

  it('discovery.enabled is false when the flag is unset (feature dark)', async () => {
    const res = await request(appWith(undefined)).get('/api/projects/p1/norms/applicability');
    expect(res.status).toBe(200);
    expect(res.body.discovery.enabled).toBe(false);
  });

  it('flag off: no findings merge is attempted (listFindings never called), bare stage-A report returned', async () => {
    const res = await request(appWith(undefined)).get('/api/projects/p1/norms/applicability');
    expect(res.status).toBe(200);
    expect(mockListFindings).not.toHaveBeenCalled();
    expect(mockMerge).not.toHaveBeenCalled();
    expect(res.body.data).toEqual(stageAReport);
  });

  it('flag on + a persisted finding: applicability response merges it in via a cheap Mongo-only read (Review-Fix 4) — no retrieval/LLM call', async () => {
    const finding = { family: 'ai-act', applies: true, status: 'auto', corpusVersionHash: 'H' };
    mockListFindings.mockResolvedValue([finding]);
    const mergedReport = { ...stageAReport, assessments: [{ ruleId: 'ai-act', provenance: 'corpus' }] };
    mockMerge.mockReturnValue(mergedReport);

    const res = await request(appWith('true')).get('/api/projects/p1/norms/applicability');

    expect(res.status).toBe(200);
    expect(mockListFindings).toHaveBeenCalledWith('p1');
    expect(mockMerge).toHaveBeenCalledWith(stageAReport, [finding], undefined, undefined, world);
    expect(res.body.data).toEqual(mergedReport);
    // No retrieval/LLM run — /discover is a separate, explicit user action.
    expect(mockDiscoverAndJudge).not.toHaveBeenCalled();
  });

  it('rejected findings are excluded from the persisted merge even if applies:true', async () => {
    const rejected = { family: 'nis2', applies: true, status: 'rejected', corpusVersionHash: 'H2' };
    const kept = { family: 'ai-act', applies: true, status: 'confirmed', corpusVersionHash: 'H' };
    mockListFindings.mockResolvedValue([rejected, kept]);

    await request(appWith('true')).get('/api/projects/p1/norms/applicability');

    expect(mockMerge).toHaveBeenCalledWith(stageAReport, [kept], undefined, undefined, world);
  });

  it('findings with applies:false are excluded from the persisted merge', async () => {
    const notApplicable = { family: 'nis2', applies: false, status: 'auto', corpusVersionHash: 'H2' };
    mockListFindings.mockResolvedValue([notApplicable]);

    await request(appWith('true')).get('/api/projects/p1/norms/applicability');

    expect(mockMerge).toHaveBeenCalledWith(stageAReport, [], undefined, undefined, world);
  });
});

describe('GET /:projectId/norms/discover/findings (THE-464 Task 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListFindings.mockResolvedValue([
      { family: 'ai-act', status: 'auto' },
      { family: 'nis2', status: 'rejected' },
    ]);
  });

  it('flag off ⇒ 404', async () => {
    const res = await request(appWith(undefined)).get('/api/projects/p1/norms/discover/findings');
    expect(res.status).toBe(404);
  });

  it('flag on ⇒ 200 + all findings (incl. rejected, for the "show rejected" toggle)', async () => {
    const res = await request(appWith('true')).get('/api/projects/p1/norms/discover/findings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((f: { status: string }) => f.status).sort()).toEqual(['auto', 'rejected']);
    expect(mockListFindings).toHaveBeenCalledWith('p1');
  });

  it('is registered before the :workId routes (never swallowed as a workId)', async () => {
    const res = await request(appWith('true')).get('/api/projects/p1/norms/discover/findings');
    // If :workId/mappings had matched instead, getNormMappings would run with workId='discover'
    // (a different mock path) — 200 with the findings shape proves the static route won.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
