// packages/server/src/__tests__/governance-routes.test.ts
// UC-GOV-001 — HTTP-Route Integration Tests for Violations API
// Closes Test 8 of THE-124 (manual curl tests → automated).
//
// Covers AC-3:
//   GET  /api/projects/:projectId/violations
//   GET  /api/projects/:projectId/violations?status=open|resolved
//   GET  /api/projects/:projectId/violations?severity=warning
//   GET  /api/projects/:projectId/violations/by-element/:elementId
//   POST /api/projects/:projectId/violations/re-evaluate

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// ─── Stub middleware before route import ────────────────────────────────────

const TEST_USER_ID = new mongoose.Types.ObjectId();

jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { _id: TEST_USER_ID, role: 'admin' };
    next();
  },
}));

jest.mock('../middleware/rbac.middleware', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../middleware/audit.middleware', () => ({
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Mock Neo4j + WebSocket + policy-graph service ──────────────────────────

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  runCypherTransaction: jest.fn().mockResolvedValue([]),
}));

jest.mock('../websocket/socketServer', () => ({
  getIO: jest.fn().mockReturnValue({
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  }),
}));

jest.mock('../services/policy-graph.service', () => ({
  syncPolicyToNeo4j: jest.fn().mockResolvedValue(undefined),
  syncPolicyInfluenceRelationships: jest.fn().mockResolvedValue(undefined),
  removePolicyFromNeo4j: jest.fn().mockResolvedValue(undefined),
  syncViolationToNeo4j: jest.fn().mockResolvedValue(undefined),
  removeViolationFromNeo4j: jest.fn().mockResolvedValue(undefined),
}));

// Now safe to import the router and models
// eslint-disable-next-line @typescript-eslint/no-var-requires
const governanceRouter = require('../routes/governance.routes').default;
import { Policy } from '../models/Policy';
import { PolicyViolation } from '../models/PolicyViolation';

// ─── Test app ───────────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;
let app: express.Application;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/projects', governanceRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Policy.deleteMany({});
  await PolicyViolation.deleteMany({});
});

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PROJECT_ID = new mongoose.Types.ObjectId();
const ELEMENT_A = 'element-a';
const ELEMENT_B = 'element-b';

async function seedPolicy(overrides: Partial<Record<string, unknown>> = {}) {
  return Policy.create({
    projectId: PROJECT_ID,
    name: 'Description Required',
    description: 'Every element needs a description',
    category: 'architecture',
    framework: 'TOGAF 10',
    severity: 'medium',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [{ field: 'description', operator: 'exists', value: true, message: 'Description required' }],
    createdBy: TEST_USER_ID,
    ...overrides,
  });
}

async function seedViolation(policyId: mongoose.Types.ObjectId, elementId: string, overrides: Partial<Record<string, unknown>> = {}) {
  // THE-442: ruleId ist Pflicht ohne Schema-Default — Fixtures setzen eine
  // explizite, aus dem effektiven field abgeleitete ruleId (überschreibbar).
  const field = (overrides.field as string) ?? 'description';
  return PolicyViolation.create({
    projectId: PROJECT_ID,
    policyId,
    elementId,
    elementName: elementId,
    field,
    ruleId: `r-test-${field}`,
    severity: 'medium',
    message: 'Description required',
    status: 'open',
    detectedAt: new Date(),
    ...overrides,
  });
}

// ─── Test 8.1: GET /violations ─────────────────────────────────────────────

