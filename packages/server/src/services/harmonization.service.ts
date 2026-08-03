/**
 * harmonization.service — der Harmonisierungs-Vorschlag als Produktpfad
 * (THE-569, Slice B von REQ-REQTRACE-001.5).
 *
 * ── EINE QUELLE ──
 *
 * Die Maßnahmen-Bildung selbst ist `groupIntoMeasures` aus dem Eval (Lauf 4:
 * 4/5 SCF, Verdrängungs-Gate mechanisch VOR dem Richter). Dieser Service
 * liefert ihr nur produktive Inputs:
 *
 *   source          mechanisch aus dem regulationKey-Präfix der StR
 *   addresseeClass  Adressaten-Lexikon über den verpflichteter-Freitext —
 *                   im Eval kam sie aus dem handkuratierten Fixture, das es
 *                   im Produkt nicht gibt. Unmappbares nimmt NICHT teil
 *                   (unmappedAddressee-Quote): eine falsche Klasse würde das
 *                   Verdrängungs-Gate für Paare öffnen, die es ausschließen
 *                   müsste.
 *   actionId        Produktions-Klassifikator (classifyObligation), am
 *                   Dokument GECACHT mit ontologyVersion (THE-438-Muster).
 *
 * DIE THE-551-LEITPLANKE sitzt im Confirm: das System schlägt die GRUPPE
 * vor — das geteilte Element wählt der Mensch, aus den bereits verlinkten
 * Elementen der Mitglieder (die Ebene ist eine Landschafts-Entscheidung,
 * 51,2 % vs 70 %). Gates und Evidenz bleiben je Anforderung getrennt.
 */
import mongoose from 'mongoose';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { classifyObligation, type AskFn } from './obligationAction.service';
import { mapVerpflichteterToPartyRole } from './addresseeLexicon';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { deriveCovered, emptyGates } from './requirementGates.service';
import {
  groupIntoMeasures,
  type GroupableSysReq,
  type GroupingResult,
  type JudgeFn,
} from '../evals/reqtrace/measureGrouping';

export interface EnrichStats {
  total: number;
  unmappedAddressee: number;
  unclassified: number;
}

export interface BuildGroupablesResult {
  groupables: GroupableSysReq[];
  stats: EnrichStats;
}

export async function buildGroupables(
  projectId: mongoose.Types.ObjectId | string,
  ctx: { ask: AskFn },
): Promise<BuildGroupablesResult> {
  const sysReqs = await ChainSystemRequirement.find({ projectId }).sort({ _id: 1 });
  const stats: EnrichStats = { total: sysReqs.length, unmappedAddressee: 0, unclassified: 0 };
  const groupables: GroupableSysReq[] = [];

  for (const doc of sysReqs) {
    const addresseeClass = mapVerpflichteterToPartyRole(doc.verpflichteter);
    if (!addresseeClass) {
      // Kein Klassifikations-Call für Unpaarbares — Kosten sichtbar sparen.
      stats.unmappedAddressee += 1;
      continue;
    }

    let actionId: string | null;
    const cached = doc.actionClassification;
    if (cached && cached.ontologyVersion === NORM_ONTOLOGY.ontologyVersion) {
      actionId = cached.actionId;
    } else {
      const str = await StakeholderRequirement.findById(doc.stakeholderRequirementIds[0]).lean();
      const assignment = await classifyObligation(
        {
          law: str?.regulationKey.split(':')[0] ?? 'unknown',
          para: str?.regulationKey ?? '',
          title: doc.text.slice(0, 120),
          text: doc.text,
        },
        ctx.ask,
      );
      if (assignment.unparseable) {
        stats.unclassified += 1;
        continue;
      }
      actionId = assignment.actionId;
      doc.actionClassification = { actionId, ontologyVersion: assignment.ontologyVersion };
      await doc.save();
    }

    const str = await StakeholderRequirement.findById(doc.stakeholderRequirementIds[0]).lean();
    groupables.push({
      id: String(doc._id),
      source: str?.regulationKey.split(':')[0] ?? 'unknown',
      actionId,
      addresseeClass,
      text: doc.text,
      schutzgut: doc.schutzgut,
      verpflichteter: doc.verpflichteter,
      ausloeser: doc.ausloeser,
      nachweis: doc.nachweis,
      derivedFrom: doc.stakeholderRequirementIds.map(String),
      implementationFree: true, // persistierte Ketten-SysReqs haben das Save-Gate passiert
    });
  }

  return { groupables, stats };
}

