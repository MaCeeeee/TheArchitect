/**
 * Regulation Resolver Tests (THE-368 D2) — corpus-first read with app-DB fallback.
 *
 * Run: cd packages/server && npx jest regulationResolver --verbose
 */
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Regulation } from '../models/Regulation';
import { ComplianceMapping } from '../models/ComplianceMapping';
import {
  corpusRegulationSchema,
  __setCorpusForTests,
  upsertCorpusRegulation,
  type ICorpusRegulation,
} from '../services/corpusClient.service';
import { countRegulations, getRegulationsForProject } from '../services/regulationResolver.service';

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

async function appRegulation(projectId: mongoose.Types.ObjectId, source: string, para: string) {
  return Regulation.create({
    projectId,
    source,
    jurisdiction: 'EU',
    paragraphNumber: para,
    title: 'app ' + para,
    fullText: 'y'.repeat(60),
    sourceUrl: 'https://example',
    effectiveFrom: new Date('2018-05-25'),
    language: 'de',
    version: 1,
  });
}

describe('regulationResolver (THE-368 D2)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    CorpusReg = mongoose.model<ICorpusRegulation>('ResolverCorpusReg', corpusRegulationSchema, 'resolver_corpus_test');
    __setCorpusForTests(CorpusReg);
    await Regulation.ensureIndexes();
    await ComplianceMapping.ensureIndexes();
  });

  afterAll(async () => {
    __setCorpusForTests(null);
    delete process.env.CORPUS_MONGODB_URI;
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
    await ComplianceMapping.deleteMany({});
    await CorpusReg.deleteMany({});
    delete process.env.CORPUS_MONGODB_URI;
  });

  describe('countRegulations', () => {
    it('counts the corpus when configured', async () => {
      process.env.CORPUS_MONGODB_URI = 'mongodb://injected';
      await seedCorpus('lksg:3', 'a');
      await seedCorpus('lksg:4', 'b');
      expect(await countRegulations()).toBe(2);
    });

    it('falls back to app-DB count when corpus not configured', async () => {
      const pid = new mongoose.Types.ObjectId();
      await appRegulation(pid, 'lksg', '§ 3');
      await appRegulation(pid, 'lksg', '§ 4');
      await appRegulation(pid, 'lksg', '§ 5');
      expect(await countRegulations()).toBe(3); // CORPUS_MONGODB_URI unset by afterEach default
    });
  });

  describe('getRegulationsForProject', () => {
    it('resolves the project mappings\' keys from the corpus', async () => {
      process.env.CORPUS_MONGODB_URI = 'mongodb://injected';
      const pid = new mongoose.Types.ObjectId();
      await seedCorpus('dsgvo:art-30', 'Verzeichnis');
      await ComplianceMapping.create({
        projectId: pid,
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

      const regs = await getRegulationsForProject(pid.toString());
      expect(regs).toHaveLength(1);
      expect(regs[0]).toMatchObject({ regulationKey: 'dsgvo:art-30', title: 'Verzeichnis' });
    });

    it('falls back to per-project app-DB regs when the project has no corpus keys', async () => {
      process.env.CORPUS_MONGODB_URI = 'mongodb://injected';
      const pid = new mongoose.Types.ObjectId();
      await appRegulation(pid, 'lksg', '§ 6'); // no mappings → no corpus keys → fallback
      const regs = await getRegulationsForProject(pid.toString());
      expect(regs).toHaveLength(1);
      expect(regs[0]).toMatchObject({ paragraphNumber: '§ 6', title: 'app § 6' });
    });
  });
});
