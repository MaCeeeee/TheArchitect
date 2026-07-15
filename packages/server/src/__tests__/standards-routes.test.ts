// packages/server/src/__tests__/standards-routes.test.ts
// THE-442 — HTTP-Route Integration Tests for the approve-policies write boundary.
//
// standards.routes.ts POST /:projectId/standards/:standardId/approve-policies is a
// THIRD Policy write boundary (next to governance POST/PUT). It must enforce the
// same THE-442 invariants:
//   AC-3: per-policy-unique ruleId (in-payload duplicates re-rolled) — duplicates
//         would later upsert into the SAME violation document (policyId, elementId,
//         ruleId unique index → silent last-write-wins, one rule permanently masked).
//   Severity domain: legacy error/warning/info mapped, valid new-domain kept,
//         out-of-domain LLM junk clamped to 'medium' (one junk draft must not 500
//         the whole approve batch at insertMany).
//   enforcementLevel: always persisted as 'advisory' — human escalation only.
//
// Mirrors governance-routes.test.ts ("POST normalizes legacy severity and assigns
// ruleIds (with in-payload dedupe)").

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

// ─── Stub heavy service dependencies of standards.routes ────────────────────
// Only Policy persistence (real mongoose model) is under test here.

jest.mock('../services/standards.service', () => ({
  parseAndStore: jest.fn(),
  getStandards: jest.fn(),
  getStandard: jest.fn(),
  deleteStandard: jest.fn(),
  getMappings: jest.fn(),
  getMappingMatrix: jest.fn(),
  upsertMapping: jest.fn(),
  bulkCreateMappings: jest.fn(),
  deleteMapping: jest.fn(),
}));

jest.mock('../services/ai.service', () => ({
  generateMappingSuggestions: jest.fn(),
  validateConfidence: jest.fn(),
  generatePoliciesFromStandard: jest.fn(),
  suggestMissingElements: jest.fn(),
}));

jest.mock('../services/norm.service', () => ({
  getPipelineNorm: jest.fn().mockResolvedValue(null),
  getNorm: jest.fn(),
  derivePipelineAnchorId: jest.fn(),
}));

jest.mock('../services/complianceMapping.service', () => ({
  mapRegulationsBatch: jest.fn(),
}));

jest.mock('../services/complianceElements.service', () => ({
  loadProjectCandidateElements: jest.fn(),
}));

jest.mock('../services/compliance-pipeline.service', () => ({
  getOrCreatePipelineState: jest.fn(),
  refreshMappingStats: jest.fn(),
  refreshPolicyStats: jest.fn().mockResolvedValue({}),
  getPipelineStatus: jest.fn(),
  getPortfolioOverview: jest.fn(),
  captureComplianceSnapshot: jest.fn(),
  getComplianceSnapshots: jest.fn(),
}));

jest.mock('../services/policy-to-requirement.service', () => ({
  findMatchingDriver: jest.fn().mockResolvedValue(null),
  projectPoliciesAsRequirements: jest.fn().mockResolvedValue({ created: 0, skipped: 0 }),
}));

// Now safe to import the router and models
// eslint-disable-next-line @typescript-eslint/no-var-requires
const standardsRouter = require('../routes/standards.routes').default;
import { Policy } from '../models/Policy';

// ─── Test app ───────────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;
let app: express.Application;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/projects', standardsRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Policy.deleteMany({});
});

const PROJECT_ID = new mongoose.Types.ObjectId();
const STANDARD_ID = new mongoose.Types.ObjectId();

function approvePath(): string {
  return `/api/projects/${PROJECT_ID}/standards/${STANDARD_ID}/approve-policies`;
}

// ─── THE-442: approve-policies write normalization ───────────────────────────

describe('THE-442: approve-policies write normalization', () => {
  it('dedupes in-payload duplicate ruleIds and normalizes legacy severity (AC-3)', async () => {
    const res = await request(app)
      .post(approvePath())
      .send({
        approved: [
          {
            name: 'Duplicate Rule Draft',
            description: 'LLM draft whose client sent duplicate ruleIds',
            severity: 'error', // legacy → high
            scope: { domains: [], elementTypes: [], layers: [] },
            rules: [
              { ruleId: 'r-dup', field: 'description', operator: 'exists', value: true, message: 'm1' },
              { ruleId: 'r-dup', field: 'name', operator: 'exists', value: true, message: 'm2' },
              { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'm3' },
            ],
            sourceSection: '4.1',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);

    const persisted = await Policy.findOne({ projectId: PROJECT_ID, name: 'Duplicate Rule Draft' }).lean();
    expect(persisted).toBeTruthy();

    const ruleIds = persisted!.rules.map((r: { ruleId?: string }) => r.ruleId);
    expect(ruleIds[0]).toBe('r-dup');     // mitgeschickte ruleId bleibt erhalten
    expect(ruleIds[1]).not.toBe('r-dup'); // In-Payload-Duplikat neu gewürfelt
    expect(ruleIds[2]).toMatch(/^r-/);    // fehlende ruleId serverseitig vergeben
    expect(new Set(ruleIds).size).toBe(3); // AC-3: je Policy eindeutige ruleId

    expect(persisted!.severity).toBe('high');            // legacy error → high
    expect(persisted!.enforcementLevel).toBe('advisory'); // human escalation only
  });

  it('clamps out-of-domain LLM severity to medium without failing the batch', async () => {
    const res = await request(app)
      .post(approvePath())
      .send({
        approved: [
          {
            name: 'Junk Severity Draft',
            description: 'LLM ignored the instruction and invented a severity',
            severity: 'severe', // out-of-domain junk → clamp to medium (pre-fix: 500 for the WHOLE batch)
            scope: { domains: [], elementTypes: [], layers: [] },
            rules: [{ field: 'description', operator: 'exists', value: true, message: 'm' }],
            sourceSection: '1.2',
          },
          {
            name: 'Valid Critical Draft',
            description: 'Valid new-domain severity must be kept, not clamped',
            severity: 'critical',
            scope: { domains: [], elementTypes: [], layers: [] },
            rules: [{ field: 'status', operator: 'not_equals', value: 'retired', message: 'm' }],
            sourceSection: '1.3',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);

    const junk = await Policy.findOne({ projectId: PROJECT_ID, name: 'Junk Severity Draft' }).lean();
    expect(junk!.severity).toBe('medium'); // junk → medium, batch survives

    const valid = await Policy.findOne({ projectId: PROJECT_ID, name: 'Valid Critical Draft' }).lean();
    expect(valid!.severity).toBe('critical'); // valid new-domain value kept
  });

  it('defaults missing severity to medium', async () => {
    const res = await request(app)
      .post(approvePath())
      .send({
        approved: [
          {
            name: 'No Severity Draft',
            description: 'Draft without severity',
            scope: { domains: [], elementTypes: [], layers: [] },
            rules: [{ field: 'description', operator: 'exists', value: true, message: 'm' }],
            sourceSection: '2.0',
          },
        ],
      });

    expect(res.status).toBe(201);
    const persisted = await Policy.findOne({ projectId: PROJECT_ID, name: 'No Severity Draft' }).lean();
    expect(persisted!.severity).toBe('medium');
    expect(persisted!.enforcementLevel).toBe('advisory');
  });
});
