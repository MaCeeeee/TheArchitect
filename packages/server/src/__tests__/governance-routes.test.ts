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
    severity: 'warning',
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
  return PolicyViolation.create({
    projectId: PROJECT_ID,
    policyId,
    elementId,
    elementName: elementId,
    field: 'description',
    severity: 'warning',
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
    const policy = await seedPolicy({ severity: 'error' });
    await seedViolation(policy._id, ELEMENT_A, { severity: 'error' });
    await seedViolation(policy._id, ELEMENT_B, { severity: 'warning' });

    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/violations`)
      .query({ severity: 'error' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].severity).toBe('error');
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
