/**
 * Norm-Facade (UC-CANON-001 / THE-390 P1) — Lese-Abstraktion, die die zwei
 * gewachsenen Welten auf EINE quellenagnostische Sicht projiziert:
 *   - Upload-Welt:   Standard / StandardMapping
 *   - Korpus-Welt:   Regulation (via regulationResolver) / ComplianceMapping
 *
 * Strangler-Muster wie `regulationResolver`: additiv, non-breaking. Diese Facade
 * LIEST nur — sie migriert nichts, schreibt nichts, wertet keine Applicability/
 * Gap-Logik aus (= P3) und entscheidet keine Korrektheit. Bricht sie, fällt nur
 * die neue Sicht aus; bestehende Endpunkte bleiben unberührt (Umstellung = P2).
 */
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import {
  deriveNormWorkId,
  lawSourceFromRegulationKey,
  type NormView,
  type NormSectionView,
  type NormMappingView,
  type NormAlias,
} from '@thearchitect/shared';
import { Standard, IStandard } from '../models/Standard';
import { StandardMapping } from '../models/StandardMapping';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { CompliancePipelineState } from '../models/CompliancePipelineState';
import {
  getRegulationsForProject,
  type RegulationView,
} from './regulationResolver.service';
import {
  isCorpusConfigured,
  listCorpusBySource,
  CorpusRegulation,
  type ICorpusRegulation,
} from './corpusClient.service';

// ─── Projektions-Funktionen (die einzige Stelle, an der die Quelle sichtbar ist) ───

/** Best-effort NormKind-Ableitung aus dem Standard-Typ (P1; echte Typisierung E6/P3). */
function kindFromStandardType(type: string): string {
  switch (type) {
    case 'iso':
    case 'aspice':
      return 'technical_standard';
    case 'togaf':
      return 'framework';
    default:
      return 'custom';
  }
}

/** Best-effort NormKind-Ableitung aus dem Korpus-`source` (P1). */
function kindFromCorpusSource(source: string): string {
  return source.startsWith('iso') ? 'technical_standard' : 'legislation';
}

export function standardToNormView(std: IStandard): NormView {
  const standardId = String(std._id);
  const aliases: NormAlias[] = [{ scheme: 'standardId', value: standardId, isPrimaryDisplay: true }];
  const sections: NormSectionView[] = (std.sections ?? []).map(s => ({
    eId: s.id,
    path: s.id,
    heading: s.title,
    number: s.number || undefined,
    text: s.content || undefined,
    level: s.level ?? 1,
  }));
  return {
    identity: {
      workId: deriveNormWorkId('upload', standardId),
      aliases,
      frbrLevel: 'work',
    },
    source: 'upload',
    projectId: String(std.projectId),
    title: std.name,
    version: std.version || undefined,
    kind: kindFromStandardType(std.type),
    sections,
  };
}

/**
 * Projiziert die Korpus-Regulationen EINES Gesetzes (gleicher `source`) auf eine
 * Norm — das Gesetz ist die Norm, die Paragraphen sind ihre Sections.
 */
export function regulationsToNormView(
  projectId: string,
  source: string,
  regs: RegulationView[],
): NormView {
  // Dedupe nach eId: der App-DB-Fallback kann denselben regulationKey mehrfach
  // liefern (z. B. mehrere „Paste & See"-Docs → `lksg:live-paste`) — eine Section
  // pro eId, die erste gewinnt (Resolver liefert korpus-first).
  const seen = new Set<string>();
  const sections: NormSectionView[] = [];
  for (const r of regs) {
    const eId = r.regulationKey ?? `${source}:${r.paragraphNumber}`;
    if (seen.has(eId)) continue;
    seen.add(eId);
    sections.push({
      eId,
      path: eId,
      heading: r.title,
      number: r.paragraphNumber,
      text: r.fullText,
      level: 1,
    });
  }
  const aliases: NormAlias[] = [{ scheme: 'abbrev', value: source, isPrimaryDisplay: true }];
  const jurisdiction = regs[0]?.jurisdiction;
  return {
    identity: {
      workId: deriveNormWorkId('corpus', source),
      aliases,
      frbrLevel: 'work',
      expressionLanguage: regs[0]?.language,
    },
    source: 'corpus',
    projectId,
    title: source.toUpperCase(),
    jurisdiction,
    kind: kindFromCorpusSource(source),
    sections,
  };
}

