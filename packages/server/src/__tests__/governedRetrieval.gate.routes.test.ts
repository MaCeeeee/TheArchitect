/**
 * THE-422 Chunk 4 — gate the two legacy-bypass consumers through governedRetrieval.
 *
 * AC-4 finding: `compliance.routes.ts` (AI-Match) read the legacy `Regulation`
 * model directly, and `requirements.routes.ts` (generation) sliced a norm section —
 * both bypassed the eligibility/version gate. These route-level tests pin the two
 * behaviours at the seam with an in-memory corpus (`makeFakeCorpus`) + spies on the
 * downstream services:
 *   - AI-Match: legacy reg is UPGRADED to the governed current/pinned corpus version
 *     while ALWAYS threading the legacy `_id` (persistence-identity regression guard);
 *     corpus-miss falls back to the legacy doc (measured via a warn).
 *   - requirements: upload norms pass through untouched (no version → no 409);
 *     corpus norms are resolved through the gate; stale/vanished → 409, current →
 *     proceeds.
 * Plus the carried-over rag.routes `pin`-shape guard (NoSQL-operator injection).
 *
 * Corpus keys are COLON format (source:paragraph, e.g. dsgvo:art-30).
 */
import express, { type Express } from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Regulation } from '../models/Regulation';

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
jest.mock('../middleware/audit.middleware', () => ({
  createAuditEntry: jest.fn().mockResolvedValue(undefined),
  audit: () => (_req: any, _res: any, next: any) => next(),
}));

// ─── Service stubs (no Neo4j, no Anthropic in tests) ─────────
const loadCandidatesMock = jest.fn();
jest.mock('../services/complianceElements.service', () => ({
  loadProjectCandidateElements: (...a: unknown[]) => loadCandidatesMock(...a),
  normalizeElementType: (t: string) => t,
}));

const mapRegulationsBatchMock = jest.fn();
jest.mock('../services/complianceMapping.service', () => ({
  mapRegulationsBatch: (...a: unknown[]) => mapRegulationsBatchMock(...a),
  mapTextToElements: jest.fn(),
  ComplianceMappingError: class ComplianceMappingError extends Error {},
}));

const generateRequirementsMock = jest.fn();
jest.mock('../services/requirementGenerator.service', () => ({
  generateRequirementsFromText: (...a: unknown[]) => generateRequirementsMock(...a),
  RequirementGeneratorError: class RequirementGeneratorError extends Error {},
}));

jest.mock('../services/requirementProjection.service', () => ({
  projectRequirementsToModel: jest.fn(),
}));

const getPipelineNormMock = jest.fn();
jest.mock('../services/norm.service', () => ({
  getPipelineNorm: (...a: unknown[]) => getPipelineNormMock(...a),
  derivePipelineAnchorId: () => new mongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
}));

// Import AFTER mocks
import complianceRoutes from '../routes/compliance.routes';
import requirementsRoutes from '../routes/requirements.routes';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { resetGovernedStats } from '../services/governedRetrieval.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';
import { sanitizePin } from '../routes/rag.routes';
import { log } from '../config/logger';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const LEGACY_FULLTEXT = 'LEGACY ' + 'x'.repeat(60);

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', complianceRoutes);
  app.use('/api/projects', requirementsRoutes);
  return app;
}

const seedLegacyReg = (overrides: Record<string, unknown> = {}) =>
  Regulation.create({
    projectId: new mongoose.Types.ObjectId(PROJECT_ID),
    title: 'RoPA',
    fullText: LEGACY_FULLTEXT,
    sourceUrl: 'https://example.org',
    effectiveFrom: new Date('2024-01-01'),
    language: 'en',
    jurisdiction: 'EU',
    source: 'dsgvo',
    paragraphNumber: 'Art. 30',
    ...overrides,
  });

