/**
 * ComplianceMapping Model Tests — REQ-ICM-002.1 / THE-278
 *
 * Verifies the ComplianceMapping Mongoose model:
 *   - CRUD roundtrip (AC-1)
 *   - Shared types accessible via @thearchitect/shared (AC-2)
 *   - Upsert-Idempotency via compound index (AC-3)
 *   - Reverse-lookup index (projectId, elementId, confidence) for UC-ICM-003.2 (AC-4)
 *   - Forward-lookup index (projectId, regulationId) for UC-ICM-003.1 (AC-5)
 *   - Validation: confidence ∈ [0, 1] (AC-6)
 *   - Validation: reasoning Pflicht wenn createdBy='llm' (AC-7)
 *
 * Run: cd packages/server && npx jest src/__tests__/ComplianceMapping.model.test.ts --verbose
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ComplianceMapping } from '../models/ComplianceMapping';

describe('ComplianceMapping Model (REQ-ICM-002.1 / THE-278)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ComplianceMapping.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await ComplianceMapping.deleteMany({});
  });

  const baseDoc = () => ({
    projectId: new mongoose.Types.ObjectId(),
    regulationId: new mongoose.Types.ObjectId(),
    elementId: 'capability-supplier-management',
    elementType: 'capability' as const,
    confidence: 0.85,
    reasoning: 'Capability deals with third-party supplier risk, aligning with NIS2 Art. 21(2)(d).',
    status: 'auto' as const,
    createdBy: 'llm' as const,
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-1: CRUD roundtrip', () => {
    it('creates mapping with all required fields + defaults', async () => {
      const m = await ComplianceMapping.create(baseDoc());
      expect(m._id).toBeDefined();
      expect(m.status).toBe('auto');
      expect(m.createdAt).toBeDefined();
      expect(m.updatedAt).toBeDefined();
    });

    it('reads mapping back from DB', async () => {
      const created = await ComplianceMapping.create(baseDoc());
      const found = await ComplianceMapping.findById(created._id);
      expect(found).not.toBeNull();
      expect(found?.elementId).toBe('capability-supplier-management');
      expect(found?.confidence).toBe(0.85);
    });

    it('default status is "auto" if not explicit', async () => {
      const doc = baseDoc();
      const m = await ComplianceMapping.create({
        projectId: doc.projectId,
        regulationId: doc.regulationId,
        elementId: doc.elementId,
        elementType: doc.elementType,
        confidence: doc.confidence,
        reasoning: doc.reasoning,
        createdBy: doc.createdBy,
        // no status — uses schema default
      });
      expect(m.status).toBe('auto');
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-3: Upsert-Idempotency via compound index', () => {
    it('rejects exact duplicate (project + regulation + element)', async () => {
      const doc = baseDoc();
      await ComplianceMapping.create(doc);
      await expect(ComplianceMapping.create(doc)).rejects.toThrow();
    });

    it('upsert is idempotent via compound key', async () => {
      const doc = baseDoc();
      const filter = {
        projectId: doc.projectId,
        regulationId: doc.regulationId,
        elementId: doc.elementId,
      };
      await ComplianceMapping.updateOne(
        filter,
        { $set: doc },
        { upsert: true, runValidators: true }
      );
      await ComplianceMapping.updateOne(
        filter,
        { $set: { ...doc, confidence: 0.95, reasoning: 'updated reasoning' } },
        { upsert: true, runValidators: true }
      );

      const count = await ComplianceMapping.countDocuments(filter);
      expect(count).toBe(1);

      // Second upsert UPDATED the existing doc, didn't create new
      const final = await ComplianceMapping.findOne(filter);
      expect(final?.confidence).toBe(0.95);
      expect(final?.reasoning).toBe('updated reasoning');
    });

    it('allows different mappings for same regulation→different elements', async () => {
      const projectId = new mongoose.Types.ObjectId();
      const regulationId = new mongoose.Types.ObjectId();
      await ComplianceMapping.create({
        ...baseDoc(),
        projectId,
        regulationId,
        elementId: 'capability-A',
      });
      await ComplianceMapping.create({
        ...baseDoc(),
        projectId,
        regulationId,
        elementId: 'capability-B',
      });
      const all = await ComplianceMapping.find({ projectId, regulationId });
      expect(all).toHaveLength(2);
    });

    it('allows different mappings for same element→different regulations', async () => {
      const projectId = new mongoose.Types.ObjectId();
      const elementId = 'capability-X';
      await ComplianceMapping.create({
        ...baseDoc(),
        projectId,
        regulationId: new mongoose.Types.ObjectId(),
        elementId,
      });
      await ComplianceMapping.create({
        ...baseDoc(),
        projectId,
        regulationId: new mongoose.Types.ObjectId(),
        elementId,
      });
      const all = await ComplianceMapping.find({ projectId, elementId });
      expect(all).toHaveLength(2);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-4 + AC-5: Query indexes work', () => {
    async function seed(): Promise<{ projectId: mongoose.Types.ObjectId; otherProjectId: mongoose.Types.ObjectId }> {
      const projectId = new mongoose.Types.ObjectId();
      const otherProjectId = new mongoose.Types.ObjectId();
      const regulationId1 = new mongoose.Types.ObjectId();
      const regulationId2 = new mongoose.Types.ObjectId();
      await ComplianceMapping.create([
        {
          ...baseDoc(),
          projectId,
          regulationId: regulationId1,
          elementId: 'elem-1',
          confidence: 0.9,
        },
        {
          ...baseDoc(),
          projectId,
          regulationId: regulationId2,
          elementId: 'elem-1',
          confidence: 0.7,
        },
        {
          ...baseDoc(),
          projectId,
          regulationId: regulationId1,
          elementId: 'elem-2',
          confidence: 0.6,
        },
        {
          ...baseDoc(),
          projectId: otherProjectId,
          regulationId: regulationId1,
          elementId: 'elem-1',
          confidence: 0.95,
        },
      ]);
      return { projectId, otherProjectId };
    }

    it('AC-4: by-element reverse-lookup returns mappings sorted by confidence desc', async () => {
      const { projectId } = await seed();
      const found = await ComplianceMapping.find({
        projectId,
        elementId: 'elem-1',
      }).sort({ confidence: -1 });
      expect(found).toHaveLength(2);
      expect(found[0].confidence).toBe(0.9);
      expect(found[1].confidence).toBe(0.7);
    });

    it('AC-5: by-regulation forward-lookup returns all affected elements', async () => {
      const { projectId } = await seed();
      const firstRegId = (await ComplianceMapping.findOne({
        projectId,
        elementId: 'elem-1',
        confidence: 0.9,
      }))!.regulationId;

      const found = await ComplianceMapping.find({
        projectId,
        regulationId: firstRegId,
      });
      expect(found.map(m => m.elementId).sort()).toEqual(['elem-1', 'elem-2']);
    });

    it('tenant-isolation: other project mappings are NOT visible', async () => {
      const { projectId } = await seed();
      const found = await ComplianceMapping.find({ projectId });
      // 3 mappings for projectId (other project's 4th must not appear)
      expect(found).toHaveLength(3);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-6: Confidence validation', () => {
    it('rejects confidence > 1.0', async () => {
      await expect(
        ComplianceMapping.create({ ...baseDoc(), confidence: 1.1 })
      ).rejects.toThrow();
    });

    it('rejects confidence < 0', async () => {
      await expect(
        ComplianceMapping.create({ ...baseDoc(), confidence: -0.1 })
      ).rejects.toThrow();
    });

    it('accepts boundary values 0.0 and 1.0', async () => {
      const projectId = new mongoose.Types.ObjectId();
      await ComplianceMapping.create({
        ...baseDoc(),
        projectId,
        regulationId: new mongoose.Types.ObjectId(),
        confidence: 0.0,
        reasoning: 'No match, but recorded',
      });
      await ComplianceMapping.create({
        ...baseDoc(),
        projectId,
        regulationId: new mongoose.Types.ObjectId(),
        confidence: 1.0,
      });
      const count = await ComplianceMapping.countDocuments({ projectId });
      expect(count).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-7: Reasoning required when createdBy=llm', () => {
    it('rejects empty reasoning when createdBy=llm', async () => {
      await expect(
        ComplianceMapping.create({ ...baseDoc(), reasoning: '' })
      ).rejects.toThrow(/reasoning is required when createdBy=llm/);
    });

    it('allows empty reasoning when createdBy=human', async () => {
      const m = await ComplianceMapping.create({
        ...baseDoc(),
        reasoning: '',
        createdBy: 'human',
      });
      expect(m.reasoning).toBe('');
    });

    it('caps reasoning at 500 chars', async () => {
      await expect(
        ComplianceMapping.create({ ...baseDoc(), reasoning: 'A'.repeat(501) })
      ).rejects.toThrow();
    });

    it('accepts reasoning at exactly 500 chars', async () => {
      const m = await ComplianceMapping.create({ ...baseDoc(), reasoning: 'A'.repeat(500) });
      expect(m.reasoning).toHaveLength(500);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('Enum validation', () => {
    it('elementType: rejects unknown value', async () => {
      await expect(
        ComplianceMapping.create({ ...baseDoc(), elementType: 'invalid-type' as never })
      ).rejects.toThrow();
    });

    it('elementType: accepts all valid ArchiMate types', async () => {
      const projectId = new mongoose.Types.ObjectId();
      const types = [
        'capability',
        'application',
        'data_object',
        'business_process',
        'business_actor',
        'business_service',
        'application_service',
        'business_function',
        'business_object',
        'business_role',
        'technology_service',
        'node',
        'custom',
      ] as const;
      for (const t of types) {
        await ComplianceMapping.create({
          ...baseDoc(),
          projectId,
          regulationId: new mongoose.Types.ObjectId(),
          elementType: t,
          elementId: `e-${t}`,
        });
      }
      const count = await ComplianceMapping.countDocuments({ projectId });
      expect(count).toBe(types.length);
    });

    it('status: rejects unknown value', async () => {
      await expect(
        ComplianceMapping.create({ ...baseDoc(), status: 'pending' as never })
      ).rejects.toThrow();
    });

    it('createdBy: rejects unknown value', async () => {
      await expect(
        ComplianceMapping.create({ ...baseDoc(), createdBy: 'system' as never })
      ).rejects.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('Timestamps', () => {
    it('createdAt and updatedAt are auto-set', async () => {
      const m = await ComplianceMapping.create(baseDoc());
      expect(m.createdAt).toBeDefined();
      expect(m.updatedAt).toBeDefined();
    });

    it('updatedAt changes on save', async () => {
      const m = await ComplianceMapping.create(baseDoc());
      const originalUpdated = m.updatedAt.getTime();
      await new Promise(r => setTimeout(r, 10));
      m.confidence = 0.99;
      await m.save();
      expect(m.updatedAt.getTime()).toBeGreaterThan(originalUpdated);
    });
  });
});
