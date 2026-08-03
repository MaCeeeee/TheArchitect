/**
 * traceability.service — die Kette in beide Richtungen (THE-565, REQ-001.6).
 *
 * ── VORWÄRTS ──  „Was verlangt die Norm, Klausel für Klausel — und wo
 * steht es?" Gruppierungs-Achse ist die inhalts-basierte
 * `chain.clauseContentId` (THE-560: novellen-fest, 30/30). Der
 * Klausel-Snapshot kommt aus der StakeholderRequirement — auflösbar auch
 * nach einer Novelle. Eine Klausel ohne verlinkte Elemente ist die
 * Coverage-Lücke, die diese Ansicht sichtbar machen soll.
 *
 * ── RÜCKWÄRTS ── „Tool ausmustern → welche Gesetze brechen?" Je Element
 * die Anforderungen samt Rechtsgrundlage und Frist; `soleCoverage` markiert
 * Anforderungen, deren EINZIGES Element dieses ist — dort fiele `covered`
 * auf no (deriveCovered-Semantik, mechanisch, kein Orakel).
 *
 * Legacy-Requirements (REQGEN, ohne `chain`) erscheinen GETRENNT
 * (`withoutClauseAnchor`) — nie rückwirkend interpretiert (ADR-0008).
 * REIN LESEND — die einzige Schreib-Operation des Tickets ist der
 * explizite chainDrift-Pass.
 */
import mongoose from 'mongoose';
import type { Deadline, RequirementGates } from '@thearchitect/shared';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { StakeholderRequirement } from '../models/StakeholderRequirement';

export interface ForwardClause {
  contentId: string;
  clausePath?: string;
  clauseText: string | null;
  requirements: Array<{
    id: string;
    title: string;
    priority: string;
    gates?: RequirementGates;
  }>;
  /** Der Maßnahmen-Stand der Klausel: alle Elemente über ihre Anforderungen. */
  linkedElementIds: string[];
}

export interface ForwardTraceResult {
  norms: Array<{ regulationKey: string; clauses: ForwardClause[] }>;
  withoutClauseAnchor: { count: number; requirementIds: string[] };
}

export async function forwardTrace(
  projectId: mongoose.Types.ObjectId | string,
): Promise<ForwardTraceResult> {
  const reqs = await ComplianceRequirement.find({ projectId }).lean();

  const legacy = reqs.filter((r) => !r.chain);
  const chained = reqs.filter((r) => r.chain);

  // Klausel-Snapshots aus den StakeholderRequirements der Kette.
  const strIds = chained.flatMap((r) => r.chain!.stakeholderRequirementIds);
  const strs = await StakeholderRequirement.find({ _id: { $in: strIds } })
    .select('clause regulationKey')
    .lean();
  const strById = new Map(strs.map((s) => [String(s._id), s]));

  const byNorm = new Map<string, Map<string, ForwardClause>>();
  for (const r of chained) {
    const str = strById.get(String(r.chain!.stakeholderRequirementIds[0]));
    const regulationKey = str?.regulationKey ?? 'unknown';
    const contentId = r.chain!.clauseContentId;

    if (!byNorm.has(regulationKey)) byNorm.set(regulationKey, new Map());
    const clauses = byNorm.get(regulationKey)!;
    if (!clauses.has(contentId)) {
      clauses.set(contentId, {
        contentId,
        clausePath: r.chain!.clausePath ?? str?.clause.path,
        clauseText: str?.clause.text ?? null,
        requirements: [],
        linkedElementIds: [],
      });
    }
    const clause = clauses.get(contentId)!;
    clause.requirements.push({
      id: String(r._id),
      title: r.title,
      priority: r.priority,
      gates: r.gates,
    });
    for (const el of r.linkedElementIds) {
      if (!clause.linkedElementIds.includes(el)) clause.linkedElementIds.push(el);
    }
  }

  return {
    norms: [...byNorm.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([regulationKey, clauses]) => ({
        regulationKey,
        clauses: [...clauses.values()].sort((a, b) => a.contentId.localeCompare(b.contentId)),
      })),
    withoutClauseAnchor: {
      count: legacy.length,
      requirementIds: legacy.map((r) => String(r._id)),
    },
  };
}

export interface BackwardRequirement {
  id: string;
  title: string;
  priority: string;
  /** regulationKey der Kette bzw. Legacy-Fallback (normId / sourceParagraph-Anriss). */
  legalBasis: string;
  deadline: Deadline | null;
  gates?: RequirementGates;
  /** true ⇔ dieses Element ist das EINZIGE — Ausmustern kippt `covered` auf no. */
  soleCoverage: boolean;
}

export interface BackwardTraceResult {
  elementId: string;
  requirements: BackwardRequirement[];
  impact: { wouldLoseCoverage: number; laws: string[] };
}

export async function backwardTrace(
  projectId: mongoose.Types.ObjectId | string,
  elementId: string,
): Promise<BackwardTraceResult> {
  const reqs = await ComplianceRequirement.find({ projectId, linkedElementIds: elementId }).lean();

  const strIds = reqs.filter((r) => r.chain).flatMap((r) => r.chain!.stakeholderRequirementIds);
  const strs = await StakeholderRequirement.find({ _id: { $in: strIds } })
    .select('regulationKey deadline')
    .lean();
  const strById = new Map(strs.map((s) => [String(s._id), s]));

  const requirements: BackwardRequirement[] = reqs.map((r) => {
    const str = r.chain ? strById.get(String(r.chain.stakeholderRequirementIds[0])) : undefined;
    const legalBasis =
      str?.regulationKey ?? r.normId ?? (r.sourceParagraph ? r.sourceParagraph.slice(0, 80) : 'unknown');
    return {
      id: String(r._id),
      title: r.title,
      priority: r.priority,
      legalBasis,
      deadline: (str?.deadline as Deadline | undefined) ?? null,
      gates: r.gates,
      soleCoverage: r.linkedElementIds.length === 1,
    };
  });

  const losing = requirements.filter((r) => r.soleCoverage);
  const laws = [...new Set(losing.map((r) => r.legalBasis.split(':')[0]))].sort();

  return {
    elementId,
    requirements,
    impact: { wouldLoseCoverage: losing.length, laws },
  };
}
