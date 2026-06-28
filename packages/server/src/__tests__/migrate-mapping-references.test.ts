/**
 * Migration Tests — Corpus-Referenz auf ComplianceMappings (THE-306 / ADR-0001)
 *
 * Run: cd packages/server && npx jest migrate-mapping-references --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildRegulationKey } from '@thearchitect/shared';
import { Regulation } from '../models/Regulation';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { computeVersionHash } from '../utils/regulationVersion';
import { runMappingReferenceMigration } from '../scripts/migrate-mapping-references';

const FULL_TEXT =
  'Jeder Verantwortliche und gegebenenfalls sein Vertreter führen ein Verzeichnis aller Verarbeitungstätigkeiten, die ihrer Zuständigkeit unterliegen.';

async function makeRegulation() {
  return Regulation.create({
    projectId: new mongoose.Types.ObjectId(),
    source: 'dsgvo',
    jurisdiction: 'EU',
    paragraphNumber: 'Art. 30',
    title: 'Verzeichnis von Verarbeitungstätigkeiten',
    fullText: FULL_TEXT,
    sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    effectiveFrom: new Date('2018-05-25'),
    language: 'de',
    version: 1,
  });
}

async function makeMapping(regulationId: mongoose.Types.ObjectId) {
  return ComplianceMapping.create({
    projectId: new mongoose.Types.ObjectId(),
    regulationId,
    elementId: 'app-123',
    elementType: 'application',
    confidence: 0.9,
    reasoning: 'records of processing',
    status: 'auto',
    createdBy: 'llm',
    // intentionally NO regulationKey / regulationVersionHash (legacy mapping)
  });
}

describe('runMappingReferenceMigration (THE-306)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Regulation.ensureIndexes();
    await ComplianceMapping.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Regulation.deleteMany({});
    await ComplianceMapping.deleteMany({});
  });

  it('dry-run reports the gap but writes nothing', async () => {
    const reg = await makeRegulation();
    await makeMapping(reg._id as mongoose.Types.ObjectId);

    const report = await runMappingReferenceMigration({ apply: false });
    expect(report).toMatchObject({ applied: false, total: 1, updated: 1, skippedNoRegulation: 0 });

    const m = await ComplianceMapping.findOne({});
    expect(m?.regulationKey).toBeUndefined();
    expect(m?.regulationVersionHash).toBeUndefined();
  });

  it('--apply backfills regulationKey + versionHash from the referenced Regulation', async () => {
    const reg = await makeRegulation();
    await makeMapping(reg._id as mongoose.Types.ObjectId);

    const report = await runMappingReferenceMigration({ apply: true });
    expect(report).toMatchObject({ applied: true, total: 1, updated: 1 });

    const m = await ComplianceMapping.findOne({});
    expect(m?.regulationKey).toBe(buildRegulationKey('dsgvo', 'Art. 30')); // "dsgvo:art-30"
    expect(m?.regulationKey).toBe('dsgvo:art-30');
    expect(m?.regulationVersionHash).toBe(computeVersionHash(FULL_TEXT));
    expect(m?.regulationVersionHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is idempotent — a second run finds nothing to do', async () => {
    const reg = await makeRegulation();
    await makeMapping(reg._id as mongoose.Types.ObjectId);
    await runMappingReferenceMigration({ apply: true });

    const second = await runMappingReferenceMigration({ apply: true });
    expect(second.total).toBe(0);
    expect(second.updated).toBe(0);
  });

  it('skips mappings whose referenced Regulation is gone', async () => {
    await makeMapping(new mongoose.Types.ObjectId()); // dangling regulationId

    const report = await runMappingReferenceMigration({ apply: true });
    expect(report.skippedNoRegulation).toBe(1);
    expect(report.updated).toBe(0);
  });
});
