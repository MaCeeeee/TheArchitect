/**
 * UC-PLATEAU-001 / REQ-PLATEAU-002 — PATCH endpoint Supertest
 *
 * Covers the safety-critical paths of:
 * PATCH /api/projects/:projectId/roadmaps/:roadmapId/waves/:waveNumber/elements/:elementId/implementation
 *
 * - Toggle true → 200 + implementedAt set
 * - Toggle false → 200 + implementedAt null
 * - Idempotent: double-toggle does NOT create duplicate audit entries
 * - 400 invalid body
 * - 404 unknown roadmap / wave / element
 *
 * Run: cd packages/server && npx jest src/__tests__/roadmap-mark-implementation.routes.test.ts --forceExit
 */

import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const TEST_USER_ID = new mongoose.Types.ObjectId();

// ─── Stub middleware before route import ────────────────────────────────────

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

// ─── Mock Neo4j (not used by this endpoint but the routes module imports it) ─

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  runCypherTransaction: jest.fn().mockResolvedValue([]),
}));

// Mock roadmap.service.ts to avoid pulling in the full Anthropic-loaded
// dependency tree just to register the router.
jest.mock('../services/roadmap.service', () => ({
  generateRoadmap: jest.fn(),
  previewCandidates: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const roadmapRouter = require('../routes/roadmap.routes').default;
import { TransformationRoadmap } from '../models/TransformationRoadmap';
import { AuditLog } from '../models/AuditLog';

let mongod: MongoMemoryServer;
let app: express.Application;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  app = express();
  app.use(express.json());
  app.use('/api/projects', roadmapRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await TransformationRoadmap.deleteMany({});
  await AuditLog.deleteMany({});
});

const PROJECT_ID = new mongoose.Types.ObjectId();
const ELEMENT_ID = 'element-test-001';

async function seedRoadmap(): Promise<string> {
  const doc = await TransformationRoadmap.create({
    projectId: PROJECT_ID,
    createdBy: TEST_USER_ID,
    name: 'Test Roadmap',
    status: 'completed',
    config: { strategy: 'balanced', maxWaves: 4, targetStates: {}, includeAIRecommendations: false },
    waves: [
      {
        waveNumber: 1,
        name: 'Foundation',
        description: 'first wave',
        elements: [
          {
            elementId: ELEMENT_ID,
            name: 'Test Element',
            type: 'application_component',
            layer: 'application',
            currentStatus: 'target',
            targetStatus: 'current',
            riskScore: 30,
            estimatedCost: 50000,
            stakeholderFatigue: 0.2,
            dependsOnElementIds: [],
          },
        ],
        metrics: {
          totalCost: 50000,
          riskDelta: -1,
          complianceImpact: 0,
          avgFatigue: 0.2,
          elementCount: 1,
        },
        dependsOnWaves: [],
        estimatedDurationMonths: 3,
      },
    ],
    summary: null,
    advisorInsightsAddressed: [],
    version: 1,
  });
  return doc._id.toString();
}

describe('PATCH wave-element implementation (REQ-PLATEAU-002)', () => {
  describe('happy path', () => {
    it('toggle true → 200 with implementedAt set + audit-log entry', async () => {
      const roadmapId = await seedRoadmap();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.changed).toBe(true);
      expect(res.body.data.element.implementedAt).toBeTruthy();
      expect(res.body.data.element.implementedBy).toBe(TEST_USER_ID.toString());
      expect(res.body.data.plateauProgress).toEqual({ total: 1, implemented: 1, percent: 100 });

      const audits = await AuditLog.find({ action: 'mark_implementation' });
      expect(audits.length).toBe(1);
    });

    it('toggle false after true → implementedAt null', async () => {
      const roadmapId = await seedRoadmap();
      await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true });

      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: false });

      expect(res.status).toBe(200);
      expect(res.body.data.element.implementedAt).toBeNull();
      expect(res.body.data.plateauProgress.percent).toBe(0);
    });

    it('persists note when provided', async () => {
      const roadmapId = await seedRoadmap();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true, note: 'Released to production 2026-05-07' });

      expect(res.status).toBe(200);
      expect(res.body.data.element.implementationNote).toBe('Released to production 2026-05-07');
    });
  });

  describe('idempotency', () => {
    it('double-toggle with same value is a no-op (no second audit entry)', async () => {
      const roadmapId = await seedRoadmap();
      await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true });

      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true });

      expect(res.status).toBe(200);
      expect(res.body.changed).toBe(false);

      const audits = await AuditLog.find({ action: 'mark_implementation' });
      expect(audits.length).toBe(1); // not 2
    });

    it('toggling unimplemented to false (default) is also a no-op', async () => {
      const roadmapId = await seedRoadmap();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: false });

      expect(res.status).toBe(200);
      expect(res.body.changed).toBe(false);
      const audits = await AuditLog.find({ action: 'mark_implementation' });
      expect(audits.length).toBe(0);
    });
  });

  describe('error cases', () => {
    it('400 on invalid body (missing implemented)', async () => {
      const roadmapId = await seedRoadmap();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('400 on invalid waveNumber (non-numeric)', async () => {
      const roadmapId = await seedRoadmap();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/abc/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true });
      expect(res.status).toBe(400);
    });

    it('404 on unknown roadmap', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${fakeId}/waves/1/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true });
      expect(res.status).toBe(404);
    });

    it('404 on unknown wave-number within existing roadmap', async () => {
      const roadmapId = await seedRoadmap();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/99/elements/${ELEMENT_ID}/implementation`)
        .send({ implemented: true });
      expect(res.status).toBe(404);
    });

    it('404 on unknown element-id within existing wave', async () => {
      const roadmapId = await seedRoadmap();
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/roadmaps/${roadmapId}/waves/1/elements/nonexistent/implementation`)
        .send({ implemented: true });
      expect(res.status).toBe(404);
    });
  });
});
