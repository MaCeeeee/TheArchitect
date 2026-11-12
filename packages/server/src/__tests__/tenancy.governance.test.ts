/**
 * Security-Audit H2 + H5 (policies): `PUT/DELETE /:projectId/policies/:policyId`
 * luden die Policy nur per `_id` (H2), und PUT spreizte `{...req.body}` in das
 * Update (H5). `projectId` ist ein beschreibbarer Schema-Pfad — ein Body
 * `{"projectId":"<mine>"}` zog die Policy eines anderen Mandanten ins eigene
 * Projekt. DELETE archivierte sie und löste ihre offenen Verstöße auf.
 */
import express from 'express';
import request from 'supertest';
import { fakeScopedModel } from './helpers/fakeScopedModel';

const MINE = 'p-attacker';
const VICTIM = 'p-victim';

const mockPolicies = fakeScopedModel([]);
const mockApprovals = fakeScopedModel([]);
const mockViolationsUpdate = jest.fn(async () => ({ modifiedCount: 0 }));

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
jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../models/Policy', () => ({ Policy: mockPolicies, ensureRuleIds: (r: unknown) => r }));
jest.mock('../models/ApprovalRequest', () => ({ ApprovalRequest: mockApprovals }));
jest.mock('../models/PolicyViolation', () => ({ PolicyViolation: { updateMany: mockViolationsUpdate } }));
jest.mock('../models/AuditLog', () => ({ AuditLog: {} }));
jest.mock('../services/policy-evaluation.service', () => ({
  evaluateAllForPolicy: jest.fn(async () => undefined),
  cleanupCompliancePolicySelfViolations: jest.fn(),
  runAndPersistComplianceCheck: jest.fn(),
}));
jest.mock('../services/policy-graph.service', () => ({
  syncPolicyToNeo4j: jest.fn(async () => undefined),
  syncPolicyInfluenceRelationships: jest.fn(async () => undefined),
  removePolicyFromNeo4j: jest.fn(async () => undefined),
}));

import governanceRoutes from '../routes/governance.routes';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', governanceRoutes);
  return app;
}

const victimPolicy = () => mockPolicies.all().find((d) => d._id === 'pol-victim');

describe('policies — Mandantentrennung (Security-Audit H2)', () => {
  beforeEach(() => {
    mockViolationsUpdate.mockClear();
    mockPolicies.reset([
      { _id: 'pol-victim', projectId: VICTIM, name: 'Victim policy', status: 'active', enabled: true },
      { _id: 'pol-mine', projectId: MINE, name: 'My policy', status: 'active', enabled: true },
    ]);
  });

  it('does not update another tenant’s policy through my project', async () => {
    const res = await request(makeApp()).put(`/api/projects/${MINE}/policies/pol-victim`).send({ enabled: false });
    expect(res.status).toBe(404);
    expect(victimPolicy()?.enabled).toBe(true);
  });

  it('does not archive another tenant’s policy nor resolve its violations', async () => {
    const res = await request(makeApp()).delete(`/api/projects/${MINE}/policies/pol-victim`);
    expect(res.status).toBe(404);
    expect(victimPolicy()?.status).toBe('active');
    expect(mockViolationsUpdate).not.toHaveBeenCalled();
  });

  it('still updates and archives my own policy', async () => {
    const app = makeApp();
    expect((await request(app).put(`/api/projects/${MINE}/policies/pol-mine`).send({ name: 'Renamed' })).status).toBe(200);
    expect((await request(app).delete(`/api/projects/${MINE}/policies/pol-mine`)).status).toBe(200);
  });
});

describe('policies — Mass Assignment (Security-Audit H5)', () => {
  beforeEach(() =>
    mockPolicies.reset([
      { _id: 'pol-mine', projectId: MINE, name: 'My policy', version: 1, createdBy: 'u-attacker' },
      { _id: 'pol-victim', projectId: VICTIM, name: 'Victim policy', version: 1, createdBy: 'u-victim' },
    ]),
  );

  it('ignores projectId in the body — keine Umhängung in ein anderes Projekt', async () => {
    const res = await request(makeApp())
      .put(`/api/projects/${MINE}/policies/pol-mine`)
      .send({ name: 'ok', projectId: VICTIM, createdBy: 'u-victim', _id: 'pol-x' });
    expect(res.status).toBe(200);
    const mine = mockPolicies.all().find((d) => d._id === 'pol-mine');
    expect(mine?.projectId).toBe(MINE);
    expect(mine?.createdBy).toBe('u-attacker');
    expect(mine?.name).toBe('ok');
  });

  it('re-parenting a victim policy into my project fails — H2 und H5 zusammen', async () => {
    const res = await request(makeApp())
      .put(`/api/projects/${MINE}/policies/pol-victim`)
      .send({ projectId: MINE });
    expect(res.status).toBe(404);
    expect(victimPolicy()?.projectId).toBe(VICTIM);
  });

  it('drops Mongo update operators from the body', async () => {
    await request(makeApp())
      .put(`/api/projects/${MINE}/policies/pol-mine`)
      .send({ $set: { projectId: VICTIM }, $unset: { rules: 1 } });
    const update = mockPolicies.findOneAndUpdate.mock.calls.at(-1)?.[1] ?? mockPolicies.findByIdAndUpdate.mock.calls.at(-1)?.[1];
    expect(update?.$set).toBeUndefined();
    expect(update?.$unset).toBeUndefined();
    expect(mockPolicies.all().find((d) => d._id === 'pol-mine')?.projectId).toBe(MINE);
  });
});

describe('approvals — Mandantentrennung (Security-Audit H2)', () => {
  beforeEach(() =>
    mockApprovals.reset([
      { _id: 'ap-victim', projectId: VICTIM, requesterId: 'u-attacker', status: 'pending', steps: [], currentStep: 0, save: jest.fn() },
    ]),
  );

  it('does not cancel an approval of another project through my project', async () => {
    const res = await request(makeApp()).put(`/api/projects/${MINE}/approvals/ap-victim/cancel`);
    expect(res.status).toBe(404);
  });
});
