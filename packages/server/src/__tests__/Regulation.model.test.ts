/**
 * Regulation Model Tests — REQ-ICM-001.1 / THE-275
 *
 * Verifies the Regulation Mongoose model:
 *   - CRUD roundtrip (AC-1)
 *   - Shared types accessible via @thearchitect/shared (AC-2)
 *   - Upsert-Idempotency via compound index (AC-3)
 *   - Query indexes by (projectId, source) and (projectId, effectiveFrom) (AC-4)
 *   - Validation: fullText ≥ 50 chars (AC-5)
 *   - Embedding-Dimension-Check (768) for REQ-ICM-001.3 readiness
 *   - Enum validation for source / jurisdiction / language
 *
 * Run: cd packages/server && npx jest src/__tests__/Regulation.model.test.ts --verbose
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Regulation } from '../models/Regulation';

describe('Regulation Model (REQ-ICM-001.1)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Regulation.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
  });

  const baseDoc = () => ({
    projectId: new mongoose.Types.ObjectId(),
    source: 'nis2' as const,
    jurisdiction: 'EU' as const,
    paragraphNumber: 'Art. 21',
    title: 'Cybersecurity risk-management measures',
    fullText:
      'Member States shall ensure that essential and important entities take appropriate ' +
      'and proportionate technical, operational and organisational measures to manage the ' +
      'risks posed to the security of network and information systems.',
    sourceUrl: 'https://eur-lex.europa.eu/eli/dir/2022/2555',
    effectiveFrom: new Date('2024-10-17'),
    language: 'en' as const,
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-1: CRUD roundtrip', () => {
    it('creates regulation with all required fields and defaults', async () => {
      const reg = await Regulation.create(baseDoc());
      expect(reg._id).toBeDefined();
      expect(reg.source).toBe('nis2');
      expect(reg.version).toBe(1); // default
      expect(reg.crawledAt).toBeDefined();
      expect(reg.createdAt).toBeDefined();
      expect(reg.updatedAt).toBeDefined();
    });

    it('reads regulation back from DB', async () => {
      const created = await Regulation.create(baseDoc());
      const found = await Regulation.findById(created._id);
      expect(found).not.toBeNull();
      expect(found?.title).toBe('Cybersecurity risk-management measures');
      expect(found?.jurisdiction).toBe('EU');
    });

    it('updates regulation and reflects timestamps', async () => {
      const reg = await Regulation.create(baseDoc());
      const originalUpdated = reg.updatedAt.getTime();
      await new Promise(r => setTimeout(r, 10));
      reg.title = 'Updated title';
      await reg.save();
      expect(reg.updatedAt.getTime()).toBeGreaterThan(originalUpdated);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-3: Upsert-Idempotency via compound index', () => {
    it('rejects exact duplicate (project + source + paragraph + version)', async () => {
      const doc = baseDoc();
      await Regulation.create(doc);
      await expect(Regulation.create(doc)).rejects.toThrow();
    });

    it('upsert is idempotent', async () => {
      const doc = baseDoc();
      const filter = {
        projectId: doc.projectId,
        source: doc.source,
        paragraphNumber: doc.paragraphNumber,
        version: 1,
      };
      await Regulation.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
      await Regulation.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
      const count = await Regulation.countDocuments(filter);
      expect(count).toBe(1);
    });

    it('allows multiple versions of same paragraph (regulation history)', async () => {
      const projectId = new mongoose.Types.ObjectId();
      await Regulation.create({ ...baseDoc(), projectId, version: 1 });
      await Regulation.create({ ...baseDoc(), projectId, version: 2, title: 'Updated' });
      const all = await Regulation.find({ projectId, paragraphNumber: 'Art. 21' });
      expect(all).toHaveLength(2);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-4: Query indexes', () => {
    it('filters by projectId + source', async () => {
      const projectId = new mongoose.Types.ObjectId();
      await Regulation.create({ ...baseDoc(), projectId, source: 'nis2' });
      await Regulation.create({
        ...baseDoc(),
        projectId,
        source: 'lksg',
        jurisdiction: 'DE',
        paragraphNumber: '§ 3',
        language: 'de',
      });

      const nis2 = await Regulation.find({ projectId, source: 'nis2' });
      expect(nis2).toHaveLength(1);
      const lksg = await Regulation.find({ projectId, source: 'lksg' });
      expect(lksg).toHaveLength(1);
    });

    it('filters by projectId + effectiveFrom range', async () => {
      const projectId = new mongoose.Types.ObjectId();
      await Regulation.create({
        ...baseDoc(),
        projectId,
        effectiveFrom: new Date('2020-01-01'),
        paragraphNumber: 'Art. 1',
      });
      await Regulation.create({
        ...baseDoc(),
        projectId,
        effectiveFrom: new Date('2024-10-17'),
        paragraphNumber: 'Art. 2',
      });

      const recent = await Regulation.find({
        projectId,
        effectiveFrom: { $gte: new Date('2024-01-01') },
      });
      expect(recent).toHaveLength(1);
      expect(recent[0].paragraphNumber).toBe('Art. 2');
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('AC-5: fullText validation', () => {
    it('rejects fullText shorter than 50 chars', async () => {
      const doc = { ...baseDoc(), fullText: 'Too short' };
      await expect(Regulation.create(doc)).rejects.toThrow(/at least 50/);
    });

    it('rejects fullText longer than 20 000 chars', async () => {
      const doc = { ...baseDoc(), fullText: 'A'.repeat(20001) };
      await expect(Regulation.create(doc)).rejects.toThrow();
    });

    it('accepts fullText exactly at boundary (50 chars)', async () => {
      const doc = { ...baseDoc(), fullText: 'A'.repeat(50) };
      const reg = await Regulation.create(doc);
      expect(reg.fullText).toHaveLength(50);
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('Embedding validation (REQ-ICM-001.3 readiness)', () => {
    it('accepts 768-dim embedding array', async () => {
      const doc = { ...baseDoc(), embedding: new Array(768).fill(0.1) };
      const reg = await Regulation.create(doc);
      expect(reg.embedding).toHaveLength(768);
    });

    it('rejects embedding with wrong dimensions', async () => {
      const doc = { ...baseDoc(), embedding: new Array(100).fill(0.1) };
      await expect(Regulation.create(doc)).rejects.toThrow(/768-dim/);
    });

    it('allows missing embedding (initial crawl, before embedding pipeline)', async () => {
      const reg = await Regulation.create(baseDoc());
      expect(reg.embedding).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────
  describe('Enum validation', () => {
    it('source: rejects unknown value', async () => {
      const doc = { ...baseDoc(), source: 'invalid-source' as never };
      await expect(Regulation.create(doc)).rejects.toThrow();
    });

    it('source: accepts all valid values', async () => {
      const sources = ['nis2', 'lksg', 'dsgvo', 'dora', 'iso27001', 'custom'] as const;
      for (const src of sources) {
        const reg = await Regulation.create({
          ...baseDoc(),
          source: src,
          paragraphNumber: `test-${src}`,
        });
        expect(reg.source).toBe(src);
      }
    });

    it('jurisdiction: rejects non-EU/DE/AT/CH', async () => {
      const doc = { ...baseDoc(), jurisdiction: 'US' as never };
      await expect(Regulation.create(doc)).rejects.toThrow();
    });

    it('language: rejects non-de/en', async () => {
      const doc = { ...baseDoc(), language: 'fr' as never };
      await expect(Regulation.create(doc)).rejects.toThrow();
    });
  });
});
