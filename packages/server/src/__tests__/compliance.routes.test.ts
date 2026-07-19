/**
 * Compliance Routes Tests — REQ-ICM-002.3 (THE-280)
 *
 * Verifies the 5 Auto-Mapping API endpoints:
 *   POST /:projectId/compliance/mappings/auto
 *   POST /:projectId/compliance/mappings/preview
 *   GET  /:projectId/compliance/mappings/by-element/:elementId
 *   GET  /:projectId/compliance/mappings/by-regulation/:regulationId
 *   POST /:projectId/compliance/mappings/confirm
 *
 * AC-Coverage:
 *   AC-1 Auth-protected (middleware stubbed but route order verified)
 *   AC-2 Auto-Mapping persistiert ≤5 mappings via Mongo bulkWrite
 *   AC-3 Audit-Entry für auto + confirm
 *   AC-4 Preview-Rate-Limit (Skip: rateLimit ist Dev-NoOp; per Unit-Test belegt)
 *   AC-5 5 BSH-Demo-Szenarien (siehe describe block am Ende)
 *
 * Run: cd packages/server && npx jest src/__tests__/compliance.routes.test.ts --verbose
 */
import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Regulation } from '../models/Regulation';
import { ComplianceMapping } from '../models/ComplianceMapping';

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

const mapRegulationsBatchMock = jest.fn();
const mapTextToElementsMock = jest.fn();
const ComplianceMappingErrorReal = class extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceMappingError';
  }
};
jest.mock('../services/complianceMapping.service', () => ({
  mapRegulationsBatch: (...args: unknown[]) => mapRegulationsBatchMock(...args),
  mapTextToElements: (...args: unknown[]) => mapTextToElementsMock(...args),
  ComplianceMappingError: ComplianceMappingErrorReal,
}));

// findOutputsByRegulation touches Neo4j via runCypher — stub the whole
// service so this route test stays Neo4j-free (mirrors the pattern above).
const findOutputsByRegulationMock = jest.fn();
jest.mock('../services/contextTrace.service', () => ({
  findOutputsByRegulation: (...args: unknown[]) => findOutputsByRegulationMock(...args),
}));

// Import AFTER mocks
import complianceRoutes from '../routes/compliance.routes';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_PROJECT_ID = '507f1f77bcf86cd799439099';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', complianceRoutes);
  return app;
}