describe('UC-GOV-001 Test 8.1: GET /:projectId/violations', () => {
  it('returns open violations by default', async () => {
    const policy = await seedPolicy();
    await seedViolation(policy._id, ELEMENT_A, { status: 'open' });
    await seedViolation(policy._id, ELEMENT_B, { status: 'resolved' });

    const res = await request(app).get(`/api/projects/${PROJECT_ID}/violations`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].elementId).toBe(ELEMENT_A);
    expect(res.body.data[0].status).toBe('open');
    expect(res.body.data[0].policyName).toBe('Description Required');
    expect(res.body.total).toBe(1);
  });

  it('filters by status=resolved', async () => {
    const policy = await seedPolicy();
    await seedViolation(policy._id, ELEMENT_A, { status: 'open' });
    await seedViolation(policy._id, ELEMENT_B, { status: 'resolved' });

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations`)
      .query({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].elementId).toBe(ELEMENT_B);
    expect(res.body.data[0].status).toBe('resolved');
  });

  it('filters by severity', async () => {
    const policy = await seedPolicy({ severity: 'high' });
    await seedViolation(policy._id, ELEMENT_A, { severity: 'high' });
    await seedViolation(policy._id, ELEMENT_B, { severity: 'medium' });

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations`)
      .query({ severity: 'high' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].severity).toBe('high');
  });

  it('supports limit + offset pagination', async () => {
    const policy = await seedPolicy();
    for (let i = 0; i < 5; i++) {
      await seedViolation(policy._id, `element-${i}`);
    }

    const page1 = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations`)
      .query({ limit: 2, offset: 0 });
    const page2 = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations`)
      .query({ limit: 2, offset: 2 });

    expect(page1.body.data).toHaveLength(2);
    expect(page2.body.data).toHaveLength(2);
    expect(page1.body.total).toBe(5);
    expect(page1.body.data[0].elementId).not.toBe(page2.body.data[0].elementId);
  });

  it('caps limit at 500', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations`)
      .query({ limit: 99999 });

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(500);
  });

  it('returns empty array for project with no violations', async () => {
    const res = await request(app).get(`/api/projects/${PROJECT_ID}/violations`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// ─── Test 8.2: GET /violations/by-element/:elementId ───────────────────────

describe('UC-GOV-001 Test 8.2: GET /:projectId/violations/by-element/:elementId', () => {
  it('returns only open violations for the requested element', async () => {
    const policy = await seedPolicy();
    await seedViolation(policy._id, ELEMENT_A, { status: 'open' });
    await seedViolation(policy._id, ELEMENT_A, { status: 'resolved', field: 'name' });
    await seedViolation(policy._id, ELEMENT_B, { status: 'open' });

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations/by-element/${ELEMENT_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].elementId).toBe(ELEMENT_A);
    expect(res.body.data[0].status).toBe('open');
    expect(res.body.data[0].policyName).toBe('Description Required');
  });

  it('returns empty array for element with no violations', async () => {
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations/by-element/non-existent`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ─── Test 8.3: POST /violations/re-evaluate ────────────────────────────────

describe('UC-GOV-001 Test 8.3: POST /:projectId/violations/re-evaluate', () => {
  it('iterates over all active+enabled policies and reports the count', async () => {
    await seedPolicy({ name: 'P1', status: 'active', enabled: true });
    await seedPolicy({ name: 'P2', status: 'active', enabled: true });
    await seedPolicy({ name: 'P3-draft', status: 'draft', enabled: true });
    await seedPolicy({ name: 'P4-disabled', status: 'active', enabled: false });

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/violations/re-evaluate`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Only P1 and P2 are active+enabled. Draft and disabled policies are skipped.
    expect(res.body.data.policiesEvaluated).toBe(2);
  });

  it('returns 0 when no active policies exist', async () => {
    await seedPolicy({ name: 'P-draft', status: 'draft' });

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/violations/re-evaluate`);

    expect(res.status).toBe(200);
    expect(res.body.data.policiesEvaluated).toBe(0);
  });
});

// ─── THE-442: POST/PUT policy write normalization ───────────────────────────

describe('THE-442: policy write normalization', () => {
  it('POST normalizes legacy severity and assigns ruleIds (with in-payload dedupe)', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/policies`)
      .send({
        name: 'Legacy Client Policy',
        category: 'architecture',
        severity: 'warning', // legacy → medium
        status: 'draft',     // draft: keine async Eval-Hooks
        rules: [
          { ruleId: 'r-dup', field: 'description', operator: 'exists', value: true, message: 'm1' },
          { ruleId: 'r-dup', field: 'name', operator: 'exists', value: true, message: 'm2' },
          { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'm3' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.severity).toBe('medium');
    const ruleIds = res.body.data.rules.map((r: { ruleId: string }) => r.ruleId);
    expect(ruleIds[0]).toBe('r-dup');     // mitgeschickte ruleId bleibt erhalten
    expect(ruleIds[1]).not.toBe('r-dup'); // In-Payload-Duplikat neu gewürfelt
    expect(ruleIds[2]).toMatch(/^r-/);    // fehlende ruleId serverseitig vergeben
    expect(new Set(ruleIds).size).toBe(3);
  });

  it('POST defaults missing severity to medium', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/policies`)
      .send({
        name: 'No Severity',
        category: 'architecture',
        status: 'draft',
        rules: [{ field: 'description', operator: 'exists', value: true, message: 'm' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.severity).toBe('medium');
  });

  it('PUT normalizes legacy severity, assigns ruleIds and bumps version', async () => {
    const policy = await seedPolicy({ status: 'draft' });

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/policies/${policy._id}`)
      .send({
        severity: 'error', // legacy → high
        rules: [{ field: 'maturity', operator: 'gte', value: 3, message: 'm' }], // ohne ruleId
      });

    expect(res.status).toBe(200);
    expect(res.body.data.severity).toBe('high');
    expect(res.body.data.rules[0].ruleId).toMatch(/^r-/);
    expect(res.body.data.version).toBe(2);
  });

  it('PUT rejects out-of-domain severity (runValidators backstop)', async () => {
    const policy = await seedPolicy({ status: 'draft' });

    const res = await request(app)
      .put(`/api/projects/${PROJECT_ID}/policies/${policy._id}`)
      .send({ severity: 'catastrophic' });

    expect(res.status).toBe(500);

    const unchanged = await Policy.findById(policy._id);
    expect(unchanged!.severity).toBe('medium');
  });
});
