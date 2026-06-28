/**
 * Corpus Read-Path Tests (THE-368): corpus client + drift detection + seed migration.
 *
 * Run: cd packages/server && npx jest corpus-readpath --verbose
 */
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildRegulationKey } from '@thearchitect/shared';
import { Regulation } from '../models/Regulation';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { computeVersionHash } from '../utils/regulationVersion';
import {
  corpusRegulationSchema,
  __setCorpusForTests,
  getRegulationByKey,
  getCurrentVersionHashes,
  upsertCorpusRegulation,
  type ICorpusRegulation,
} from '../services/corpusClient.service';
import { detectMappingDrift } from '../services/regulationDrift.service';
import { seedCorpusFromProjects } from '../scripts/seed-corpus-from-projects';

const TEXT_A = 'Jeder Verantwortliche führt ein Verzeichnis aller Verarbeitungstätigkeiten seiner Zuständigkeit.';
const TEXT_B = 'Unternehmen müssen angemessene Sorgfaltspflichten in ihren Lieferketten beachten und umsetzen.';
const HASH_A = computeVersionHash(TEXT_A);

let CorpusReg: Model<ICorpusRegulation>;

async function seedCorpus(entries: Array<{ key: string; text: string }>) {
  for (const e of entries) {
    await upsertCorpusRegulation({
      regulationKey: e.key,
      versionHash: computeVersionHash(e.text),
      source: e.key.split(':')[0],
      jurisdiction: 'EU',
      paragraphNumber: e.key.split(':')[1],
      title: 't',
      fullText: e.text,
      sourceUrl: 'https://example',
      effectiveFrom: new Date('2018-05-25'),
      language: 'de',
      version: 1,
      crawledAt: new Date(),
    } as Parameters<typeof upsertCorpusRegulation>[0]);
  }
}

async function makeAppRegulation(source: string, paragraphNumber: string, fullText: string) {
  return Regulation.create({
    projectId: new mongoose.Types.ObjectId(),
    source,
    jurisdiction: 'EU',
    paragraphNumber,
    title: 'title',
    fullText,
    sourceUrl: 'https://example',
    effectiveFrom: new Date('2018-05-25'),
    language: 'de',
    version: 1,
  });
}

async function makeMapping(key: string, hash: string) {
  return ComplianceMapping.create({
    projectId: new mongoose.Types.ObjectId(),
    regulationId: new mongoose.Types.ObjectId(),
    regulationKey: key,
    regulationVersionHash: hash,
    elementId: 'el-' + Math.random().toString(36).slice(2, 8),
    elementType: 'application',
    confidence: 0.9,
    reasoning: 'r',
    status: 'auto',
    createdBy: 'llm',
  });
}

describe('Corpus read-path (THE-368)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    process.env.CORPUS_MONGODB_URI = 'mongodb://injected'; // isCorpusConfigured() → true; model is injected
    // Isolated corpus model: separate collection so it never collides with app-DB regulations.
    CorpusReg = mongoose.model<ICorpusRegulation>('TestCorpusReg', corpusRegulationSchema, 'corpus_regs_test');
    __setCorpusForTests(CorpusReg);
    await Regulation.ensureIndexes();
    await ComplianceMapping.ensureIndexes();
    await CorpusReg.ensureIndexes();
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
  });

  describe('corpus client', () => {
    it('reads a regulation by key and resolves current version hashes', async () => {
      await seedCorpus([{ key: 'dsgvo:art-30', text: TEXT_A }, { key: 'lksg:6', text: TEXT_B }]);

      const reg = await getRegulationByKey('dsgvo:art-30');
      expect(reg?.versionHash).toBe(HASH_A);

      const map = await getCurrentVersionHashes(['dsgvo:art-30', 'lksg:6', 'missing:x']);
      expect(map.get('dsgvo:art-30')).toBe(HASH_A);
      expect(map.has('missing:x')).toBe(false);
    });
  });

  describe('drift detection', () => {
    it('flags mismatches, leaves in-sync clean, counts unknown', async () => {
      await seedCorpus([{ key: 'dsgvo:art-30', text: TEXT_A }]);
      const inSync = await makeMapping('dsgvo:art-30', HASH_A);
      const drifted = await makeMapping('dsgvo:art-30', 'OLD_HASH');
      await makeMapping('unknown:y', 'whatever'); // not in corpus

      const report = await detectMappingDrift({ apply: true });
      expect(report).toMatchObject({ applied: true, total: 3, mismatched: 1, inSync: 1, unknownInCorpus: 1 });

      expect((await ComplianceMapping.findById(drifted._id))?.regulationVersionMismatch).toBe(true);
      expect((await ComplianceMapping.findById(inSync._id))?.regulationVersionMismatch).toBe(false);
    });

    it('dry-run writes nothing', async () => {
      await seedCorpus([{ key: 'dsgvo:art-30', text: TEXT_A }]);
      const drifted = await makeMapping('dsgvo:art-30', 'OLD_HASH');

      const report = await detectMappingDrift({ apply: false });
      expect(report.mismatched).toBe(1);
      expect((await ComplianceMapping.findById(drifted._id))?.regulationVersionMismatch).toBeUndefined();
    });
  });

  describe('seed migration', () => {
    it('dedupes per-project regulations into the corpus, idempotently', async () => {
      // two projects with the same DSGVO Art.30 paragraph + one LkSG
      await makeAppRegulation('dsgvo', 'Art. 30', TEXT_A);
      await makeAppRegulation('dsgvo', 'Art. 30', TEXT_A);
      await makeAppRegulation('lksg', '§ 6', TEXT_B);

      const dry = await seedCorpusFromProjects({ apply: false });
      expect(dry).toMatchObject({ sourceDocs: 3, uniqueKeys: 2, inserted: 0 });
      expect(await CorpusReg.countDocuments()).toBe(0);

      const first = await seedCorpusFromProjects({ apply: true });
      expect(first).toMatchObject({ sourceDocs: 3, uniqueKeys: 2, inserted: 2 });
      expect(await CorpusReg.countDocuments()).toBe(2);
      expect((await getRegulationByKey(buildRegulationKey('dsgvo', 'Art. 30')))?.versionHash).toBe(HASH_A);

      const second = await seedCorpusFromProjects({ apply: true });
      expect(second).toMatchObject({ inserted: 0, upsertedOrSkipped: 2 });
      expect(await CorpusReg.countDocuments()).toBe(2);
    });
  });
});
