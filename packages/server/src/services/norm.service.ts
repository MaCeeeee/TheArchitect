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
import {
  getRegulationsForProject,
  type RegulationView,
} from './regulationResolver.service';

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
  const sections: NormSectionView[] = regs.map(r => {
    const eId = r.regulationKey ?? `${source}:${r.paragraphNumber}`;
    return {
      eId,
      path: eId,
      heading: r.title,
      number: r.paragraphNumber,
      text: r.fullText,
      level: 1,
    };
  });
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

/** Eine Norm per workId (`upload:<standardId>` | `corpus:<source>`). */
export async function getNorm(projectId: string, workId: string): Promise<NormView | null> {
  const norms = await listNorms(projectId);
  return norms.find(n => n.identity.workId === workId) ?? null;
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
