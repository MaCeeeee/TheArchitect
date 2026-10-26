/**
 * Security-Audit H2 (roadmaps, reports): `requireProjectAccess` prüft
 * `:projectId`, die Handler laden die Sub-Ressource dann aber nur per `_id`.
 * Wer Zugriff auf IRGENDEIN Projekt hat, las, benannte um und löschte so die
 * Roadmaps — und zog die PDF-Berichte — jedes anderen Mandanten.
 */
import express from 'express';
import request from 'supertest';
import { fakeScopedModel } from './helpers/fakeScopedModel';

const MINE = 'p-attacker';
const VICTIM = 'p-victim';

const mockRoadmaps = fakeScopedModel([]);
const mockRuns = fakeScopedModel([]);
const mockAssessments = fakeScopedModel([]);
const seedRoadmaps = () =>
  mockRoadmaps.reset([
    { _id: 'rm-victim', projectId: VICTIM, createdBy: 'u-victim', name: 'Victim roadmap', waves: [], summary: {}, version: 1 },
    { _id: 'rm-mine', projectId: MINE, createdBy: 'u-attacker', name: 'My roadmap', waves: [], summary: {}, version: 1 },
  ]);

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { _id: 'u-attacker', role: 'enterprise_architect' };
    next();
  },
}));
jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../middleware/audit.middleware', () => ({ createAuditEntry: jest.fn(async () => undefined) }));
jest.mock('../services/roadmap.service', () => ({ generateRoadmap: jest.fn(), previewCandidates: jest.fn() }));
jest.mock('../models/CompliancePipelineState', () => ({ CompliancePipelineState: {} }));
jest.mock('../models/TransformationRoadmap', () => ({ TransformationRoadmap: mockRoadmaps }));
jest.mock('../models/SimulationRun', () => ({ SimulationRun: mockRuns }));
jest.mock('../models/OracleAssessment', () => ({ OracleAssessment: mockAssessments }));
jest.mock('../models/Project', () => ({
  Project: { findById: () => ({ lean: async () => ({ _id: 'p-attacker', name: 'Mine' }) }) },
}));
jest.mock('../services/xray.service', () => ({}));
jest.mock('../services/analytics.service', () => ({}));
jest.mock('../services/compliance.service', () => ({}));
jest.mock('../config/neo4j', () => ({ runCypher: jest.fn(async () => []) }));

import roadmapRoutes from '../routes/roadmap.routes';
import { generateReport } from '../services/report.service';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', roadmapRoutes);
  return app;
}

describe('roadmaps — Mandantentrennung (Security-Audit H2)', () => {
  beforeEach(seedRoadmaps);

  it('does not read another tenant’s roadmap through my project', async () => {
    const res = await request(makeApp()).get(`/api/projects/${MINE}/roadmaps/rm-victim`);
    expect(res.status).toBe(404);
  });

  it('does not rename another tenant’s roadmap', async () => {
    const res = await request(makeApp()).patch(`/api/projects/${MINE}/roadmaps/rm-victim`).send({ name: 'pwned' });
    expect(res.status).toBe(404);
    expect(mockRoadmaps.all().find((d) => d._id === 'rm-victim')?.name).toBe('Victim roadmap');
  });

  it('does not DELETE another tenant’s roadmap — der ganze Zweck', async () => {
    const res = await request(makeApp()).delete(`/api/projects/${MINE}/roadmaps/rm-victim`);
    expect(res.status).toBe(404);
    expect(mockRoadmaps.all().map((d) => d._id)).toContain('rm-victim');
  });

  it('still serves, renames and deletes my own roadmap', async () => {
    const app = makeApp();
    expect((await request(app).get(`/api/projects/${MINE}/roadmaps/rm-mine`)).status).toBe(200);
    expect((await request(app).patch(`/api/projects/${MINE}/roadmaps/rm-mine`).send({ name: 'Renamed' })).status).toBe(200);
    expect((await request(app).delete(`/api/projects/${MINE}/roadmaps/rm-mine`)).status).toBe(200);
    expect(mockRoadmaps.all().map((d) => d._id)).not.toContain('rm-mine');
  });
});

describe('generateReport — Mandantentrennung (Security-Audit H2)', () => {
  beforeEach(() => {
    seedRoadmaps();
    mockRuns.reset([{ _id: 'run-victim', projectId: VICTIM, status: 'completed', result: {} }]);
    mockAssessments.reset([{ _id: 'oa-victim', projectId: VICTIM, verdict: {}, proposal: {} }]);
  });

  it('refuses a roadmap PDF for a roadmap of another project', async () => {
    await expect(generateReport(MINE, 'roadmap', { roadmapId: 'rm-victim' })).rejects.toThrow(/not found/i);
  });

  it('refuses a simulation PDF for a run of another project', async () => {
    await expect(generateReport(MINE, 'simulation', { runId: 'run-victim' })).rejects.toThrow(/not found/i);
  });

  it('refuses an oracle PDF for an assessment of another project', async () => {
    await expect(generateReport(MINE, 'oracle', { assessmentId: 'oa-victim' })).rejects.toThrow(/not found/i);
  });
});
