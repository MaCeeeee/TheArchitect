/**
 * Norm-Facade Tests (THE-390 P1) — Lese-Projektion über Upload- + Korpus-Welt.
 *
 * Run: cd packages/server && npx jest norm.service --verbose
 */
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import { ComplianceMapping } from '../models/ComplianceMapping';
import {
  corpusRegulationSchema,
  __setCorpusForTests,
  upsertCorpusRegulation,
  type ICorpusRegulation,
} from '../services/corpusClient.service';
import { resetFallbackStats } from '../services/regulationResolver.service';
import {
  listNorms,
  getNorm,
  getNormMappings,
  listAvailableCorpusNorms,
  complianceMappingToNormMappingView,
} from '../services/norm.service';

let CorpusReg: Model<ICorpusRegulation>;

async function seedCorpus(key: string, title: string) {
  await upsertCorpusRegulation({
    regulationKey: key,
    versionHash: 'h'.repeat(64),
    source: key.split(':')[0],
    jurisdiction: 'EU',
    paragraphNumber: key.split(':')[1],
    title,
    fullText: 'x'.repeat(60),
    sourceUrl: 'https://example',
    effectiveFrom: new Date('2018-05-25'),
    language: 'de',
    version: 1,
    crawledAt: new Date(),
  } as Parameters<typeof upsertCorpusRegulation>[0]);
}

async function seedStandard(projectId: mongoose.Types.ObjectId, userId: mongoose.Types.ObjectId) {
  return Standard.create({
    projectId,
    name: 'ISO 27001',
    version: '2022',
    type: 'iso',
    sections: [
      { id: 's1', title: 'A.5 Policies', number: 'A.5', content: 'policy text', level: 1 },
      { id: 's2', title: 'A.8 Asset management', number: 'A.8', content: 'asset text', level: 1 },
    ],
    uploadedBy: userId,
  });
}

async function corpusMapping(
  projectId: mongoose.Types.ObjectId,
  regulationKey: string,
  elementId: string,
) {
  return ComplianceMapping.create({
    projectId,
    regulationId: new mongoose.Types.ObjectId(),
    regulationKey,
    regulationVersionHash: 'h'.repeat(64),
    elementId,
    elementType: 'application',
    confidence: 0.9,
    reasoning: 'because',
    status: 'auto',
    createdBy: 'llm',
  });
}

