/**
 * THE-638/640 — der Remediations-Umfang aus EINER Quelle.
 *
 * ── DER BUG, DEN DIESE SUITE VERHINDERT ──
 *
 * Remediate meldete „No gaps detected" bei 14 offenen MUST-Pflichten, weil das
 * Gateway seine Zahlen selbst aus der Upload-Route ableitete (`status==='gap'`)
 * — und der Korpus-Zweig der Facade `gap` bewusst hart auf 0 setzt: „gap
 * entsteht nur als `unmapped`" (norm.service.ts, dokumentierte
 * THE-390-P2-Projektion). Eine dokumentierte Semantik, die ein Konsument
 * ignoriert hat. Deshalb liefert jetzt EINE Funktion beides — Zahlen UND die
 * Section-Ids für Generate — und diese Suite pinnt die Semantik je Welt fest.
 *
 * Setup-Muster: norm-pipeline.test.ts (In-Memory-Korpus via __setCorpusForTests).
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
  computeRemediationScope,
  computeNormMappingStats,
  getPipelineNorm,
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

async function corpusMapping(
  projectId: mongoose.Types.ObjectId,
  regulationKey: string,
  status: 'auto' | 'confirmed' | 'rejected',
) {
  return ComplianceMapping.create({
    projectId,
    regulationId: new mongoose.Types.ObjectId(),
    regulationKey,
    regulationVersionHash: 'h'.repeat(64),
    elementId: `el-${status}`,
    elementType: 'application',
    confidence: 0.9,
    reasoning: 'r',
    status,
    createdBy: 'llm',
  });
}

describe('computeRemediationScope (THE-638)', () => {
  let mongoServer: MongoMemoryServer;
  let projectId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    CorpusReg = mongoose.model<ICorpusRegulation>(
      'RemediationScopeCorpusReg',
      corpusRegulationSchema,
      'remediation_scope_corpus_test',
    );
    __setCorpusForTests(CorpusReg);
  });

  afterAll(async () => {
    __setCorpusForTests(null);
    delete process.env.CORPUS_MONGODB_URI;
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    projectId = new mongoose.Types.ObjectId();
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

  // ── KORPUS: der Fall aus dem E2E-Lauf ─────────────────────────────────
  it('corpus: a section without an active mapping IS an open item — with its id for generate', async () => {
    await seedCorpus('dsgvo:art-32', 'Sicherheit der Verarbeitung');

    const scope = await computeRemediationScope(projectId.toString(), 'corpus:dsgvo');
    expect(scope).not.toBeNull();
    // Genau der Prod-Zustand: 1 Sektion, kein Mapping → offen, nicht „no gaps".
    expect(scope!.unmapped).toBe(1);
    expect(scope!.gap).toBe(0); // die dokumentierte Projektion bleibt
    expect(scope!.openSectionIds).toHaveLength(1);

    // Die Id muss die sein, unter der die Facade die Sektion führt — sonst
    // bekommt Generate Ids, die buildComplianceGapContext nicht auflösen kann.
    const view = await getPipelineNorm(projectId.toString(), 'corpus:dsgvo');
    expect(scope!.openSectionIds[0]).toBe(view!.sections[0].id);
  });

  it('corpus: an active mapping closes the section — a rejected one does not', async () => {
    await seedCorpus('dsgvo:art-32', 'Sicherheit');
    await corpusMapping(projectId, 'dsgvo:art-32', 'auto');

    const mapped = await computeRemediationScope(projectId.toString(), 'corpus:dsgvo');
    expect(mapped!.partial).toBe(1);
    expect(mapped!.unmapped).toBe(0);
    expect(mapped!.openSectionIds).toEqual([]);

    // rejected zählt nicht als aktiv — die Sektion bleibt offen.
    await ComplianceMapping.deleteMany({});
    await corpusMapping(projectId, 'dsgvo:art-32', 'rejected');
    const rejected = await computeRemediationScope(projectId.toString(), 'corpus:dsgvo');
    expect(rejected!.unmapped).toBe(1);
    expect(rejected!.openSectionIds).toHaveLength(1);
  });

  // ── UPLOAD: byte-gleich zu heute (Schutzraum THE-568) ─────────────────
  it('upload: openSectionIds are ONLY gap-mappings — unmapped sections are counted but not fed to generate', async () => {
    const std = await Standard.create({
      projectId,
      name: 'ISO 27001',
      type: 'iso',
      sections: [
        { id: 's-gap', number: 'A.5', title: 'Policies', content: 'c', level: 1 },
        { id: 's-ok', number: 'A.6', title: 'Org', content: 'c', level: 1 },
        { id: 's-unmapped', number: 'A.7', title: 'HR', content: 'c', level: 1 },
      ],
      uploadedBy: new mongoose.Types.ObjectId(),
    });
    // Schema-Pflichten: elementId required (bei gap eine leere Referenz),
    // createdBy ist eine User-ObjectId, `source` traegt das ai/manual-Enum.
    const userId = new mongoose.Types.ObjectId();
    await StandardMapping.create({
      projectId, standardId: std._id, sectionId: 's-gap', status: 'gap',
      elementId: 'none', source: 'ai', createdBy: userId,
    });
    await StandardMapping.create({
      projectId, standardId: std._id, sectionId: 's-ok', status: 'compliant',
      elementId: 'el-1', source: 'ai', createdBy: userId,
    });

    const scope = await computeRemediationScope(projectId.toString(), String(std._id));
    expect(scope!.gap).toBe(1);
    expect(scope!.compliant).toBe(1);
    expect(scope!.unmapped).toBe(1); // s-unmapped — gezählt…
    expect(scope!.openSectionIds).toEqual(['s-gap']); // …aber NICHT im Generate-Scope
  });

  // ── EINE Zählquelle: die Stats delegieren an den Scope ────────────────
  it('computeNormMappingStats and the scope report identical counts — one counting path', async () => {
    await seedCorpus('nis2:art-21', 'Risikomanagement');
    await corpusMapping(projectId, 'nis2:art-21', 'confirmed');

    const scope = await computeRemediationScope(projectId.toString(), 'corpus:nis2');
    const stats = await computeNormMappingStats(projectId.toString(), 'corpus:nis2');
    expect(stats).toEqual({
      total: scope!.total,
      compliant: scope!.compliant,
      partial: scope!.partial,
      gap: scope!.gap,
      unmapped: scope!.unmapped,
    });
  });

  it('returns null for an unknown norm — the route turns this into a 404, not an empty scope', async () => {
    expect(await computeRemediationScope(projectId.toString(), 'corpus:gibtsnicht')).toBeNull();
  });
});
