/**
 * LawDiscoveryFinding Model Tests — UC-LAW-002 Slice-2 (THE-463).
 *
 * Muster ComplianceMapping.model.test.ts (mongodb-memory-server, Repo-Konvention
 * für Model-Tests). Verifiziert:
 *   - Default-Status 'auto'
 *   - Dedup unique index (projectId, family, corpusVersionHash) — AC-3
 *   - reasoning-Pflicht bei createdBy='llm' (Muster ComplianceMapping AC-7)
 *
 * Run: cd packages/server && npx jest src/__tests__/lawDiscoveryFinding.model.test.ts --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { LawDiscoveryFinding } from '../models/LawDiscoveryFinding';

describe('LawDiscoveryFinding Model (UC-LAW-002 Slice-2 / THE-463)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await LawDiscoveryFinding.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await LawDiscoveryFinding.deleteMany({});
  });

  const baseDoc = () => ({
    projectId: new mongoose.Types.ObjectId(),
    family: 'ai-act',
    sources: ['ai-act-en', 'ai-act-de'],
    jurisdiction: 'EU',
    applies: true,
    confidence: 0.8,
    reasoning: 'High-risk AI component detected in the application layer.',
    elementIds: ['e1'],
    keyParagraphs: ['ai-act-en:5'],
    retrievalScore: 0.75,
    corpusVersionHash: 'hash-1',
    judgeModel: 'claude-haiku-4-5-20251001',
    createdBy: 'llm' as const,
  });

  describe('CRUD + default status', () => {
    it('creates a finding with default status=auto', async () => {
      const f = await LawDiscoveryFinding.create(baseDoc());
      expect(f._id).toBeDefined();
      expect(f.status).toBe('auto');
      expect(f.createdAt).toBeDefined();
      expect(f.updatedAt).toBeDefined();
    });

    it('reads a finding back from DB', async () => {
      const created = await LawDiscoveryFinding.create(baseDoc());
      const found = await LawDiscoveryFinding.findById(created._id);
      expect(found).not.toBeNull();
      expect(found?.family).toBe('ai-act');
      expect(found?.confidence).toBe(0.8);
    });
  });

  describe('AC-3: Dedup unique index (projectId, family, corpusVersionHash)', () => {
    it('rejects exact duplicate', async () => {
      const doc = baseDoc();
      await LawDiscoveryFinding.create(doc);
      await expect(LawDiscoveryFinding.create(doc)).rejects.toThrow();
    });

    it('upsert is idempotent via compound key', async () => {
      const doc = baseDoc();
      const filter = {
        projectId: doc.projectId,
        family: doc.family,
        corpusVersionHash: doc.corpusVersionHash,
      };
      await LawDiscoveryFinding.updateOne(filter, { $set: doc }, { upsert: true, runValidators: true });
      await LawDiscoveryFinding.updateOne(
        filter,
        { $set: { ...doc, confidence: 0.95 } },
        { upsert: true, runValidators: true },
      );
      const count = await LawDiscoveryFinding.countDocuments(filter);
      expect(count).toBe(1);
      const final = await LawDiscoveryFinding.findOne(filter);
      expect(final?.confidence).toBe(0.95);
    });

    it('allows same family for a different corpusVersionHash (new evidence set)', async () => {
      const doc = baseDoc();
      await LawDiscoveryFinding.create(doc);
      await LawDiscoveryFinding.create({ ...doc, corpusVersionHash: 'hash-2' });
      const count = await LawDiscoveryFinding.countDocuments({ projectId: doc.projectId, family: doc.family });
      expect(count).toBe(2);
    });

    it('allows same family+hash for a different project', async () => {
      const doc = baseDoc();
      await LawDiscoveryFinding.create(doc);
      await LawDiscoveryFinding.create({ ...doc, projectId: new mongoose.Types.ObjectId() });
      const count = await LawDiscoveryFinding.countDocuments({ family: doc.family, corpusVersionHash: doc.corpusVersionHash });
      expect(count).toBe(2);
    });
  });

  describe('reasoning required when createdBy=llm', () => {
    it('rejects empty reasoning when createdBy=llm', async () => {
      await expect(LawDiscoveryFinding.create({ ...baseDoc(), reasoning: '' })).rejects.toThrow(
        /reasoning is required when createdBy=llm/,
      );
    });

    it('allows empty reasoning when createdBy=human', async () => {
      const f = await LawDiscoveryFinding.create({ ...baseDoc(), reasoning: '', createdBy: 'human' });
      expect(f.reasoning).toBe('');
    });

    it('caps reasoning at 500 chars', async () => {
      await expect(LawDiscoveryFinding.create({ ...baseDoc(), reasoning: 'A'.repeat(501) })).rejects.toThrow();
    });
  });

  describe('confidence validation', () => {
    it('rejects confidence > 1.0', async () => {
      await expect(LawDiscoveryFinding.create({ ...baseDoc(), confidence: 1.1 })).rejects.toThrow();
    });
    it('rejects confidence < 0', async () => {
      await expect(LawDiscoveryFinding.create({ ...baseDoc(), confidence: -0.1 })).rejects.toThrow();
    });
  });

  describe('enum validation', () => {
    it('status: rejects unknown value', async () => {
      await expect(LawDiscoveryFinding.create({ ...baseDoc(), status: 'pending' as never })).rejects.toThrow();
    });
    it('createdBy: rejects unknown value', async () => {
      await expect(LawDiscoveryFinding.create({ ...baseDoc(), createdBy: 'system' as never })).rejects.toThrow();
    });
    it('status: accepts confirmed/rejected', async () => {
      const projectId = new mongoose.Types.ObjectId();
      await LawDiscoveryFinding.create({ ...baseDoc(), projectId, status: 'confirmed' as const });
      await LawDiscoveryFinding.create({
        ...baseDoc(),
        projectId,
        corpusVersionHash: 'hash-2',
        status: 'rejected' as const,
      });
      const count = await LawDiscoveryFinding.countDocuments({ projectId });
      expect(count).toBe(2);
    });
  });
});
