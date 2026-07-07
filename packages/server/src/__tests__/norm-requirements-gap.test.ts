/**
 * THE-390 P3 — Requirements/Gap auf Norm: REQGEN persistiert gegen normId
 * (Korpus-Gesetze UND Upload-Standards), die Gap-Analyse gruppiert norm-aware.
 *
 * Run: cd packages/server && npx jest norm-requirements-gap --verbose
 */
import mongoose, { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Standard } from '../models/Standard';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';
import {
  corpusRegulationSchema,
  __setCorpusForTests,
  upsertCorpusRegulation,
  type ICorpusRegulation,
} from '../services/corpusClient.service';
import { resetFallbackStats } from '../services/regulationResolver.service';
import { generateRequirementsFromText } from '../services/requirementGenerator.service';
import { derivePipelineAnchorId } from '../services/norm.service';
import { computeComplianceGaps } from '../services/compliance-gaps.service';

let CorpusReg: Model<ICorpusRegulation>;

const LLM_RESPONSE = JSON.stringify({
  requirements: [
    {
      title: 'Verzeichnis der Verarbeitungstätigkeiten führen',
      description: 'Der Verantwortliche MUSS ein Verzeichnis aller Verarbeitungstätigkeiten führen.',
      priority: 'must',
      linkedElementIds: [],
      extractionConfidence: 0.95,
      extractionRationale: 'Art. 30 Abs. 1 verlangt das Verzeichnis explizit.',
      mappingConfidence: 0,
      mappingRationale: 'Keine Kandidaten übergeben.',
    },
  ],
});

function makeMockAnthropic(responseText: string) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  } as any;
}

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

describe('requirements + gaps on norms (THE-390 P3)', () => {
  let mongoServer: MongoMemoryServer;
  let projectId: mongoose.Types.ObjectId;
  let userId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    CorpusReg = mongoose.model<ICorpusRegulation>(
      'ReqGapCorpusReg',
      corpusRegulationSchema,
      'reqgap_corpus_test',
    );
    __setCorpusForTests(CorpusReg);
    await ComplianceRequirement.ensureIndexes();
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
    await ComplianceMapping.deleteMany({});
    await ComplianceRequirement.deleteMany({});
    await Regulation.deleteMany({});
    await CorpusReg.deleteMany({});
    delete process.env.CORPUS_MONGODB_URI;
    resetFallbackStats();
  });

  it('persists norm-based requirements with anchor + normId/sectionEId, idempotently', async () => {
    const { persisted } = await generateRequirementsFromText({
      text: 'Der Verantwortliche muss ein Verzeichnis aller Verarbeitungstätigkeiten führen und aktuell halten.',
      source: 'dsgvo',
      paragraphNumber: 'Art. 30',
      language: 'de',
      jurisdiction: 'EU',
      persist: true,
      projectId: projectId.toString(),
      normId: 'corpus:dsgvo',
      sectionEId: 'dsgvo:art-30',
      anthropicClient: makeMockAnthropic(LLM_RESPONSE),
    });

    expect(persisted).toHaveLength(1);
    expect(persisted![0]).toMatchObject({
      normId: 'corpus:dsgvo',
      sectionEId: 'dsgvo:art-30',
    });
    expect(String(persisted![0].regulationId)).toBe(
      String(derivePipelineAnchorId('corpus:dsgvo')),
    );

    // Re-Run mit identischem Titel → Upsert, kein Duplikat (Idempotenz erhalten).
    await generateRequirementsFromText({
      text: 'Der Verantwortliche muss ein Verzeichnis aller Verarbeitungstätigkeiten führen und aktuell halten.',
      source: 'dsgvo',
      paragraphNumber: 'Art. 30',
      language: 'de',
      jurisdiction: 'EU',
      persist: true,
      projectId: projectId.toString(),
      normId: 'corpus:dsgvo',
      sectionEId: 'dsgvo:art-30',
      anthropicClient: makeMockAnthropic(LLM_RESPONSE),
    });
    expect(await ComplianceRequirement.countDocuments({ projectId })).toBe(1);
  });

  it('upload standards can carry requirements too (normId = upload:<standardId>)', async () => {
    const std = await Standard.create({
      projectId,
      name: 'ISO 27001',
      type: 'iso',
      sections: [{ id: 's1', title: 'A.5 Policies', number: 'A.5', content: 'c'.repeat(30), level: 1 }],
      uploadedBy: userId,
    });
    const normId = `upload:${std._id}`;

    const { persisted } = await generateRequirementsFromText({
      text: 'Information security policies MUST be defined and approved by management.',
      source: 'iso27001',
      paragraphNumber: 'A.5',
      language: 'en',
      jurisdiction: 'EU',
      persist: true,
      projectId: projectId.toString(),
      normId,
      sectionEId: 's1',
      anthropicClient: makeMockAnthropic(LLM_RESPONSE),
    });

    expect(persisted).toHaveLength(1);
    expect(persisted![0].normId).toBe(normId);
  });

  it('gap analysis groups norm requirements under the normId with facade title', async () => {
    await seedCorpus('nis2:art-21', 'Maßnahmen');
    await ComplianceMapping.create({
      projectId,
      regulationId: new mongoose.Types.ObjectId(),
      regulationKey: 'nis2:art-21',
      regulationVersionHash: 'h'.repeat(64),
      elementId: 'el-1',
      elementType: 'application',
      confidence: 0.9,
      reasoning: 'r',
      status: 'auto',
      createdBy: 'llm',
    });

    // Norm-basiertes Requirement (P3) + legacy Requirement (Mischbetrieb).
    await ComplianceRequirement.create({
      projectId,
      regulationId: derivePipelineAnchorId('corpus:nis2'),
      normId: 'corpus:nis2',
      sectionEId: 'nis2:art-21',
      title: 'Risikomanagement-Maßnahmen umsetzen',
      description: 'Geeignete technische und organisatorische Maßnahmen umsetzen.',
      priority: 'must',
      linkedElementIds: [],
      status: 'open',
      createdBy: 'human',
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
      description: 'Jährliche Risikoanalyse für Zulieferer.',
      priority: 'must',
      linkedElementIds: [],
      status: 'open',
      createdBy: 'human',
    });

    const { summary } = await computeComplianceGaps(projectId.toString());

    expect(summary.total).toBe(2);
    const normGroup = summary.byRegulation.find(g => g.regulationId === 'corpus:nis2');
    const legacyGroup = summary.byRegulation.find(g => g.regulationId === String(legacyReg._id));
    expect(normGroup).toMatchObject({ regulationTitle: 'NIS2', total: 1, open: 1 });
    expect(legacyGroup).toMatchObject({ regulationTitle: 'Sorgfaltspflichten', total: 1 });

    // Filter per normId (Nicht-ObjectId → normId-Query).
    const filtered = await computeComplianceGaps(projectId.toString(), {
      regulationId: 'corpus:nis2',
    });
    expect(filtered.summary.total).toBe(1);
    expect(filtered.items[0].regulationId).toBe('corpus:nis2');
  });
});
