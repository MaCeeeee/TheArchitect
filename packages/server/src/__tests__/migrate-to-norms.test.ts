/**
 * THE-390 P4a — Norm-Materialisierung + Requirement-Backfill.
 *
 * Run: cd packages/server && npx jest migrate-to-norms --verbose
 */
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Standard } from '../models/Standard';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';
import { Norm } from '../models/Norm';
import {
  corpusRegulationSchema,
  __setCorpusForTests,
  upsertCorpusRegulation,
  type ICorpusRegulation,
} from '../services/corpusClient.service';
import { resetFallbackStats } from '../services/regulationResolver.service';
import { runNormMigration } from '../scripts/migrate-to-norms';

let CorpusReg: Model<ICorpusRegulation>;

describe('migrate-to-norms (THE-390 P4a)', () => {
  let mongoServer: MongoMemoryServer;
  let projectId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    CorpusReg = mongoose.model<ICorpusRegulation>(
      'MigrateCorpusReg',
      corpusRegulationSchema,
      'migrate_corpus_test',
    );
    __setCorpusForTests(CorpusReg);
    await Norm.ensureIndexes();
  });

  afterAll(async () => {
    __setCorpusForTests(null);
    delete process.env.CORPUS_MONGODB_URI;
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    projectId = new mongoose.Types.ObjectId();
    userId = new mongoose.Types.ObjectId();
    process.env.CORPUS_MONGODB_URI = 'mongodb://injected';

    // Fixture: 1 Upload-Standard, 1 Korpus-Gesetz (via Mapping referenziert),
    // 1 legacy Requirement (ohne normId).
    await Standard.create({
      projectId,
      name: 'ISO 27001',
      type: 'iso',
      sections: [{ id: 's1', title: 'A.5', number: 'A.5', content: 'c', level: 1 }],
      uploadedBy: userId,
    });
    await upsertCorpusRegulation({
      regulationKey: 'dsgvo:art-30',
      versionHash: 'h'.repeat(64),
      source: 'dsgvo',
      jurisdiction: 'EU',
      paragraphNumber: 'art-30',
      title: 'Verzeichnis',
      fullText: 'x'.repeat(60),
      sourceUrl: 'https://example',
      effectiveFrom: new Date('2018-05-25'),
      language: 'de',
      version: 1,
      crawledAt: new Date(),
    } as Parameters<typeof upsertCorpusRegulation>[0]);
    await ComplianceMapping.create({
      projectId,
      regulationId: new mongoose.Types.ObjectId(),
      regulationKey: 'dsgvo:art-30',
      regulationVersionHash: 'h'.repeat(64),
      elementId: 'el-1',
      elementType: 'application',
      confidence: 0.9,
      reasoning: 'r',
      status: 'auto',
      createdBy: 'llm',
    });
    const legacyReg = await Regulation.create({
      projectId,
      source: 'lksg',
      jurisdiction: 'DE',
      paragraphNumber: '§ 3',
      title: 'Sorgfaltspflichten',
      fullText: 'y'.repeat(60),
      sourceUrl: 'https://example',
      effectiveFrom: new Date('2023-01-01'),
      language: 'de',
      version: 1,
    });
    await ComplianceRequirement.create({
      projectId,
      regulationId: legacyReg._id,
      title: 'Risikoanalyse durchführen',
      description: 'Jährliche Risikoanalyse.',
      priority: 'must',
      linkedElementIds: [],
      status: 'open',
      createdBy: 'human',
    });
  });

  afterEach(async () => {
    await Promise.all([
      Standard.deleteMany({}),
      ComplianceMapping.deleteMany({}),
      ComplianceRequirement.deleteMany({}),
      Regulation.deleteMany({}),
      Norm.deleteMany({}),
      CorpusReg.deleteMany({}),
    ]);
    delete process.env.CORPUS_MONGODB_URI;
    resetFallbackStats();
  });

  it('dry-run counts without writing', async () => {
    const report = await runNormMigration({ apply: false });
    expect(report).toMatchObject({
      applied: false,
      projects: 1,
      normsMaterialized: 2, // 1 Standard + 1 Korpus-Gesetz (dsgvo)
      requirementsTotal: 1,
      requirementsBackfilled: 1,
    });
    expect(await Norm.countDocuments({})).toBe(0);
    const req = await ComplianceRequirement.findOne({ projectId });
    expect(req!.normId).toBeUndefined();
  });

  it('apply materializes norms + backfills requirements, idempotently', async () => {
    const first = await runNormMigration({ apply: true });
    expect(first.normsMaterialized).toBe(2);
    expect(first.requirementsBackfilled).toBe(1);

    const norms = await Norm.find({ projectId }).sort({ source: 1 });
    expect(norms.map(n => n.source).sort()).toEqual(['corpus', 'upload']);
    const corpusNorm = norms.find(n => n.source === 'corpus')!;
    expect(corpusNorm.workId).toBe('corpus:dsgvo');
    expect(corpusNorm.sections).toHaveLength(1);

    const req = await ComplianceRequirement.findOne({ projectId });
    expect(req!.normId).toBe('corpus:lksg');
    expect(req!.sectionEId).toBe('lksg:3'); // buildRegulationKey normalisiert '§ 3'

    // Idempotenz: zweiter Lauf ändert nichts an den Zählern des Bestands.
    const second = await runNormMigration({ apply: true });
    expect(second.requirementsTotal).toBe(0);
    expect(second.requirementsBackfilled).toBe(0);
    expect(await Norm.countDocuments({ projectId })).toBe(2); // Upserts, keine Duplikate
  });
});