describe('norm.service facade (THE-390 P1)', () => {
  let mongoServer: MongoMemoryServer;
  let projectId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    CorpusReg = mongoose.model<ICorpusRegulation>(
      'NormCorpusReg',
      corpusRegulationSchema,
      'norm_corpus_test',
    );
    __setCorpusForTests(CorpusReg);
    await Standard.ensureIndexes();
    await StandardMapping.ensureIndexes();
    await ComplianceMapping.ensureIndexes();
  });

  afterAll(async () => {
    __setCorpusForTests(null);
    delete process.env.CORPUS_MONGODB_URI;
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    projectId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    process.env.CORPUS_MONGODB_URI = 'mongodb://injected';
  });

  afterEach(async () => {
    await Standard.deleteMany({});
    await StandardMapping.deleteMany({});
    await ComplianceMapping.deleteMany({});
    await CorpusReg.deleteMany({});
    delete process.env.CORPUS_MONGODB_URI;
    resetFallbackStats();
  });

  describe('listNorms — projects both worlds', () => {
    it('returns an upload Norm and a corpus Norm, source-labelled', async () => {
      await seedStandard(projectId, userId);
      await seedCorpus('dsgvo:art-5', 'Grundsätze');
      await seedCorpus('dsgvo:art-30', 'Verzeichnis');
      await corpusMapping(projectId, 'dsgvo:art-5', 'el-1');
      await corpusMapping(projectId, 'dsgvo:art-30', 'el-2');

      const norms = await listNorms(projectId.toString());

      expect(norms).toHaveLength(2);
      const upload = norms.find(n => n.source === 'upload');
      const corpus = norms.find(n => n.source === 'corpus');

      expect(upload).toBeDefined();
      expect(upload!.identity.workId).toMatch(/^upload:/);
      expect(upload!.title).toBe('ISO 27001');
      expect(upload!.sections).toHaveLength(2);
      expect(upload!.sections[0]).toMatchObject({ eId: 's1', heading: 'A.5 Policies', number: 'A.5' });
      expect(upload!.kind).toBe('technical_standard');

      expect(corpus).toBeDefined();
      expect(corpus!.identity.workId).toBe('corpus:dsgvo');
      expect(corpus!.jurisdiction).toBe('EU');
      expect(corpus!.kind).toBe('legislation');
      // Das Gesetz ist die Norm, die zwei referenzierten Paragraphen sind ihre Sections.
      expect(corpus!.sections).toHaveLength(2);
      expect(corpus!.sections.map(s => s.eId)).toEqual(
        expect.arrayContaining(['dsgvo:art-5', 'dsgvo:art-30']),
      );
    });

    it('groups paragraphs of the same law into ONE corpus Norm', async () => {
      await seedCorpus('nis2:art-21', 'Maßnahmen');
      await seedCorpus('nis2:art-23', 'Meldung');
      await corpusMapping(projectId, 'nis2:art-21', 'el-1');
      await corpusMapping(projectId, 'nis2:art-23', 'el-2');

      const norms = await listNorms(projectId.toString());
      const nis2 = norms.filter(n => n.identity.workId === 'corpus:nis2');
      expect(nis2).toHaveLength(1);
      expect(nis2[0].sections).toHaveLength(2);
    });

    it('is deterministic — same workIds across repeated calls', async () => {
      await seedStandard(projectId, userId);
      await seedCorpus('dora:art-28', 'Register');
      await corpusMapping(projectId, 'dora:art-28', 'el-1');

      const a = await listNorms(projectId.toString());
      const b = await listNorms(projectId.toString());
      expect(a.map(n => n.identity.workId).sort()).toEqual(b.map(n => n.identity.workId).sort());
    });
  });

  describe('getNorm', () => {
    it('resolves a corpus Norm by workId', async () => {
      await seedCorpus('dsgvo:art-30', 'Verzeichnis');
      await corpusMapping(projectId, 'dsgvo:art-30', 'el-1');
      const norm = await getNorm(projectId.toString(), 'corpus:dsgvo');
      expect(norm).not.toBeNull();
      expect(norm!.source).toBe('corpus');
    });

    it('returns null for an unknown workId', async () => {
      expect(await getNorm(projectId.toString(), 'corpus:unknown')).toBeNull();
    });
  });

  describe('getNormMappings — status vocabulary stays separated', () => {
    it('projects StandardMappings with conformance statusKind', async () => {
      const std = await seedStandard(projectId, userId);
      await StandardMapping.create({
        projectId,
        standardId: std._id,
        sectionId: 's1',
        elementId: 'el-1',
        status: 'partial',
        confidence: 0.7,
        createdBy: userId,
      });

      const rows = await getNormMappings(projectId.toString(), `upload:${std._id}`);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source: 'upload',
        statusKind: 'conformance',
        status: 'partial',
        sectionEId: 's1',
        elementId: 'el-1',
      });
    });

    it('projects ComplianceMappings with lifecycle statusKind + corpusRef', async () => {
      await seedCorpus('dsgvo:art-30', 'Verzeichnis');
      await corpusMapping(projectId, 'dsgvo:art-30', 'el-2');
      const rows = await getNormMappings(projectId.toString(), 'corpus:dsgvo');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source: 'corpus',
        statusKind: 'lifecycle',
        status: 'auto',
        reasoning: 'because',
        createdBy: 'llm',
        sectionEId: 'dsgvo:art-30',
      });
      expect(rows[0].corpusRef?.regulationKey).toBe('dsgvo:art-30');

      // THE-413 AC-4: the regulationKey captured on the stored mapping is the
      // SAME key the facade resolves the corpus-backed NormView section by —
      // no drift between "which identity got persisted" and "which section it
      // addresses" across the wfcomp key-utility collapse (Task 9).
      const norm = await getNorm(projectId.toString(), 'corpus:dsgvo');
      expect(norm!.sections.map(s => s.eId)).toContain(rows[0].corpusRef?.regulationKey);
    });

    it('returns [] for an unknown workId prefix', async () => {
      expect(await getNormMappings(projectId.toString(), 'weird:xyz')).toEqual([]);
    });
  });

  describe('P4b — dedupe, browse, unreferenced corpus norms', () => {
    it('dedupes sections sharing a regulationKey (live-paste duplicates)', async () => {
      // Zwei App-DB-Fallback-Regs mit demselben Key existieren nicht direkt im
      // Korpus-Testmodell (unique key+version) — der Dedupe greift aber auch,
      // wenn mehrere Mappings denselben Paragraphen referenzieren.
      await seedCorpus('lksg:live-paste', 'Pasted text');
      await corpusMapping(projectId, 'lksg:live-paste', 'el-1');
      await corpusMapping(projectId, 'lksg:live-paste', 'el-2'); // gleicher §, zweites Element

      const norms = await listNorms(projectId.toString());
      const lksg = norms.find(n => n.identity.workId === 'corpus:lksg');
      expect(lksg).toBeDefined();
      expect(lksg!.sections.filter(s => s.eId === 'lksg:live-paste')).toHaveLength(1);
    });

    it('lists available (unreferenced) corpus laws for browse', async () => {
      await seedCorpus('dsgvo:art-30', 'Verzeichnis');
      await seedCorpus('nis2:art-21', 'Maßnahmen');
      await corpusMapping(projectId, 'dsgvo:art-30', 'el-1'); // dsgvo referenziert, nis2 nicht

      const available = await listAvailableCorpusNorms(projectId.toString());
      const ids = available.map(n => n.identity.workId);
      expect(ids).toContain('corpus:nis2');
      expect(ids).not.toContain('corpus:dsgvo');
    });

    it('getNorm resolves an UNreferenced corpus law directly from the corpus', async () => {
      await seedCorpus('nis2:art-21', 'Maßnahmen');
      await seedCorpus('nis2:art-23', 'Meldung');

      const norm = await getNorm(projectId.toString(), 'corpus:nis2');
      expect(norm).not.toBeNull();
      expect(norm!.sections).toHaveLength(2);
      expect(norm!.source).toBe('corpus');
    });
  });

  describe('complianceMappingToNormMappingView — honest null-skip', () => {
    it('skips a legacy mapping without a corpus reference (no identity to derive)', () => {
      const v = complianceMappingToNormMappingView({
        elementId: 'el-1',
        status: 'auto',
        confidence: 0.5,
      });
      expect(v).toBeNull();
    });
  });
});
