/**
 * Security-Audit H2 (standards): Lesen (inkl. `fullText`), Löschen samt
 * Kaskade, Mapping-Löschen und das Erzeugen einer Audit-Checkliste aus einem
 * Standard liefen nur über die `_id` — quer über alle Mandanten.
 */
import express from 'express';
import request from 'supertest';
import { fakeScopedModel } from './helpers/fakeScopedModel';

const MINE = 'p-attacker';
const VICTIM = 'p-victim';

const mockStandards = fakeScopedModel([]);
const mockMappings = fakeScopedModel([]);
const mockPipelineStates = fakeScopedModel([]);
const mockChecklistCreate = jest.fn(async (doc: Record<string, unknown>) => ({ _id: 'cl-1', ...doc }));

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
jest.mock('../models/Standard', () => ({ Standard: mockStandards }));
jest.mock('../models/StandardMapping', () => ({ StandardMapping: mockMappings }));
jest.mock('../models/CompliancePipelineState', () => ({ CompliancePipelineState: mockPipelineStates }));
jest.mock('../models/AuditChecklist', () => ({ AuditChecklist: { create: (d: Record<string, unknown>) => mockChecklistCreate(d) } }));
jest.mock('../models/Policy', () => ({ Policy: {}, ensureRuleIds: (r: unknown) => r }));
jest.mock('../services/compliance-pipeline.service', () => ({
  getOrCreatePipelineState: jest.fn(),
  refreshMappingStats: jest.fn(async () => undefined),
}));
jest.mock('../services/norm.service', () => ({}));
jest.mock('../services/ai.service', () => ({}));
jest.mock('../services/complianceMapping.service', () => ({}));
jest.mock('../services/complianceElements.service', () => ({}));
jest.mock('../services/policy-to-requirement.service', () => ({}));
jest.mock('../config/neo4j', () => ({ runCypher: jest.fn(async () => []), serializeNeo4jProperties: (x: unknown) => x }));

import standardsRoutes from '../routes/standards.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', standardsRoutes);
  return app;
}

describe('standards — Mandantentrennung (Security-Audit H2)', () => {
  beforeEach(() => {
    mockChecklistCreate.mockClear();
    mockStandards.reset([
      { _id: 'std-victim', projectId: VICTIM, name: 'Victim ISMS', fullText: 'SECRET', sections: [{ number: '1', title: 'S' }] },
      { _id: 'std-mine', projectId: MINE, name: 'Mine', fullText: 'ok', sections: [] },
    ]);
    mockMappings.reset([{ _id: 'map-victim', projectId: VICTIM, standardId: 'std-victim' }]);
  });

  it('does not return another tenant’s standard (incl. fullText)', async () => {
    const res = await request(makeApp()).get(`/api/projects/${MINE}/standards/std-victim`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });

  it('does not delete another tenant’s standard nor cascade into its mappings', async () => {
    const res = await request(makeApp()).delete(`/api/projects/${MINE}/standards/std-victim`);
    expect(res.status).toBe(404);
    expect(mockStandards.all().map((d) => d._id)).toContain('std-victim');
    expect(mockMappings.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({ standardId: 'std-victim' }));
  });

  it('does not delete another tenant’s mapping', async () => {
    await request(makeApp()).delete(`/api/projects/${MINE}/standards/std-victim/mappings/map-victim`);
    expect(mockMappings.all().map((d) => d._id)).toContain('map-victim');
  });

  it('does not build an audit checklist from another tenant’s standard', async () => {
    const res = await request(makeApp())
      .post(`/api/projects/${MINE}/standards/audit-checklists`)
      .send({ standardId: 'std-victim', name: 'steal', targetDate: '2027-01-01' });
    expect(res.status).toBe(404);
    expect(mockChecklistCreate).not.toHaveBeenCalled();
  });

  it('still serves and deletes my own standard', async () => {
    const app = makeApp();
    expect((await request(app).get(`/api/projects/${MINE}/standards/std-mine`)).status).toBe(200);
    expect((await request(app).delete(`/api/projects/${MINE}/standards/std-mine`)).status).toBe(200);
    expect(mockStandards.all().map((d) => d._id)).not.toContain('std-mine');
  });
});