export interface MemberDetail {
  systemRequirementId: string;
  requirementId: string | null;
  title: string | null;
  linkedElementIds: string[];
}

export interface ProposeResult {
  grouping: GroupingResult;
  /** Fuer die Confirm-UI: je Gruppen-Mitglied Titel + bereits verlinkte Elemente. */
  memberDetails: MemberDetail[];
  stats: EnrichStats & { pairsJudged: number };
}

/** Der explizite Vorschlags-Lauf — Kosten stehen in der Antwort, nie im Log. */
export async function proposeSharedMeasures(
  projectId: mongoose.Types.ObjectId | string,
  ctx: { ask: AskFn; judge: JudgeFn; maxJudgedPairs?: number },
): Promise<ProposeResult> {
  const { groupables, stats } = await buildGroupables(projectId, { ask: ctx.ask });
  let pairsJudged = 0;
  const countingJudge: JudgeFn = async (system, user) => {
    pairsJudged += 1;
    return ctx.judge(system, user);
  };
  const grouping = await groupIntoMeasures(groupables, {
    judge: countingJudge,
    maxJudgedPairs: ctx.maxJudgedPairs ?? 50,
  });

  // Confirm-UI-Futter: das System schlaegt die GRUPPE vor — welches Element
  // geteilt wird, waehlt der Mensch aus den BEREITS verlinkten der Mitglieder.
  const memberIds = grouping.measures.flatMap((m) => m.memberIds);
  const reqs = memberIds.length
    ? await ComplianceRequirement.find({
        projectId,
        'chain.systemRequirementId': { $in: memberIds.map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .select('title linkedElementIds chain.systemRequirementId')
        .lean()
    : [];
  const byId = new Map(reqs.map((r) => [String(r.chain!.systemRequirementId), r]));
  const memberDetails: MemberDetail[] = memberIds.map((id) => ({
    systemRequirementId: id,
    requirementId: byId.has(id) ? String(byId.get(id)!._id) : null,
    title: byId.get(id)?.title ?? null,
    linkedElementIds: byId.get(id)?.linkedElementIds ?? [],
  }));

  return { grouping, memberDetails, stats: { ...stats, pairsJudged } };
}

/**
 * Die menschliche Bestätigung: das gewählte Element muss bereits an ≥ 1
 * Mitglied hängen — das System hat die Gruppe vorgeschlagen, nie das Element.
 * $addToSet + covered-Recompute (Muster remediationBacklink); menschliche
 * Tore bleiben unangetastet.
 */
export async function confirmSharedMeasure(args: {
  projectId: mongoose.Types.ObjectId | string;
  systemRequirementIds: string[];
  elementId: string;
}): Promise<{ linkedRequirements: number }> {
  const members = await ComplianceRequirement.find({
    projectId: args.projectId,
    'chain.systemRequirementId': { $in: args.systemRequirementIds.map((id) => new mongoose.Types.ObjectId(id)) },
  });
  if (members.length < 2) {
    throw new HarmonizationError('confirmation needs at least two chain requirements in the group');
  }
  if (!members.some((m) => m.linkedElementIds.includes(args.elementId))) {
    throw new HarmonizationError(
      'the shared element must already be linked to at least one group member — link an element first (remediation or mapping)',
    );
  }

  for (const doc of members) {
    if (!doc.linkedElementIds.includes(args.elementId)) {
      doc.linkedElementIds.push(args.elementId);
    }
    doc.gates = { ...(doc.gates ?? emptyGates()), covered: deriveCovered(doc.linkedElementIds) };
    await doc.save();
  }
  return { linkedRequirements: members.length };
}

export class HarmonizationError extends Error {}