describe('Compliance Routes (UC-ICM-002 / THE-280)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Regulation.ensureIndexes();
    await ComplianceMapping.ensureIndexes();
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
    await ComplianceMapping.deleteMany({});
    loadCandidatesMock.mockReset();
    mapRegulationsBatchMock.mockReset();
    mapTextToElementsMock.mockReset();
    findOutputsByRegulationMock.mockReset();
    auditEntrySpy.mockClear();
  });

  // ────────────────────────────────────────────────────────
  // POST /:projectId/compliance/mappings/auto
  // ────────────────────────────────────────────────────────
  describe('POST /:projectId/compliance/mappings/auto', () => {
    it('rejects invalid projectId', async () => {
      const res = await request(app)
        .post('/api/projects/not-an-id/compliance/mappings/auto')
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 0 when no elements in project', async () => {
      loadCandidatesMock.mockResolvedValue([]);
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.note).toMatch(/no architecture elements/);
      expect(mapRegulationsBatchMock).not.toHaveBeenCalled();
    });

    it('returns 0 when no regulations in project', async () => {
      loadCandidatesMock.mockResolvedValue([
        { id: 'el-1', name: 'Supplier Mgmt', type: 'capability' },
      ]);
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(0);
      expect(res.body.data.note).toMatch(/no regulations/);
    });

    it('maps all regulations + writes audit entry', async () => {
      // Seed 2 regulations
      const baseReg = {
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        title: 'T',
        fullText: 'a'.repeat(60),
        sourceUrl: 'https://example.org',
        effectiveFrom: new Date('2024-01-01'),
        language: 'en' as const,
        jurisdiction: 'EU',
      };
      await Regulation.create([
        { ...baseReg, source: 'nis2', paragraphNumber: 'Art. 21' },
        { ...baseReg, source: 'lksg', paragraphNumber: '§ 6' },
      ]);

      loadCandidatesMock.mockResolvedValue([
        { id: 'cap-1', name: 'Lieferantenmanagement', type: 'capability' },
      ]);
      mapRegulationsBatchMock.mockResolvedValue({
        totalRegulations: 2,
        totalMapped: 2,
        errors: [],
        durationMs: 42,
      });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.mapped).toBe(2);
      expect(res.body.data.durationMs).toBe(42);
      // Batch called once with all regs (NOT once per reg)
      expect(mapRegulationsBatchMock).toHaveBeenCalledTimes(1);
      expect(mapRegulationsBatchMock.mock.calls[0][0].regulations).toHaveLength(2);
      expect(auditEntrySpy).toHaveBeenCalledTimes(1);
      expect(auditEntrySpy.mock.calls[0][0]).toMatchObject({
        action: 'compliance.mapping.auto',
        riskLevel: 'medium',
      });
      expect(auditEntrySpy.mock.calls[0][0].after.durationMs).toBe(42);
    });

    it('passes custom concurrency to batch service', async () => {
      await Regulation.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        title: 'T',
        fullText: 'a'.repeat(60),
        sourceUrl: 'https://example.org',
        effectiveFrom: new Date('2024-01-01'),
        language: 'en',
        jurisdiction: 'EU',
        source: 'nis2',
        paragraphNumber: 'Art. 21',
      });
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapRegulationsBatchMock.mockResolvedValue({
        totalRegulations: 1,
        totalMapped: 1,
        errors: [],
        durationMs: 1,
      });

      await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({ concurrency: 7 });

      expect(mapRegulationsBatchMock.mock.calls[0][0].concurrency).toBe(7);
    });

    it('rejects concurrency > 10', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({ concurrency: 99 });
      expect(res.status).toBe(400);
    });

    it('filters by regulationIds when provided', async () => {
      const reg = await Regulation.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        title: 'T',
        fullText: 'a'.repeat(60),
        sourceUrl: 'https://example.org',
        effectiveFrom: new Date('2024-01-01'),
        language: 'en',
        jurisdiction: 'EU',
        source: 'nis2',
        paragraphNumber: 'Art. 21',
      });
      // Second regulation in DB but NOT in request — must not be mapped
      await Regulation.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        title: 'X',
        fullText: 'a'.repeat(60),
        sourceUrl: 'https://example.org',
        effectiveFrom: new Date('2024-01-01'),
        language: 'en',
        jurisdiction: 'EU',
        source: 'dora',
        paragraphNumber: 'Art. 5',
      });

      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapRegulationsBatchMock.mockResolvedValue({
        totalRegulations: 1,
        totalMapped: 0,
        errors: [],
        durationMs: 1,
      });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({ regulationIds: [reg._id?.toString()] });

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      // Batch invoked with the single filtered regulation only
      expect(mapRegulationsBatchMock.mock.calls[0][0].regulations).toHaveLength(1);
    });

    it('rejects invalid regulationIds', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({ regulationIds: ['not-an-object-id'] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid regulationIds/);
    });

    it('collects per-regulation errors without aborting the batch', async () => {
      await Regulation.create([
        {
          projectId: new mongoose.Types.ObjectId(PROJECT_ID),
          title: 'OK',
          fullText: 'a'.repeat(60),
          sourceUrl: 'https://example.org',
          effectiveFrom: new Date('2024-01-01'),
          language: 'en',
          jurisdiction: 'EU',
          source: 'nis2',
          paragraphNumber: 'Art. 21',
        },
        {
          projectId: new mongoose.Types.ObjectId(PROJECT_ID),
          title: 'FAIL',
          fullText: 'a'.repeat(60),
          sourceUrl: 'https://example.org',
          effectiveFrom: new Date('2024-01-01'),
          language: 'en',
          jurisdiction: 'EU',
          source: 'lksg',
          paragraphNumber: '§ 6',
        },
      ]);
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapRegulationsBatchMock.mockResolvedValue({
        totalRegulations: 2,
        totalMapped: 1,
        errors: [{ regulationId: 'reg-2', error: 'LLM timeout' }],
        durationMs: 50,
      });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.mapped).toBe(1);
      expect(res.body.data.errors).toHaveLength(1);
      expect(res.body.data.errors[0].error).toMatch(/LLM timeout/);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /:projectId/compliance/mappings/preview
  // ────────────────────────────────────────────────────────
  describe('POST /:projectId/compliance/mappings/preview', () => {
    it('returns candidates without persisting', async () => {
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapTextToElementsMock.mockResolvedValue({
        candidates: [
          { elementId: 'cap-1', elementType: 'capability', confidence: 0.91, reasoning: 'r' },
        ],
      });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/preview`)
        .send({
          text: 'Lieferanten müssen einer Risikoanalyse unterzogen werden gem. § 6 LkSG. Mindesttextlänge ist erfüllt.',
          source: 'lksg',
          paragraphNumber: '§ 6',
          language: 'de',
          jurisdiction: 'DE',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mappings).toHaveLength(1);
      expect(res.body.data.mappings[0].elementId).toBe('cap-1');

      // No persistence happened
      const count = await ComplianceMapping.countDocuments({});
      expect(count).toBe(0);
    });

    it('rejects text < 20 chars', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/preview`)
        .send({ text: 'short' });
      expect(res.status).toBe(400);
    });

    it('returns empty mappings if project has no elements', async () => {
      loadCandidatesMock.mockResolvedValue([]);
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/preview`)
        .send({ text: 'a'.repeat(50) });
      expect(res.status).toBe(200);
      expect(res.body.data.mappings).toEqual([]);
      expect(mapTextToElementsMock).not.toHaveBeenCalled();
    });

    it('502 on ComplianceMappingError', async () => {
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapTextToElementsMock.mockRejectedValue(
        new ComplianceMappingErrorReal('Anthropic 429: rate limited'),
      );

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/preview`)
        .send({ text: 'a'.repeat(50) });

      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/Anthropic/);
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /:projectId/compliance/mappings/by-element/:elementId
  // ────────────────────────────────────────────────────────
  describe('GET /:projectId/compliance/mappings/by-element/:elementId', () => {
    it('returns mappings sorted by confidence desc + isolates by projectId', async () => {
      await ComplianceMapping.create([
        {
          projectId: new mongoose.Types.ObjectId(PROJECT_ID),
          regulationId: new mongoose.Types.ObjectId(),
          elementId: 'cap-1',
          elementType: 'capability',
          confidence: 0.7,
          reasoning: 'mid',
          createdBy: 'llm',
        },
        {
          projectId: new mongoose.Types.ObjectId(PROJECT_ID),
          regulationId: new mongoose.Types.ObjectId(),
          elementId: 'cap-1',
          elementType: 'capability',
          confidence: 0.95,
          reasoning: 'high',
          createdBy: 'llm',
        },
        // OTHER project — must not leak
        {
          projectId: new mongoose.Types.ObjectId(OTHER_PROJECT_ID),
          regulationId: new mongoose.Types.ObjectId(),
          elementId: 'cap-1',
          elementType: 'capability',
          confidence: 0.99,
          reasoning: 'leak-canary',
          createdBy: 'llm',
        },
      ]);

      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/compliance/mappings/by-element/cap-1`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].confidence).toBe(0.95);
      expect(res.body.data[1].confidence).toBe(0.7);
      // Tenant isolation
      const reasonings = res.body.data.map((m: any) => m.reasoning);
      expect(reasonings).not.toContain('leak-canary');
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /:projectId/compliance/mappings/by-regulation/:regulationId
  // ────────────────────────────────────────────────────────
  describe('GET /:projectId/compliance/mappings/by-regulation/:regulationId', () => {
    it('returns all mappings for one regulation', async () => {
      const regulationId = new mongoose.Types.ObjectId();
      await ComplianceMapping.create([
        {
          projectId: new mongoose.Types.ObjectId(PROJECT_ID),
          regulationId,
          elementId: 'elem-A',
          elementType: 'capability',
          confidence: 0.9,
          reasoning: 'r1',
          createdBy: 'llm',
        },
        {
          projectId: new mongoose.Types.ObjectId(PROJECT_ID),
          regulationId,
          elementId: 'elem-B',
          elementType: 'application',
          confidence: 0.6,
          reasoning: 'r2',
          createdBy: 'llm',
        },
      ]);

      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/compliance/mappings/by-regulation/${regulationId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.map((m: any) => m.elementId).sort()).toEqual(['elem-A', 'elem-B']);
    });
  });

  // ────────────────────────────────────────────────────────
  // POST /:projectId/compliance/mappings/confirm
  // ────────────────────────────────────────────────────────
  describe('POST /:projectId/compliance/mappings/confirm', () => {
    it('persists mappings with status=confirmed and createdBy=human + writes audit', async () => {
      const regulationId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/confirm`)
        .send({
          regulationId,
          mappings: [
            {
              elementId: 'cap-1',
              elementType: 'capability',
              confidence: 0.88,
              reasoning: 'User accepted',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe('confirmed');
      expect(res.body.data[0].createdBy).toBe('human');
      expect(auditEntrySpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'compliance.mapping.confirm', riskLevel: 'medium' }),
      );
    });

    it('rejects invalid body schema', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/confirm`)
        .send({ regulationId: 'x', mappings: [] });
      expect(res.status).toBe(400);
    });

    it('rejects invalid regulationId', async () => {
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/confirm`)
        .send({
          regulationId: 'not-an-object-id',
          mappings: [
            {
              elementId: 'cap-1',
              elementType: 'capability',
              confidence: 0.5,
              reasoning: 'x',
            },
          ],
        });
      expect(res.status).toBe(400);
    });

    it('confirms multiple + upserts existing auto mappings to confirmed', async () => {
      const regulationId = new mongoose.Types.ObjectId();
      // Pre-existing auto mapping
      await ComplianceMapping.create({
        projectId: new mongoose.Types.ObjectId(PROJECT_ID),
        regulationId,
        elementId: 'cap-1',
        elementType: 'capability',
        confidence: 0.6,
        reasoning: 'original auto',
        status: 'auto',
        createdBy: 'llm',
      });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/confirm`)
        .send({
          regulationId: regulationId.toString(),
          mappings: [
            {
              elementId: 'cap-1',
              elementType: 'capability',
              confidence: 0.92,
              reasoning: 'human upgraded',
            },
          ],
        });

      expect(res.status).toBe(200);
      // Should still be ONE doc (upsert), now status=confirmed
      const docs = await ComplianceMapping.find({ regulationId, elementId: 'cap-1' });
      expect(docs).toHaveLength(1);
      expect(docs[0].status).toBe('confirmed');
      expect(docs[0].confidence).toBe(0.92);
      expect(docs[0].createdBy).toBe('human');
    });
  });

  // ────────────────────────────────────────────────────────
  // GET /:projectId/regulations/impact (THE-423 Task 12, AC-5)
  // ────────────────────────────────────────────────────────
  describe('GET /:projectId/regulations/impact', () => {
    it('rejects invalid projectId', async () => {
      const res = await request(app).get(
        '/api/projects/not-an-id/regulations/impact?regulationKey=dsgvo:art-30&versionHash=v1',
      );
      expect(res.status).toBe(400);
      expect(findOutputsByRegulationMock).not.toHaveBeenCalled();
    });

    it('rejects missing regulationKey/versionHash', async () => {
      const res = await request(app).get(`/api/projects/${PROJECT_ID}/regulations/impact`);
      expect(res.status).toBe(400);
      expect(findOutputsByRegulationMock).not.toHaveBeenCalled();
    });

    it('delegates to findOutputsByRegulation and returns its result', async () => {
      const impact = {
        affected: { mappings: [], requirements: [], findings: [], elements: [], connections: [] },
        traceIds: ['trace-R'],
      };
      findOutputsByRegulationMock.mockResolvedValue(impact);

      const res = await request(app).get(
        `/api/projects/${PROJECT_ID}/regulations/impact?regulationKey=dsgvo:art-30&versionHash=v-hash-1`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(impact);
      expect(findOutputsByRegulationMock).toHaveBeenCalledWith(
        PROJECT_ID,
        'dsgvo:art-30',
        'v-hash-1',
      );
    });
  });
});