describe('THE-422 Chunk 4 — governed gate on AI-Match + requirement generation', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Regulation.ensureIndexes();
    app = buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    __setCorpusForTests(null);
  });

  beforeEach(() => {
    resetGovernedStats();
    loadCandidatesMock.mockReset();
    mapRegulationsBatchMock.mockReset();
    generateRequirementsMock.mockReset();
    getPipelineNormMock.mockReset();
    __setCorpusForTests(
      makeFakeCorpus([
        { regulationKey: 'dsgvo:art-30', versionHash: 'h1', version: 1, fullText: 'OLD', source: 'dsgvo', paragraphNumber: 'art-30', title: 'RoPA', language: 'en', jurisdiction: 'EU' },
        { regulationKey: 'dsgvo:art-30', versionHash: 'h2', version: 2, fullText: 'NEW', source: 'dsgvo', paragraphNumber: 'art-30', title: 'RoPA', language: 'en', jurisdiction: 'EU' },
      ]),
    );
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
  });

  // ── AI-Match ──────────────────────────────────────────────────
  describe('AI-Match (POST /compliance/mappings/auto)', () => {
    it('upgrades a legacy reg to the governed CURRENT version + threads the original _id', async () => {
      const reg = await seedLegacyReg();
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapRegulationsBatchMock.mockResolvedValue({ totalRegulations: 1, totalMapped: 1, errors: [], durationMs: 1 });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({});

      expect(res.status).toBe(200);
      expect(mapRegulationsBatchMock).toHaveBeenCalledTimes(1);
      const regs = mapRegulationsBatchMock.mock.calls[0][0].regulations;
      expect(regs).toHaveLength(1);
      // Governed upgrade: corpus current text, NOT the legacy 'LEGACY…' text.
      expect(regs[0].fullText).toBe('NEW');
      // Persistence-identity regression guard: legacy _id MUST survive the upgrade.
      expect(regs[0]._id.toString()).toBe(reg._id!.toString());
    });

    it('honors an explicit pin → batch receives the pinned OLD version', async () => {
      const reg = await seedLegacyReg();
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapRegulationsBatchMock.mockResolvedValue({ totalRegulations: 1, totalMapped: 1, errors: [], durationMs: 1 });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({ pin: { 'dsgvo:art-30': 'h1' } });

      expect(res.status).toBe(200);
      const regs = mapRegulationsBatchMock.mock.calls[0][0].regulations;
      expect(regs[0].fullText).toBe('OLD');
      expect(regs[0]._id.toString()).toBe(reg._id!.toString());
    });

    it('corpus-miss → legacy passthrough (LEGACY text + _id) and a warn is logged', async () => {
      const reg = await seedLegacyReg({ source: 'lksg', paragraphNumber: '§ 6', jurisdiction: 'DE' }); // key lksg:6, absent from corpus
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      mapRegulationsBatchMock.mockResolvedValue({ totalRegulations: 1, totalMapped: 0, errors: [], durationMs: 1 });
      const warnSpy = jest.spyOn(log, 'warn').mockImplementation(() => log as never);

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({});

      expect(res.status).toBe(200);
      const regs = mapRegulationsBatchMock.mock.calls[0][0].regulations;
      expect(regs[0].fullText).toBe(LEGACY_FULLTEXT);
      expect(regs[0]._id.toString()).toBe(reg._id!.toString());
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ regulationKey: 'lksg:6' }),
        expect.stringContaining('corpus miss'),
      );
      warnSpy.mockRestore();
    });

    it('rejects a pin with a non-string value (schema guard)', async () => {
      await seedLegacyReg();
      loadCandidatesMock.mockResolvedValue([{ id: 'cap-1', name: 'X', type: 'capability' }]);
      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/compliance/mappings/auto`)
        .send({ pin: { 'dsgvo:art-30': { $ne: null } } });
      expect(res.status).toBe(400);
      expect(mapRegulationsBatchMock).not.toHaveBeenCalled();
    });
  });

  // ── requirement generation ────────────────────────────────────
  describe('requirement generation (POST /requirements/generate)', () => {
    it('upload norm passes through untouched (no 409 — AC-5 regression)', async () => {
      getPipelineNormMock.mockResolvedValue({
        id: '507f1f77bcf86cd799439012',
        source: 'upload',
        name: 'ISO 27001',
        type: 'iso',
        sections: [{ id: 's1', title: 'Scope', number: '1', content: 'x'.repeat(40), level: 1 }],
      });
      loadCandidatesMock.mockResolvedValue([]);
      generateRequirementsMock.mockResolvedValue({ candidates: [] });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ normId: 'upload:507f1f77bcf86cd799439012', sectionEId: 's1' });

      expect(res.status).toBe(200);
      expect(generateRequirementsMock).toHaveBeenCalledTimes(1);
    });

    it('stale corpus norm (section key absent from corpus) → 409, no generation', async () => {
      getPipelineNormMock.mockResolvedValue({
        id: 'corpus:gone',
        source: 'corpus',
        name: 'GONE',
        type: 'legislation',
        sections: [{ id: 'gone:key', title: 'X', number: '1', content: 'x'.repeat(40), level: 1 }],
      });
      loadCandidatesMock.mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ normId: 'corpus:gone', sectionEId: 'gone:key' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/stale/);
      expect(generateRequirementsMock).not.toHaveBeenCalled();
    });

    it('current corpus norm → proceeds to generation', async () => {
      getPipelineNormMock.mockResolvedValue({
        id: 'corpus:dsgvo',
        source: 'corpus',
        name: 'DSGVO',
        type: 'legislation',
        sections: [{ id: 'dsgvo:art-30', title: 'RoPA', number: 'Art. 30', content: 'x'.repeat(40), level: 1 }],
      });
      loadCandidatesMock.mockResolvedValue([]);
      generateRequirementsMock.mockResolvedValue({ candidates: [] });

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ normId: 'corpus:dsgvo', sectionEId: 'dsgvo:art-30' });

      expect(res.status).toBe(200);
      expect(generateRequirementsMock).toHaveBeenCalledTimes(1);
    });

    it('corpus norm pinned to a vanished version → 409', async () => {
      getPipelineNormMock.mockResolvedValue({
        id: 'corpus:dsgvo',
        source: 'corpus',
        name: 'DSGVO',
        type: 'legislation',
        sections: [{ id: 'dsgvo:art-30', title: 'RoPA', number: 'Art. 30', content: 'x'.repeat(40), level: 1 }],
      });
      loadCandidatesMock.mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/projects/${PROJECT_ID}/requirements/generate`)
        .send({ normId: 'corpus:dsgvo', sectionEId: 'dsgvo:art-30', pin: { 'dsgvo:art-30': 'GONE' } });

      expect(res.status).toBe(409);
      expect(generateRequirementsMock).not.toHaveBeenCalled();
    });
  });
});

// ── rag.routes pin-shape guard (carried-over security fix) ──────
describe('THE-422 — sanitizePin blocks NoSQL-operator injection (rag.routes)', () => {
  it('drops a value that is a Mongo operator object → undefined (never reaches Mongo)', () => {
    expect(sanitizePin({ k: { $ne: null } })).toBeUndefined();
  });

  it('keeps string values, drops non-string ones', () => {
    expect(sanitizePin({ good: 'h1', bad: { $gt: '' }, alsoBad: 3 })).toEqual({ good: 'h1' });
  });

  it('passes a clean all-string pin through', () => {
    expect(sanitizePin({ 'dsgvo:art-30': 'h2' })).toEqual({ 'dsgvo:art-30': 'h2' });
  });

  it('returns undefined for non-object input', () => {
    expect(sanitizePin(undefined)).toBeUndefined();
    expect(sanitizePin('h1')).toBeUndefined();
    expect(sanitizePin(['h1'])).toBeUndefined();
  });
});
