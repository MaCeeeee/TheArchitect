/**
 * ComplianceRequirement Model Tests — REQ-REQGEN-001.1 / THE-302
 *
 * Run: cd packages/server && npx jest src/__tests__/ComplianceRequirement.model.test.ts --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ComplianceRequirement } from '../models/ComplianceRequirement';

describe('ComplianceRequirement Model (REQ-REQGEN-001.1 / THE-302)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ComplianceRequirement.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await ComplianceRequirement.deleteMany({});
  });

  const baseDoc = () => ({
    projectId: new mongoose.Types.ObjectId(),
    regulationId: new mongoose.Types.ObjectId(),
    sourceParagraph: '§ 6 LkSG fordert Präventionsmaßnahmen gegenüber Zulieferern.',
    title: 'Risikoanalyse für Tier-1-Zulieferer durchführen',
    description:
      'Das Unternehmen MUSS einmal jährlich und bei begründetem Anlass eine Risikoanalyse für alle direkten Zulieferer durchführen und dokumentieren.',
    priority: 'must' as const,
    linkedElementIds: ['cap-lieferantenmanagement', 'app-sap-erp'],
    createdBy: 'llm' as const,
    extractionConfidence: 0.92,
    extractionRationale: 'Satz 1 verlangt explizit eine Risikoanalyse — klare Pflicht.',
    mappingConfidence: 0.85,
    mappingRationale: 'Lieferantenmanagement führt die geforderte Risikoanalyse aus.',
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-1: CRUD roundtrip', () => {
    it('creates requirement with all required fields + defaults', async () => {
      const r = await ComplianceRequirement.create(baseDoc());
      expect(r._id).toBeDefined();
      expect(r.status).toBe('open'); // default
      expect(r.createdAt).toBeDefined();
      expect(r.updatedAt).toBeDefined();
    });

    it('reads requirement back from DB', async () => {
      const created = await ComplianceRequirement.create(baseDoc());
      const found = await ComplianceRequirement.findById(created._id);
      expect(found).not.toBeNull();
      expect(found?.title).toBe('Risikoanalyse für Tier-1-Zulieferer durchführen');
      expect(found?.priority).toBe('must');
      expect(found?.linkedElementIds).toHaveLength(2);
    });

    it('updates status open → in_progress → done', async () => {
      const r = await ComplianceRequirement.create(baseDoc());
      r.status = 'in_progress';
      await r.save();
      r.status = 'done';
      await r.save();
      const fresh = await ComplianceRequirement.findById(r._id);
      expect(fresh?.status).toBe('done');
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-3: Upsert-Idempotency via compound index', () => {
    it('rejects exact duplicate (project + regulation + title)', async () => {
      const doc = baseDoc();
      await ComplianceRequirement.create(doc);
      await expect(ComplianceRequirement.create(doc)).rejects.toThrow();
    });

    it('upsert is idempotent via compound key', async () => {
      const doc = baseDoc();
      const filter = {
        projectId: doc.projectId,
        regulationId: doc.regulationId,
        title: doc.title,
      };
      await ComplianceRequirement.updateOne(
        filter,
        { $set: doc },
        { upsert: true, runValidators: true },
      );
      await ComplianceRequirement.updateOne(
        filter,
        { $set: { ...doc, priority: 'should', extractionConfidence: 0.78 } },
        { upsert: true, runValidators: true },
      );

      const count = await ComplianceRequirement.countDocuments(filter);
      expect(count).toBe(1);
      const final = await ComplianceRequirement.findOne(filter);
      expect(final?.priority).toBe('should');
      expect(final?.extractionConfidence).toBe(0.78);
    });

    it('allows different titles for same regulation', async () => {
      const projectId = new mongoose.Types.ObjectId();
      const regulationId = new mongoose.Types.ObjectId();
      await ComplianceRequirement.create({
        ...baseDoc(),
        projectId,
        regulationId,
        title: 'Risikoanalyse durchführen',
      });
      await ComplianceRequirement.create({
        ...baseDoc(),
        projectId,
        regulationId,
        title: 'Präventionsmaßnahmen dokumentieren',
      });
      const count = await ComplianceRequirement.countDocuments({ projectId, regulationId });
      expect(count).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-4: Query indexes work', () => {
    async function seed(): Promise<{ projectId: mongoose.Types.ObjectId; otherProjectId: mongoose.Types.ObjectId }> {
      const projectId = new mongoose.Types.ObjectId();
      const otherProjectId = new mongoose.Types.ObjectId();
      const reg1 = new mongoose.Types.ObjectId();
      const reg2 = new mongoose.Types.ObjectId();
      await ComplianceRequirement.create([
        { ...baseDoc(), projectId, regulationId: reg1, title: 'Title Alpha', priority: 'must', status: 'open', linkedElementIds: ['e1'] },
        { ...baseDoc(), projectId, regulationId: reg1, title: 'Title Bravo', priority: 'should', status: 'in_progress', linkedElementIds: ['e1', 'e2'] },
        { ...baseDoc(), projectId, regulationId: reg2, title: 'Title Charlie', priority: 'must', status: 'done', linkedElementIds: ['e2'] },
        { ...baseDoc(), projectId, regulationId: reg2, title: 'Title Delta', priority: 'may', status: 'open', linkedElementIds: [] },
        // Other-project leak canary
        { ...baseDoc(), projectId: otherProjectId, regulationId: reg1, title: 'Title Alpha', priority: 'must', status: 'open', linkedElementIds: ['e1'] },
      ]);
      return { projectId, otherProjectId };
    }

    it('by-status filter (Dashboard)', async () => {
      const { projectId } = await seed();
      const open = await ComplianceRequirement.find({ projectId, status: 'open' });
      expect(open).toHaveLength(2); // A + D
    });

    it('by-priority filter', async () => {
      const { projectId } = await seed();
      const must = await ComplianceRequirement.find({ projectId, priority: 'must' });
      expect(must).toHaveLength(2); // A + C
    });

    it('by-regulation reverse-lookup', async () => {
      const { projectId } = await seed();
      const reg1Id = (await ComplianceRequirement.findOne({ projectId, title: 'Title Alpha' }))!.regulationId;
      const found = await ComplianceRequirement.find({ projectId, regulationId: reg1Id });
      expect(found.map(r => r.title).sort()).toEqual(['Title Alpha', 'Title Bravo']);
    });

    it('by-element multikey reverse-lookup', async () => {
      const { projectId } = await seed();
      const e1Reqs = await ComplianceRequirement.find({ projectId, linkedElementIds: 'e1' });
      expect(e1Reqs.map(r => r.title).sort()).toEqual(['Title Alpha', 'Title Bravo']);

      const e2Reqs = await ComplianceRequirement.find({ projectId, linkedElementIds: 'e2' });
      expect(e2Reqs.map(r => r.title).sort()).toEqual(['Title Bravo', 'Title Charlie']);
    });

    it('tenant-isolation: other project not visible', async () => {
      const { projectId } = await seed();
      const all = await ComplianceRequirement.find({ projectId });
      expect(all).toHaveLength(4); // not 5
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('Validation', () => {
    it('rejects unknown priority', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), priority: 'critical' as never }),
      ).rejects.toThrow();
    });

    it('rejects unknown status', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), status: 'archived' as never }),
      ).rejects.toThrow();
    });

    it('rejects unknown createdBy', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), createdBy: 'system' as never }),
      ).rejects.toThrow();
    });

    it('rejects title < 5 chars', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), title: 'x' }),
      ).rejects.toThrow();
    });

    it('rejects title > 200 chars', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), title: 'A'.repeat(201) }),
      ).rejects.toThrow();
    });

    it('rejects description > 2000 chars', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), description: 'A'.repeat(2001) }),
      ).rejects.toThrow();
    });

    it('rejects extractionConfidence > 1', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), extractionConfidence: 1.5 }),
      ).rejects.toThrow();
    });

    it('rejects extractionConfidence < 0', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), extractionConfidence: -0.1 }),
      ).rejects.toThrow();
    });

    it('rejects llm-Provenance without extractionConfidence', async () => {
      const { extractionConfidence, ...noConf } = baseDoc();
      void extractionConfidence;
      await expect(
        ComplianceRequirement.create({ ...noConf, createdBy: 'llm' }),
      ).rejects.toThrow(/extractionConfidence is required when createdBy=llm/);
    });

    it('rejects llm-Provenance without extractionRationale', async () => {
      const { extractionRationale, ...noRat } = baseDoc();
      void extractionRationale;
      await expect(
        ComplianceRequirement.create({ ...noRat, createdBy: 'llm' }),
      ).rejects.toThrow(/extractionRationale is required when createdBy=llm/);
    });

    it('accepts human-Provenance without extractionConfidence', async () => {
      const { extractionConfidence, extractionRationale, ...noConf } = baseDoc();
      void extractionConfidence;
      void extractionRationale;
      const r = await ComplianceRequirement.create({ ...noConf, createdBy: 'human' });
      expect(r.extractionConfidence).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('linkedElementIds (multikey)', () => {
    it('accepts empty array (orphan requirement — strukturell noch nicht zugeordnet)', async () => {
      const r = await ComplianceRequirement.create({ ...baseDoc(), linkedElementIds: [] });
      expect(r.linkedElementIds).toEqual([]);
    });

    it('accepts single + multiple element-ids', async () => {
      const r = await ComplianceRequirement.create({
        ...baseDoc(),
        linkedElementIds: ['e1', 'e2', 'e3'],
      });
      expect(r.linkedElementIds).toHaveLength(3);
    });

    it('rejects empty-string element-ids', async () => {
      await expect(
        ComplianceRequirement.create({ ...baseDoc(), linkedElementIds: ['valid', ''] }),
      ).rejects.toThrow(/non-empty strings/);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('Optional fields', () => {
    it('accepts assigneeId + dueDate', async () => {
      const assigneeId = new mongoose.Types.ObjectId();
      const dueDate = new Date('2027-12-31');
      const r = await ComplianceRequirement.create({
        ...baseDoc(),
        assigneeId,
        dueDate,
      });
      expect(r.assigneeId?.toString()).toBe(assigneeId.toString());
      expect(r.dueDate?.toISOString().startsWith('2027-12-31')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('Timestamps', () => {
    it('createdAt and updatedAt are auto-set', async () => {
      const r = await ComplianceRequirement.create(baseDoc());
      expect(r.createdAt).toBeDefined();
      expect(r.updatedAt).toBeDefined();
    });

    it('updatedAt changes on save', async () => {
      const r = await ComplianceRequirement.create(baseDoc());
      const originalUpdated = r.updatedAt.getTime();
      await new Promise(res => setTimeout(res, 10));
      r.status = 'in_progress';
      await r.save();
      expect(r.updatedAt.getTime()).toBeGreaterThan(originalUpdated);
    });
  });
});
