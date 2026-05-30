/**
 * Requirements Routes Tests — REQ-REQGEN-001.3 (THE-304 Backend-Anteil)
 *
 * Verifies the 6 UC-REQGEN-001 endpoints:
 *   POST   /:projectId/requirements/generate    (preview, kein persist)
 *   POST   /:projectId/requirements             (confirm, persist)
 *   GET    /:projectId/requirements             (list mit Filter)
 *   GET    /:projectId/requirements/by-element/:elementId
 *   PATCH  /:projectId/requirements/:id
 *   DELETE /:projectId/requirements/:id
 *
 * Pattern: compliance.routes.test.ts
 *
 * Run: cd packages/server && npx jest src/__tests__/requirements.routes.test.ts --verbose
 */
import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Regulation } from '../models/Regulation';
import { ComplianceRequirement } from '../models/ComplianceRequirement';

// ─── Middleware stubs ─────────────────────────────────────────
jest.mock('../middleware/auth.middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { _id: new mongoose.Types.ObjectId('507f191e810c19729de860ea') };
    next();
  },
}));

jest.mock('../middleware/projectAccess.middleware', () => ({
  requireProjectAccess: () => (_req: any, _res: any, next: any) => next(),
}));

const auditEntrySpy = jest.fn().mockResolvedValue(undefined);
jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: (...args: unknown[]) => auditEntrySpy(...args),
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Service stubs (no Neo4j, no Anthropic in tests) ─────────
const loadCandidatesMock = jest.fn();
jest.mock('../services/complianceElements.service', () => ({
  loadProjectCandidateElements: (...args: unknown[]) => loadCandidatesMock(...args),
  normalizeElementType: (t: string) => t,
}));

const generateRequirementsMock = jest.fn();
const RequirementGeneratorErrorReal = class extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequirementGeneratorError';
  }
};
jest.mock('../services/requirementGenerator.service', () => ({
  generateRequirementsFromText: (...args: unknown[]) => generateRequirementsMock(...args),
  RequirementGeneratorError: RequirementGeneratorErrorReal,
}));

// Import AFTER mocks
import requirementsRoutes from '../routes/requirements.routes';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_PROJECT_ID = '507f1f77bcf86cd799439099';
const USER_ID = '507f191e810c19729de860ea';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', requirementsRoutes);
  return app;
}

const baseReg = (projectId: string, overrides: Record<string, unknown> = {}) => ({
  projectId: new mongoose.Types.ObjectId(projectId),
  title: 'Test Regulation',
  fullText: 'a'.repeat(60),
  sourceUrl: 'https://example.org',
  effectiveFrom: new Date('2024-01-01'),
  language: 'de' as const,
  jurisdiction: 'DE',
  source: 'lksg',
  paragraphNumber: '§ 6',
  ...overrides,
});

