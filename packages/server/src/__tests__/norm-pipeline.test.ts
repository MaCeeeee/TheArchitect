/**
 * THE-390 P2 — Pipeline auf Norm-Facade: eine gecrawlte Regulation läuft durch
 * die Compliance-Pipeline (State + Stats), Upload-Standards unverändert.
 *
 * Run: cd packages/server && npx jest norm-pipeline --verbose
 */
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Standard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { CompliancePipelineState } from '../models/CompliancePipelineState';
import {
  corpusRegulationSchema,
  __setCorpusForTests,
  upsertCorpusRegulation,
  type ICorpusRegulation,
} from '../services/corpusClient.service';
import { resetFallbackStats } from '../services/regulationResolver.service';
import {
  getOrCreatePipelineState,
  refreshMappingStats,
  getPortfolioOverview,
} from '../services/compliance-pipeline.service';
import { derivePipelineAnchorId } from '../services/norm.service';

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

async function corpusMapping(
  projectId: mongoose.Types.ObjectId,
  regulationKey: string,
  elementId: string,
  status: 'auto' | 'confirmed' | 'rejected' = 'auto',
) {
  return ComplianceMapping.create({
    projectId,
    regulationId: new mongoose.Types.ObjectId(),
    regulationKey,
    regulationVersionHash: 'h'.repeat(64),
    elementId,
    elementType: 'application',
    confidence: 0.9,
    reasoning: 'r',
    status,
    createdBy: 'llm',
  });
}

describe('pipeline over norm facade (THE-390 P2)', () => {
  let mongoServer: MongoMemoryServer;
  let projectId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    CorpusReg = mongoose.model<ICorpusRegulation>(
      'PipelineCorpusReg',
      corpusRegulationSchema,
      'pipeline_corpus_test',
    );
    __setCorpusForTests(CorpusReg);
    await CompliancePipelineState.ensureIndexes();
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
    await CompliancePipelineState.deleteMany({});
    await CorpusReg.deleteMany({});
    delete process.env.CORPUS_MONGODB_URI;
    resetFallbackStats();
  });

  it('adds a corpus norm to the pipeline: state carries normId + deterministic anchor', async () => {
    await seedCorpus('dsgvo:art-30', 'Verzeichnis');
    await corpusMapping(projectId, 'dsgvo:art-30', 'el-1');

    const state = await getOrCreatePipelineState(projectId.toString(), 'corpus:dsgvo');
    expect(state.normId).toBe('corpus:dsgvo');
    expect(String(state.standardId)).toBe(String(derivePipelineAnchorId('corpus:dsgvo')));

    // Idempotent — second call returns the same state.
    const again = await getOrCreatePipelineState(projectId.toString(), 'corpus:dsgvo');
    expect(String(again._id)).toBe(String(state._id));
  });

  it('refreshes mapping stats for a corpus norm (lifecycle → conformance projection)', async () => {
    await seedCorpus('dsgvo:art-5', 'Grundsätze');
    await seedCorpus('dsgvo:art-30', 'Verzeichnis');
    await seedCorpus('dsgvo:art-32', 'Sicherheit');
    await corpusMapping(projectId, 'dsgvo:art-5', 'el-1', 'confirmed');
    await corpusMapping(projectId, 'dsgvo:art-30', 'el-2', 'auto');
    await corpusMapping(projectId, 'dsgvo:art-32', 'el-3', 'rejected');

    const state = await refreshMappingStats(projectId.toString(), 'corpus:dsgvo');

    expect(state.mappingStats).toMatchObject({
      total: 3,        // 3 referenzierte Paragraphen = 3 Sections
      compliant: 1,    // confirmed
      partial: 1,      // auto (LLM-vorgeschlagen, unbestätigt)
      gap: 0,          // Korpus kennt kein gap-Urteil
      unmapped: 1,     // art-32: einziges Mapping rejected → kein aktives Mapping
    });
    // Non-gap mappings vorhanden → Stage rückt auf 'mapped' vor.
    expect(state.stage).toBe('mapped');
  });

  it('upload standards keep identical stats semantics (regression)', async () => {
    const std = await Standard.create({
      projectId,
      name: 'ISO 27001',
      type: 'iso',
      sections: [
        { id: 's1', title: 'A.5', number: 'A.5', content: 'c', level: 1 },
        { id: 's2', title: 'A.8', number: 'A.8', content: 'c', level: 1 },
      ],
      uploadedBy: userId,
    });
    await StandardMapping.create({
      projectId,
      standardId: std._id,
      sectionId: 's1',
      elementId: 'el-1',
      status: 'compliant',
      confidence: 0.9,
      createdBy: userId,
    });

    const state = await refreshMappingStats(projectId.toString(), String(std._id));
    expect(state.normId).toBeUndefined();
    expect(String(state.standardId)).toBe(String(std._id));
    expect(state.mappingStats).toMatchObject({
      total: 2, compliant: 1, partial: 0, gap: 0, unmapped: 1,
    });
  });

  it('portfolio overview keeps corpus states (no orphan-delete) and labels them', async () => {
    await seedCorpus('nis2:art-21', 'Maßnahmen');
    await corpusMapping(projectId, 'nis2:art-21', 'el-1', 'confirmed');
    await refreshMappingStats(projectId.toString(), 'corpus:nis2');

    const overview = await getPortfolioOverview(projectId.toString());

    const corpusRow = overview.portfolio.find(p => p.normId === 'corpus:nis2');
    expect(corpusRow).toBeDefined();
    expect(corpusRow!.standardName).toBe('NIS2');
    expect(corpusRow!.standardType).toBe('legislation');
    expect(corpusRow!.coverage).toBe(100);

    // Der Korpus-State überlebt den Orphan-Cleanup.
    const stillThere = await CompliancePipelineState.findOne({
      projectId,
      normId: 'corpus:nis2',
    });
    expect(stillThere).not.toBeNull();
  });
});