export function standardMappingToNormMappingView(m: {
  standardId: mongoose.Types.ObjectId;
  sectionId: string;
  elementId: string;
  status: string;
  confidence: number;
}): NormMappingView {
  return {
    source: 'upload',
    normId: deriveNormWorkId('upload', String(m.standardId)),
    sectionEId: m.sectionId,
    elementId: m.elementId,
    status: m.status,
    statusKind: 'conformance',
    confidence: m.confidence ?? 0,
  };
}

export function complianceMappingToNormMappingView(m: {
  regulationKey?: string;
  regulationVersionHash?: string;
  elementId: string;
  status: string;
  confidence: number;
  reasoning?: string;
  createdBy?: string;
}): NormMappingView | null {
  // Ohne Korpus-Referenz lässt sich keine Norm-Identität ableiten (Legacy-only
  // Mappings vor der Backfill-Migration) — bewusst übersprungen, nicht geraten.
  if (!m.regulationKey) return null;
  const source = lawSourceFromRegulationKey(m.regulationKey);
  return {
    source: 'corpus',
    normId: deriveNormWorkId('corpus', source),
    sectionEId: m.regulationKey,
    elementId: m.elementId,
    status: m.status,
    statusKind: 'lifecycle',
    confidence: m.confidence ?? 0,
    reasoning: m.reasoning,
    createdBy: m.createdBy,
    corpusRef: { regulationKey: m.regulationKey, versionHash: m.regulationVersionHash },
  };
}

// ─── Öffentliche Facade ───

/** Alle Normen eines Projekts — Upload-Standards + Korpus-Gesetze, als NormView. */
export async function listNorms(projectId: string): Promise<NormView[]> {
  const [standards, regs] = await Promise.all([
    Standard.find({ projectId }),
    getRegulationsForProject(projectId),
  ]);

  const uploadNorms = standards.map(standardToNormView);

  // Korpus-Regulationen nach Gesetz (`source`) gruppieren → je Gesetz eine Norm.
  const bySource = new Map<string, RegulationView[]>();
  for (const r of regs) {
    const bucket = bySource.get(r.source) ?? [];
    bucket.push(r);
    bySource.set(r.source, bucket);
  }
  const corpusNorms = [...bySource.entries()].map(([source, group]) =>
    regulationsToNormView(projectId, source, group),
  );

  return [...uploadNorms, ...corpusNorms];
}

function corpusRegToRegulationView(r: ICorpusRegulation): RegulationView {
  return {
    regulationKey: r.regulationKey,
    source: r.source,
    jurisdiction: r.jurisdiction,
    paragraphNumber: r.paragraphNumber,
    title: r.title,
    fullText: r.fullText,
    summary: r.summary,
    sourceUrl: r.sourceUrl,
    effectiveFrom: r.effectiveFrom,
    language: r.language,
  };
}

/** Eine Norm per workId (`upload:<standardId>` | `corpus:<source>`). */
export async function getNorm(projectId: string, workId: string): Promise<NormView | null> {
  const norms = await listNorms(projectId);
  const found = norms.find(n => n.identity.workId === workId);
  if (found) return found;

  // THE-390 P4b: noch NICHT referenzierte Korpus-Gesetze (Browse → „Add to
  // pipeline") direkt aus dem Korpus auflösen — alle Paragraphen des Gesetzes.
  if (workId.startsWith('corpus:') && isCorpusConfigured()) {
    const source = workId.slice('corpus:'.length);
    const regs = await listCorpusBySource([source]);
    if (regs.length > 0) {
      return regulationsToNormView(projectId, source, regs.map(corpusRegToRegulationView));
    }
  }
  return null;
}

/**
 * Im Korpus verfügbare, vom Projekt noch NICHT referenzierte Gesetze (Browse,
 * THE-390 P4b). Leer, wenn kein Korpus konfiguriert ist (App-DB-Fallback kennt
 * nur projekt-lokale Kopien — dort gibt es nichts zu browsen).
 */