describe('Requirements Routes (UC-REQGEN-001 / THE-304)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Regulation.ensureIndexes();
    await ComplianceRequirement.ensureIndexes();
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
    await ComplianceRequirement.deleteMany({});
    loadCandidatesMock.mockReset();
    generateRequirementsMock.mockReset();
    auditEntrySpy.mockClear();
  });

  // ────────────────────────────────────────────────────────
  // POST /:projectId/requirements/generate (preview)
  // ────────────────────────────────────────────────────────
  describe('POST /:projectId/requirements/generate', () => {
    it('rejects invalid projectId', async () => {
      const res = await request(app)
        .post('/api/projects/not-an-id/requirements/generate')
        .send({ text: 'a'.repeat(40) });
      expect(res.status).toBe(400);
    });

    it('rejects text < 20 chars', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ text: 'too short' });
      expect(res.status).toBe(400);
    });

    it('returns LLM candidates without persisting', async () => {
      loadCandidatesMock.mockResolvedValue([
        { id: 'cap-1', name: 'Supplier Mgmt', type: 'capability' },
      ]);
      generateRequirementsMock.mockResolvedValue({
        candidates: [
          {
            title: 'Risikoanalyse durchführen',
            description: 'Lieferanten müssen einer Risikoanalyse unterzogen werden.',
            priority: 'must',
            linkedElementIds: ['cap-1'],
            extractionConfidence: 0.92,
            extractionRationale: 'explizite Pflicht aus § 6',
            mappingConfidence: 0.85,
            mappingRationale: 'cap-1 setzt die Analyse um',
          },
        ],
      });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({
          text: 'Lieferanten müssen einer Risikoanalyse unterzogen werden gem. § 6 LkSG.',
          source: 'lksg',
          paragraphNumber: '§ 6',
          language: 'de',
          jurisdiction: 'DE',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.requirements).toHaveLength(1);
      expect(res.body.data.requirements[0].title).toBe('Risikoanalyse durchführen');
      expect(res.body.data.requirements[0].priority).toBe('must');
      expect(res.body.data.regulation.source).toBe('lksg');

      // No persistence
      const count = await ComplianceRequirement.countDocuments({});
      expect(count).toBe(0);

      // Service called with candidates from loader
      expect(generateRequirementsMock).toHaveBeenCalledTimes(1);
      expect(generateRequirementsMock.mock.calls[0][0].candidateElements).toHaveLength(1);
    });

    it('502 on RequirementGeneratorError', async () => {
      loadCandidatesMock.mockResolvedValue([]);
      generateRequirementsMock.mockRejectedValue(
        new RequirementGeneratorErrorReal('Anthropic 429: rate limited'),
      );
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ text: 'a'.repeat(50) });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/Anthropic/);
    });

    it('500 on unexpected error', async () => {
      loadCandidatesMock.mockResolvedValue([]);
      generateRequirementsMock.mockRejectedValue(new Error('boom'));
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ text: 'a'.repeat(50) });
      expect(res.status).toBe(500);
    });

    it('tolerates loadProjectCandidateElements failure (uses empty list)', async () => {
      loadCandidatesMock.mockRejectedValue(new Error('neo4j down'));
      generateRequirementsMock.mockResolvedValue({ candidates: [] });
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ text: 'a'.repeat(50) });
      expect(res.status).toBe(200);
      expect(generateRequirementsMock.mock.calls[0][0].candidateElements).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /:projectId/requirements (confirm/persist)
  // ────────────────────────────────────────────────────────
  describe('POST /:projectId/requirements (confirm)', () => {
    it('persists user-confirmed requirements with createdBy=human + audit', async () => {
      const reg = await Regulation.create(baseReg(PROJECT_ID));

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements`)
        .send({
          regulationId: reg._id?.toString(),
          sourceParagraph: 'a'.repeat(40),
          requirements: [
            {
              title: 'Risikoanalyse durchführen',
              description: 'Lieferanten müssen einer Risikoanalyse unterzogen werden.',
              priority: 'must',
              linkedElementIds: ['cap-1'],
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Risikoanalyse durchführen');
      expect(res.body.data[0].createdBy).toBe('human');
      expect(res.body.data[0].status).toBe('open');

      expect(auditEntrySpy).toHaveBeenCalledTimes(1);
      expect(auditEntrySpy.mock.calls[0][0]).toMatchObject({
        action: 'requirements.confirm',
        riskLevel: 'medium',
      });
      expect(auditEntrySpy.mock.calls[0][0].after.confirmedCount).toBe(1);
    });

    it('rejects invalid projectId', async () => {
      const res = await request(app)
        .post('/api/projects/not-an-id/requirements')
        .send({ regulationId: new mongoose.Types.ObjectId().toString(), sourceParagraph: 'a'.repeat(40), requirements: [] });
      expect(res.status).toBe(400);
    });

    it('rejects invalid regulationId', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements`)
        .send({
          regulationId: 'not-an-object-id',
          sourceParagraph: 'a'.repeat(40),
          requirements: [
            {
              title: 'Valid Title',
              description: 'Valid description here.',
              priority: 'must',
              linkedElementIds: [],
            },
          ],
        });
      expect(res.status).toBe(400);
    });

    it('404 when regulation not found', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements`)
        .send({
          regulationId: new mongoose.Types.ObjectId().toString(),
          sourceParagraph: 'a'.repeat(40),
          requirements: [
            {
              title: 'Valid Title',
              description: 'Valid description here.',
              priority: 'must',
              linkedElementIds: [],
            },
          ],
        });
      expect(res.status).toBe(404);
    });

    it('404 when regulation belongs to other project (tenant isolation)', async () => {
      const reg = await Regulation.create(baseReg(OTHER_PROJECT_ID));
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements`)
        .send({
          regulationId: reg._id?.toString(),
          sourceParagraph: 'a'.repeat(40),
          requirements: [
            {
              title: 'Valid Title',
              description: 'Valid description here.',
              priority: 'must',
              linkedElementIds: [],
            },
          ],
        });
      expect(res.status).toBe(404);
    });

    it('upserts on re-confirm with same title (no duplicates)', async () => {
      const reg = await Regulation.create(baseReg(PROJECT_ID));
      const body = {
        regulationId: reg._id?.toString(),
        sourceParagraph: 'a'.repeat(40),
        requirements: [
          {
            title: 'Risikoanalyse durchführen',
            description: 'First version of the description.',
            priority: 'must' as const,
            linkedElementIds: ['cap-1'],
          },
        ],
      };

      await request(app).post(`/api/projects/${PROJECT_ID}/requirements`).send(body);
      // Re-confirm with updated description
      body.requirements[0].description = 'Updated version of the description.';
      const res = await request(app).post(`/api/projects/${PROJECT_ID}/requirements`).send(body);

      expect(res.status).toBe(200);
      const docs = await ComplianceRequirement.find({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        title: 'Risikoanalyse durchführen',
      });
      expect(docs).toHaveLength(1);
      expect(docs[0].description).toBe('Updated version of the description.');
    });

    it('rejects empty requirements array', async () => {
      const reg = await Regulation.create(baseReg(PROJECT_ID));
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements`)
        .send({
          regulationId: reg._id?.toString(),
          sourceParagraph: 'a'.repeat(40),
          requirements: [],
        });
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /:projectId/requirements (list)
  // ────────────────────────────────────────────────────────
  describe('GET /:projectId/requirements', () => {
    beforeEach(async () => {
      const projectObjectId = new mongoose.Types.ObjectId(PROJECT_ID);
      const reg1 = new mongoose.Types.ObjectId();
      const reg2 = new mongoose.Types.ObjectId();
      await ComplianceRequirement.create([
        {
          projectId: projectObjectId,
          regulationId: reg1,
          sourceParagraph: 'p1',
          title: 'Open Must Item',
          description: 'desc one for the listing test.',
          priority: 'must',
          linkedElementIds: ['cap-1'],
          status: 'open',
          createdBy: 'llm',
          extractionConfidence: 0.9,
          extractionRationale: 'audit rationale for the seed',
        },
        {
          projectId: projectObjectId,
          regulationId: reg1,
          sourceParagraph: 'p1',
          title: 'Done Should Item',
          description: 'desc two for the listing test.',
          priority: 'should',
          linkedElementIds: ['cap-2'],
          status: 'done',
          createdBy: 'human',
        },
        {
          projectId: projectObjectId,
          regulationId: reg2,
          sourceParagraph: 'p2',
          title: 'In Progress May Item',
          description: 'desc three for the listing test.',
          priority: 'may',
          linkedElementIds: [],
          status: 'in_progress',
          createdBy: 'human',
        },
        // OTHER project — must not leak
        {
          projectId: new mongoose.Types.ObjectId(OTHER_PROJECT_ID),
          regulationId: reg1,
          sourceParagraph: 'p1',
          title: 'Leak Canary Item',
          description: 'desc leak should never appear.',
          priority: 'must',
          linkedElementIds: [],
          status: 'open',
          createdBy: 'human',
        },
      ]);
    });

    it('lists all requirements for project + isolates by projectId', async () => {
      const res = await request(app).get(`/api/projects/${PROJECT_ID}/requirements`);
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.items).toHaveLength(3);
      const titles = res.body.data.items.map((r: any) => r.title);
      expect(titles).not.toContain('Leak Canary Item');
    });

    it('filters by status=open', async () => {
      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/requirements?status=open`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].title).toBe('Open Must Item');
    });

    it('filters by priority=must', async () => {
      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/requirements?priority=must`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].priority).toBe('must');
    });

    it('paginates with limit + skip', async () => {
      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/requirements?limit=2&skip=1`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.limit).toBe(2);
      expect(res.body.data.skip).toBe(1);
    });

    it('rejects invalid projectId', async () => {
      const res = await request(app).get('/api/projects/not-an-id/requirements');
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /:projectId/requirements/by-element/:elementId
  // ────────────────────────────────────────────────────────
  describe('GET /:projectId/requirements/by-element/:elementId', () => {
    it('returns all requirements affecting the element', async () => {
      const projectObjectId = new mongoose.Types.ObjectId(PROJECT_ID);
      await ComplianceRequirement.create([
        {
          projectId: projectObjectId,
          regulationId: new mongoose.Types.ObjectId(),
          sourceParagraph: 'p1',
          title: 'Affects cap-1 Strongly',
          description: 'desc concrete for cap-1 element.',
          priority: 'must',
          linkedElementIds: ['cap-1', 'cap-2'],
          status: 'open',
          createdBy: 'llm',
          extractionConfidence: 0.9,
          extractionRationale: 'audit rationale for the seed',
        },
        {
          projectId: projectObjectId,
          regulationId: new mongoose.Types.ObjectId(),
          sourceParagraph: 'p1',
          title: 'Other Element Only',
          description: 'desc concrete for cap-3 element.',
          priority: 'may',
          linkedElementIds: ['cap-3'],
          status: 'open',
          createdBy: 'human',
        },
        // OTHER project — must not leak
        {
          projectId: new mongoose.Types.ObjectId(OTHER_PROJECT_ID),
          regulationId: new mongoose.Types.ObjectId(),
          sourceParagraph: 'p1',
          title: 'Leak Canary cap-1',
          description: 'desc leak canary should never appear.',
          priority: 'must',
          linkedElementIds: ['cap-1'],
          status: 'open',
          createdBy: 'human',
        },
      ]);

      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/requirements/by-element/cap-1`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Affects cap-1 Strongly');
      const titles = res.body.data.map((r: any) => r.title);
      expect(titles).not.toContain('Leak Canary cap-1');
    });

    it('returns empty array when no requirements affect the element', async () => {
      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/requirements/by-element/non-existent`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('rejects invalid projectId', async () => {
      const res = await request(app).get(
        '/api/projects/not-an-id/requirements/by-element/cap-1',
      );
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────
  // PATCH /:projectId/requirements/:id
  // ────────────────────────────────────────────────────────
  describe('PATCH /:projectId/requirements/:id', () => {
    it('updates status + writes audit', async () => {
      const doc = await ComplianceRequirement.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        regulationId: new mongoose.Types.ObjectId(),
        sourceParagraph: 'p',
        title: 'Update Target Item',
        description: 'concrete description text here for update target.',
        priority: 'must',
        linkedElementIds: [],
        status: 'open',
        createdBy: 'human',
      });

      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/requirements/${doc._id}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('in_progress');
      expect(auditEntrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requirements.update',
          riskLevel: 'low',
        }),
      );
    });

    it('updates assigneeId + dueDate + priority', async () => {
      const doc = await ComplianceRequirement.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        regulationId: new mongoose.Types.ObjectId(),
        sourceParagraph: 'p',
        title: 'Multi Update Item',
        description: 'concrete description text here for multi update.',
        priority: 'may',
        linkedElementIds: [],
        status: 'open',
        createdBy: 'human',
      });

      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/requirements/${doc._id}`)
        .send({
          assigneeId: USER_ID,
          dueDate: '2026-12-31',
          priority: 'must',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.priority).toBe('must');
      expect(res.body.data.assigneeId).toBe(USER_ID);
      expect(new Date(res.body.data.dueDate).getUTCFullYear()).toBe(2026);
    });

    it('404 for non-existent id', async () => {
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/requirements/${new mongoose.Types.ObjectId()}`)
        .send({ status: 'done' });
      expect(res.status).toBe(404);
    });

    it('404 when requirement belongs to other project (tenant isolation)', async () => {
      const doc = await ComplianceRequirement.create({
        projectId: new mongoose.Types.ObjectId(OTHER_PROJECT_ID),
        regulationId: new mongoose.Types.ObjectId(),
        sourceParagraph: 'p',
        title: 'Cross Tenant Item',
        description: 'concrete description text here for tenant test.',
        priority: 'must',
        linkedElementIds: [],
        status: 'open',
        createdBy: 'human',
      });
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/requirements/${doc._id}`)
        .send({ status: 'done' });
      expect(res.status).toBe(404);
    });

    it('rejects invalid id', async () => {
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/requirements/not-an-id`)
        .send({ status: 'done' });
      expect(res.status).toBe(400);
    });

    it('rejects empty body (no fields to update)', async () => {
      const doc = await ComplianceRequirement.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        regulationId: new mongoose.Types.ObjectId(),
        sourceParagraph: 'p',
        title: 'Empty Body Test',
        description: 'concrete description text here for empty body.',
        priority: 'must',
        linkedElementIds: [],
        status: 'open',
        createdBy: 'human',
      });
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/requirements/${doc._id}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects invalid status enum', async () => {
      const doc = await ComplianceRequirement.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        regulationId: new mongoose.Types.ObjectId(),
        sourceParagraph: 'p',
        title: 'Invalid Status Test',
        description: 'concrete description text here for invalid status.',
        priority: 'must',
        linkedElementIds: [],
        status: 'open',
        createdBy: 'human',
      });
      const res = await request(app)
        .patch(`/api/projects/${PROJECT_ID}/requirements/${doc._id}`)
        .send({ status: 'foobar' });
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────────
  // DELETE /:projectId/requirements/:id
  // ────────────────────────────────────────────────────────
  describe('DELETE /:projectId/requirements/:id', () => {
    it('deletes requirement + writes audit', async () => {
      const doc = await ComplianceRequirement.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        regulationId: new mongoose.Types.ObjectId(),
        sourceParagraph: 'p',
        title: 'Delete Target Item',
        description: 'concrete description text here for delete target.',
        priority: 'must',
        linkedElementIds: [],
        status: 'open',
        createdBy: 'human',
      });

      const res = await request(app).delete(
        `/api/projects/${PROJECT_ID}/requirements/${doc._id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(doc._id?.toString());

      const after = await ComplianceRequirement.findById(doc._id);
      expect(after).toBeNull();

      expect(auditEntrySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'requirements.delete',
          riskLevel: 'medium',
        }),
      );
    });

    it('404 for non-existent id', async () => {
      const res = await request(app).delete(
        `/api/projects/${PROJECT_ID}/requirements/${new mongoose.Types.ObjectId()}`,
      );
      expect(res.status).toBe(404);
    });

    it('404 when requirement belongs to other project (tenant isolation)', async () => {
      const doc = await ComplianceRequirement.create({
        projectId: new mongoose.Types.ObjectId(OTHER_PROJECT_ID),
        regulationId: new mongoose.Types.ObjectId(),
        sourceParagraph: 'p',
        title: 'Cross Tenant Delete',
        description: 'concrete description text here for cross tenant delete.',
        priority: 'must',
        linkedElementIds: [],
        status: 'open',
        createdBy: 'human',
      });
      const res = await request(app).delete(
        `/api/projects/${PROJECT_ID}/requirements/${doc._id}`,
      );
      expect(res.status).toBe(404);

      // Doc still exists in other project
      const stillThere = await ComplianceRequirement.findById(doc._id);
      expect(stillThere).not.toBeNull();
    });

    it('rejects invalid id', async () => {
      const res = await request(app).delete(
        `/api/projects/${PROJECT_ID}/requirements/not-an-id`,
      );
      expect(res.status).toBe(400);
    });
  });
});
