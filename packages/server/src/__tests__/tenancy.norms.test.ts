/**
 * Security-Audit H3: `norms.routes` hatte nur `router.use(authenticate)`.
 * Acht `:projectId`-Endpunkte (sieben Reads, ein Write) waren damit für JEDEN
 * angemeldeten Nutzer erreichbar, ganz ohne Mitgliedschaft — inklusive
 * Volltext von Norm-Sections und Schreiben in die Pipeline fremder Projekte.
 * Hier läuft das ECHTE `requireProjectAccess`; nur Daten sind gedoublet.
 */
import express from 'express';
import request from 'supertest';

const STRANGER = '507f1f77bcf86cd799439033';
const VICTIM_PROJECT = {
  _id: 'p-victim',
  ownerId: { toString: () => '507f1f77bcf86cd799439011' },
  collaborators: [],
  legalProfile: {},
};

const mockStandardMappingFind = jest.fn(async () => []);

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { _id: { toString: () => STRANGER }, role: 'enterprise_architect' };
    next();
  },
}));
jest.mock('../models/Project', () => ({
  Project: {
    findById: () => Object.assign(Promise.resolve(VICTIM_PROJECT), { lean: async () => VICTIM_PROJECT, select: () => ({ lean: async () => VICTIM_PROJECT }) }),
  },
}));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn(async () => undefined) }));
jest.mock('../services/norm.service', () => ({
  listNorms: jest.fn(async () => [{ workId: 'corpus:x' }]),
  getNorm: jest.fn(async () => ({ workId: 'corpus:x' })),
  getNormSection: jest.fn(async () => ({ text: 'SECTION FULL TEXT' })),
  getNormMappings: jest.fn(async () => []),
  listAvailableCorpusNorms: jest.fn(async () => []),
  computeRemediationScope: jest.fn(async () => ({ open: 1 })),
}));
jest.mock('../services/corpusClient.service', () => ({ isCorpusConfigured: () => false, listTypingSummaries: jest.fn(async () => []) }));
jest.mock('../services/compliance-pipeline.service', () => ({ refreshMappingStats: jest.fn(async () => ({ stage: 'x' })) }));
jest.mock('../services/regulationApplicability.service', () => ({
  buildApplicabilityReport: jest.fn(() => ({})),
  loadNormWorldState: jest.fn(async () => ({})),
}));
jest.mock('../services/legalApplicability.service', () => ({ buildProjectLegalApplicability: jest.fn(async () => ({})) }));
jest.mock('../services/lawDiscovery.service', () => ({ discoverAndJudge: jest.fn() }));
jest.mock('../services/lawDiscoveryFinding.service', () => ({ setFindingStatus: jest.fn(), listFindings: jest.fn(async () => []) }));
jest.mock('../services/lawApplicabilityMerge.service', () => ({ mergeApplicability: jest.fn(() => ({})) }));
jest.mock('../models/StandardMapping', () => ({ StandardMapping: { find: mockStandardMappingFind } }));

import normsRoutes from '../routes/norms.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', normsRoutes);
  return app;
}

describe('norms — Projektzugriff (Security-Audit H3)', () => {
  const prev = process.env.LAW_DISCOVERY_ENABLED;
  beforeAll(() => {
    process.env.LAW_DISCOVERY_ENABLED = 'true';
  });
  afterAll(() => {
    process.env.LAW_DISCOVERY_ENABLED = prev;
  });

  it.each([
    ['get', '/api/projects/p-victim/norms'],
    ['get', '/api/projects/p-victim/norms/applicability'],
    ['get', '/api/projects/p-victim/norms/legal-applicability'],
    ['get', '/api/projects/p-victim/norms/discover/findings'],
    ['get', '/api/projects/p-victim/norms/corpus:x/sections/art_1'],
    ['get', '/api/projects/p-victim/norms/corpus:x/mappings'],
    ['get', '/api/projects/p-victim/norms/corpus:x/remediation-scope'],
    ['post', '/api/projects/p-victim/norms/corpus:x/pipeline'],
  ] as const)('DENIES %s %s to a non-member', async (method, url) => {
    const res = await request(makeApp())[method](url).send({});
    expect(res.status).toBe(403);
  });
});

describe('getNormMappings upload: branch (Security-Audit H3)', () => {
  it('filters the mappings of an uploaded standard by project', async () => {
    const real = jest.requireActual('../services/norm.service') as typeof import('../services/norm.service');
    await real.getNormMappings('507f1f77bcf86cd799439044', 'upload:507f1f77bcf86cd799439055');
    expect(mockStandardMappingFind).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: expect.anything() }),
    );
  });
});