export async function listAvailableCorpusNorms(projectId: string): Promise<NormView[]> {
  if (!isCorpusConfigured()) return [];
  const referenced = new Set(
    (await listNorms(projectId))
      .filter(n => n.source === 'corpus')
      .map(n => n.identity.workId),
  );
  const sources = (await CorpusRegulation().distinct('source')) as string[];
  const availableSources = sources.filter(s => !referenced.has(deriveNormWorkId('corpus', s)));
  if (availableSources.length === 0) return [];
  const regs = await listCorpusBySource(availableSources);
  const bySource = new Map<string, ICorpusRegulation[]>();
  for (const r of regs) {
    const bucket = bySource.get(r.source) ?? [];
    bucket.push(r);
    bySource.set(r.source, bucket);
  }
  return [...bySource.entries()].map(([source, group]) =>
    regulationsToNormView(projectId, source, group.map(corpusRegToRegulationView)),
  );
}

/** Alle Mappings einer Norm, als NormMappingView. */
export async function getNormMappings(
  projectId: string,
  workId: string,
): Promise<NormMappingView[]> {
  if (workId.startsWith('upload:')) {
    const standardId = workId.slice('upload:'.length);
    if (!mongoose.isValidObjectId(standardId)) return [];
    const rows = await StandardMapping.find({ standardId: new mongoose.Types.ObjectId(standardId) });
    return rows.map(standardMappingToNormMappingView);
  }
  if (workId.startsWith('corpus:')) {
    const source = workId.slice('corpus:'.length);
    const rows = await ComplianceMapping.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      regulationKey: { $regex: `^${escapeRegExp(source)}:` },
    });
    return rows
      .map(complianceMappingToNormMappingView)
      .filter((v): v is NormMappingView => v !== null);
  }
  return [];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── P2: Pipeline-Sicht (THE-390 P2) ───
//
// Die Pipeline-Welt (compliance-pipeline, remediation, ai-match, Matrix) braucht
// von einer Norm nur Metadaten + flache Sections. `getPipelineNorm` liefert genau
// das — quellenagnostisch. Eine `ref` ist entweder eine legacy `standardId`
// (ObjectId-String), ein `upload:<standardId>`- oder ein `corpus:<source>`-workId.

export interface PipelineNormSection {
  id: string;
  title: string;
  number: string;
  content: string;
  level: number;
}

export interface PipelineNormView {
  /** Pipeline-Identität: standardId (upload) bzw. workId (corpus). */
  id: string;
  source: 'upload' | 'corpus';
  name: string;
  type: string;
  version?: string;
  sections: PipelineNormSection[];
}

/** Stats im Vokabular der Pipeline (conformance) — Korpus-Lifecycle wird projiziert. */
export interface NormMappingStats {
  total: number;
  compliant: number;
  partial: number;
  gap: number;
  unmapped: number;
}

/**
 * P2-Brücke: `CompliancePipelineState.standardId` ist required+unique (ObjectId).
 * Korpus-Normen haben kein Standard-Doc — sie ankern über eine DETERMINISTISCHE
 * ObjectId aus dem workId-Hash (md5→24 hex). Ehrlich ein Platzhalter: der echte
 * Schlüssel ist `normId`; der Anker stirbt in P4 mit dem Index-Flip (ADR-0004 E4).
 */
