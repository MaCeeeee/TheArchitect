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
import {
  countRegulations,
  getRegulationsForProject,
  getFallbackStats,
  resetFallbackStats,
} from '../services/regulationResolver.service';

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
    delete process.env.CORPUS_STRICT_READS;
    resetFallbackStats();
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

  describe('fallback telemetry + strict mode (THE-419)', () => {
    it('counts a corpusUnconfigured fallback when the corpus is not configured', async () => {
      const pid = new mongoose.Types.ObjectId();
      await appRegulation(pid, 'lksg', '§ 3');
      await getRegulationsForProject(pid.toString());
      expect(getFallbackStats()).toMatchObject({ corpusUnconfigured: 1, corpusMiss: 0 });
    });

    it('counts a corpusMiss fallback when the corpus is configured but yields nothing', async () => {
      process.env.CORPUS_MONGODB_URI = 'mongodb://injected';
      const pid = new mongoose.Types.ObjectId();
      await appRegulation(pid, 'lksg', '§ 6'); // no mappings → no corpus keys → fallback
      await getRegulationsForProject(pid.toString());
      expect(getFallbackStats()).toMatchObject({ corpusUnconfigured: 0, corpusMiss: 1 });
    });

    it('does NOT count a fallback on a corpus hit', async () => {
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
      await getRegulationsForProject(pid.toString());
      expect(getFallbackStats()).toMatchObject({ corpusUnconfigured: 0, corpusMiss: 0 });
    });

    it('strict mode: getRegulationsForProject returns [] instead of falling back', async () => {
      process.env.CORPUS_MONGODB_URI = 'mongodb://injected';
      process.env.CORPUS_STRICT_READS = 'true';
      const pid = new mongoose.Types.ObjectId();
      await appRegulation(pid, 'lksg', '§ 6'); // would be served by legacy fallback
      const regs = await getRegulationsForProject(pid.toString());
      expect(regs).toEqual([]);
      expect(getFallbackStats()).toMatchObject({ corpusUnconfigured: 0, corpusMiss: 0 });
    });

    it('falls back to app-DB when the corpus read THROWS (unreachable / auth failure)', async () => {
      process.env.CORPUS_MONGODB_URI = 'mongodb://injected';
      const pid = new mongoose.Types.ObjectId();
      await appRegulation(pid, 'lksg', '§ 6');
      await ComplianceMapping.create({
        projectId: pid,
        regulationId: new mongoose.Types.ObjectId(),
        regulationKey: 'lksg:6',
        regulationVersionHash: 'h'.repeat(64),
        elementId: 'el-1',
        elementType: 'application',
        confidence: 0.9,
        reasoning: 'r',
        status: 'auto',
        createdBy: 'llm',
      });
      // Korpus-Modell, dessen find() wirft (simuliert Auth-Fehler / Korpus down).
      const throwing = {
        find: () => {
          throw new Error('Authentication failed.');
        },
      } as unknown as Model<ICorpusRegulation>;
      __setCorpusForTests(throwing);

      // Darf NICHT werfen — fällt auf die App-DB-Kopie zurück.
      const regs = await getRegulationsForProject(pid.toString());
      expect(regs.some(r => r.paragraphNumber === '§ 6')).toBe(true);

      __setCorpusForTests(CorpusReg); // restore
    });

    it('strict mode: countRegulations returns 0 instead of counting the app-DB', async () => {
      process.env.CORPUS_STRICT_READS = 'true';
      const pid = new mongoose.Types.ObjectId();
      await appRegulation(pid, 'lksg', '§ 3');
      expect(await countRegulations()).toBe(0);
      expect(getFallbackStats()).toMatchObject({ corpusUnconfigured: 0, corpusMiss: 0 });
    });
  });
});