export function derivePipelineAnchorId(workId: string): mongoose.Types.ObjectId {
  const hex = createHash('md5').update(workId).digest('hex').slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function isCorpusRef(ref: string): boolean {
  return ref.startsWith('corpus:');
}

/** Quellenagnostische Pipeline-Sicht einer Norm. */
export async function getPipelineNorm(
  projectId: string,
  ref: string,
): Promise<PipelineNormView | null> {
  if (isCorpusRef(ref)) {
    const norm = await getNorm(projectId, ref);
    if (!norm) return null;
    return {
      id: norm.identity.workId,
      source: 'corpus',
      name: norm.title,
      type: norm.kind ?? 'legislation',
      sections: norm.sections.map(s => ({
        id: s.eId,
        title: s.heading,
        number: s.number ?? '',
        content: s.text ?? '',
        level: s.level,
      })),
    };
  }
  const standardId = ref.startsWith('upload:') ? ref.slice('upload:'.length) : ref;
  if (!mongoose.isValidObjectId(standardId)) return null;
  const std = await Standard.findById(standardId);
  if (!std || String(std.projectId) !== String(projectId)) {
    // Kein Standard-Doc: die ObjectId kann der deterministische PIPELINE-ANCHOR
    // einer Korpus-Norm sein (CompliancePipelineState.standardId, P2). Legacy-
    // Konsumenten, die rohe State-IDs durchreichen, werden hier auf den
    // kanonischen normId aufgelöst — heilt alle Aufrufer am Seam.
    const state = await CompliancePipelineState.findOne({
      projectId: new mongoose.Types.ObjectId(projectId),
      standardId: new mongoose.Types.ObjectId(standardId),
      normId: { $exists: true },
    }).select('normId');
    if (state?.normId) return getPipelineNorm(projectId, state.normId);
    return null;
  }
  return {
    id: standardId,
    source: 'upload',
    name: std.name,
    type: std.type,
    version: std.version || undefined,
    sections: (std.sections ?? []).map(s => ({
      id: s.id,
      title: s.title,
      number: s.number || '',
      content: s.content || '',
      level: s.level ?? 1,
    })),
  };
}

/**
 * Mapping-Stats einer Norm im Pipeline-Vokabular.
 *
 * Upload: direkt aus StandardMapping (conformance-Statūs, wie bisher).
 * Corpus (P2-Projektion, echte Vokabular-Vereinigung = P3/P4):
 *   confirmed → compliant · auto → partial (LLM-vorgeschlagen, unbestätigt) ·
 *   rejected → zählt nicht · gap entsteht nur als `unmapped` (Section ohne aktives Mapping).
 */
export async function computeNormMappingStats(
  projectId: string,
  ref: string,
): Promise<NormMappingStats | null> {
  const norm = await getPipelineNorm(projectId, ref);
  if (!norm) return null;

  if (norm.source === 'upload') {
    const mappings = await StandardMapping.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      standardId: new mongoose.Types.ObjectId(norm.id),
    });
    const mappedSectionIds = new Set(mappings.map(m => m.sectionId));
    return {
      total: norm.sections.length,
      compliant: mappings.filter(m => m.status === 'compliant').length,
      partial: mappings.filter(m => m.status === 'partial').length,
      gap: mappings.filter(m => m.status === 'gap').length,
      unmapped: norm.sections.filter(s => !mappedSectionIds.has(s.id)).length,
    };
  }

  const mappings = await getNormMappings(projectId, norm.id);
  const active = mappings.filter(m => m.status !== 'rejected');
  const mappedSectionIds = new Set(active.map(m => m.sectionEId).filter(Boolean));
  return {
    total: norm.sections.length,
    compliant: active.filter(m => m.status === 'confirmed').length,
    partial: active.filter(m => m.status === 'auto').length,
    gap: 0,
    unmapped: norm.sections.filter(s => !mappedSectionIds.has(s.id)).length,
  };
}

// ─── P4a: Schreibpfad — Norm-Materialisierung (THE-390 P4) ───
//
// Ab P4 wird die `Norm`-Collection als kanonischer Store befüllt (ADR-0004).
// Upserts sind idempotent über {projectId, workId}. Die Lese-Facade bleibt
// vorerst auf den Quell-Collections (Strangler) — der Read-Cutover auf die
// Norm-Collection folgt mit der Client-Konsolidierung (P4b).

import { Norm, INorm } from '../models/Norm';

/** Idempotenter Upsert eines Norm-Dokuments aus einer projizierten Sicht. */
export async function upsertNormDoc(view: NormView): Promise<INorm> {
  const update = {
    projectId: new mongoose.Types.ObjectId(view.projectId),
    workId: view.identity.workId,
    aliases: view.identity.aliases,
    frbrLevel: view.identity.frbrLevel,
    expressionLanguage: view.identity.expressionLanguage,
    source: view.source,
    title: view.title,
    version: view.version,
    jurisdiction: view.jurisdiction,
    kind: view.kind,
    corpusRef: view.corpusRef,
    sections: view.sections.map(s => ({
      eId: s.eId,
      parentEId: s.parentEId,
      path: s.path,
      heading: s.heading,
      number: s.number,
      text: s.text,
      level: s.level,
    })),
  };
  return Norm.findOneAndUpdate(
    { projectId: update.projectId, workId: update.workId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/** Materialisiert ALLE Normen eines Projekts (Upload + Korpus) in die Norm-Collection. */
export async function materializeProjectNorms(
  projectId: string,
): Promise<{ upserted: number }> {
  const views = await listNorms(projectId);
  for (const view of views) {
    await upsertNormDoc(view);
  }
  return { upserted: views.length };
}
