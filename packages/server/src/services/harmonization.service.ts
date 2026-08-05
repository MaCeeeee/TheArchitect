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
 *   addresseeClass  ZUERST aus der typisierten Korpus-Provision (THE-540
 *                   Achse 1), Freitext-Lexikon nur als Rückfall (THE-591).
 *                   Der Grund ist gemessen: Das Lexikon liest den
 *                   Verpflichteten einer PARAPHRASE zurück, der Korpus trägt
 *                   die Rolle am Originaltext. Unmappbares nimmt NICHT teil
 *                   (unmappedAddressee-Quote): eine falsche Klasse würde das
 *                   Verdrängungs-Gate für Paare öffnen, die es ausschließen
 *                   müsste — gemessen in THE-589.
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
import { resolveTypedAddressees, type FetchProvisions } from './typedProvision.service';
import { ChainSystemRequirement } from '../models/ChainSystemRequirement';
import { StakeholderRequirement } from '../models/StakeholderRequirement';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { deriveCovered, emptyGates } from './requirementGates.service';
import {
  groupIntoMeasures,
  enumerateCandidatePairs,
  PAIR_SELECTION_ORDER,
  type GroupableSysReq,
  type GroupingResult,
  type JudgeFn,
  type PairSelectionOrder,
} from '../evals/reqtrace/measureGrouping';

/**
 * Der Deckel, der greift, wenn der Aufrufer keinen nennt.
 *
 * Stand bis THE-590 als nackte 50 an ZWEI Stellen (hier und in der Route).
 * Die Vorschau muss denselben Wert zeigen, den der Lauf verwendet — zwei
 * Literale, die auseinanderlaufen, machen aus der Vorschau eine Luege.
 */
export const DEFAULT_MAX_JUDGED_PAIRS = 50;
/** Das Maximum, das die Route zulaesst. Gemessen zu niedrig — siehe THE-590 Slice 2. */
export const MAX_ALLOWED_JUDGED_PAIRS = 200;

export interface EnrichStats {
  total: number;
  unmappedAddressee: number;
  unclassified: number;
  /**
   * Anforderungen ohne gueltigen Klassifikations-Cache, die NICHT klassifiziert
   * wurden, weil kein Klassifikator uebergeben war (Vorschau-Modus, THE-590).
   *
   * Steht NEBEN `unclassified`: „wir haben nicht gefragt" und „wir haben
   * gefragt und keine Antwort bekommen" sind verschiedene Aussagen. Nur so ist
   * die Kandidatenzahl als Untergrenze lesbar statt als Versprechen.
   */
  needsClassification: number;
  /** THE-591: Adressat aus der typisierten Korpus-Provision — der Regelfall. */
  addresseeFromCorpus: number;
  /** Adressat aus dem Freitext-Lexikon — der Rückfall. */
  addresseeFromLexicon: number;
  /**
   * Provisions, zu denen der Korpus nichts sagt (ungetypt oder nicht
   * erreichbar). Steht NEBEN `unmappedAddressee`, damit die Lücke nicht bloß
   * eine Ebene weiterwandert: „der Korpus kennt sie nicht" und „niemand kennt
   * sie" sind verschiedene Aussagen.
   */
  untypedProvisions: number;
}

export interface BuildGroupablesResult {
  groupables: GroupableSysReq[];
  stats: EnrichStats;
}

/** Produktions-Zugriff auf die typisierten Provisions. Im Test ein Stub. */
const defaultFetchProvisions: FetchProvisions = async (keys) => {
  const { getRegulationsByKeys } = await import('./corpusClient.service');
  return (await getRegulationsByKeys(keys)) as never;
};

/**
 * ── WARUM `ask` OPTIONAL IST (THE-590) ──
 *
 * Ohne Klassifikator laeuft dieselbe Funktion im VORSCHAU-Modus: sie nutzt nur
 * bereits gecachte Handlungen und zaehlt, was sie deshalb nicht einordnen
 * kann. Das ist keine Bequemlichkeit, sondern die Durchsetzung — eine
 * Kostenvorschau, die selbst Modellaufrufe ausloest, hebt sich auf. Ein
 * boolescher Schalter koennte falsch stehen; eine fehlende Abhaengigkeit kann
 * es nicht: ohne `ask` gibt es keinen Codepfad zum Klassifikator und damit
 * auch keinen zu `doc.save()`.
 */
export async function buildGroupables(
  projectId: mongoose.Types.ObjectId | string,
  ctx: { ask?: AskFn; fetchProvisions?: FetchProvisions },
): Promise<BuildGroupablesResult> {
  const sysReqs = await ChainSystemRequirement.find({ projectId }).sort({ _id: 1 });
  const stats: EnrichStats = {
    total: sysReqs.length,
    unmappedAddressee: 0,
    unclassified: 0,
    needsClassification: 0,
    addresseeFromCorpus: 0,
    addresseeFromLexicon: 0,
    untypedProvisions: 0,
  };
  const groupables: GroupableSysReq[] = [];

  // ── Ein Read für alle Klauseln, ein Read für alle Provisions ────────────
  //
  // Vorher holte die Schleife dieselbe StakeholderRequirement ZWEIMAL je
  // Anforderung. Auf einer Liste, die im Alltag lang wird, ist das ein N+1 auf
  // einem heißen Pfad — und der Korpus-Zugriff käme als dritter dazu.
  const strById = new Map<string, { regulationKey: string }>();
  const strIds = sysReqs.map((d) => d.stakeholderRequirementIds[0]).filter(Boolean);
  if (strIds.length > 0) {
    const strs = await StakeholderRequirement.find({ _id: { $in: strIds } })
      .select('regulationKey')
      .lean();
    for (const s of strs) strById.set(String(s._id), { regulationKey: s.regulationKey });
  }
  const keyOf = (doc: { stakeholderRequirementIds: unknown[] }): string =>
    strById.get(String(doc.stakeholderRequirementIds[0]))?.regulationKey ?? '';

  // THE-591: Der Adressat kommt aus der typisierten Provision (THE-540 Achse
  // 1), nicht aus einer Regex über die Paraphrase. `resolveTypedAddressees`
  // liefert bei Korpus-Ausfall eine LEERE Map statt eines Wurfs — der Lauf
  // fällt dann auf das Lexikon zurück, statt Pflichten zu verlieren.
  const typedByKey = await resolveTypedAddressees(
    sysReqs.map(keyOf).filter(Boolean),
    ctx.fetchProvisions ?? defaultFetchProvisions,
  );

  for (const doc of sysReqs) {
    const regulationKey = keyOf(doc);
    // Korpus zuerst, Lexikon als Rückfall — und die Herkunft bleibt ablesbar.
    // Eine Rolle ohne erkennbare Quelle ist im Prüfungsfall wertlos.
    const fromCorpus = typedByKey.get(regulationKey);
    if (!fromCorpus) stats.untypedProvisions += 1;
    const addresseeClass = fromCorpus ?? mapVerpflichteterToPartyRole(doc.verpflichteter);
    if (!addresseeClass) {
      // Kein Klassifikations-Call für Unpaarbares — Kosten sichtbar sparen.
      stats.unmappedAddressee += 1;
      continue;
    }
    const addresseeSource: 'corpus' | 'lexicon' = fromCorpus ? 'corpus' : 'lexicon';
    if (fromCorpus) stats.addresseeFromCorpus += 1;
    else stats.addresseeFromLexicon += 1;

    let actionId: string | null;
    const cached = doc.actionClassification;
    if (cached && cached.ontologyVersion === NORM_ONTOLOGY.ontologyVersion) {
      actionId = cached.actionId;
    } else if (!ctx.ask) {
      // Vorschau: nicht klassifizieren, sondern zaehlen. Die Anforderung nimmt
      // an dieser Aufzaehlung nicht teil — die Kandidatenzahl ist dadurch eine
      // Untergrenze, und `needsClassification` sagt, wie weit sie es ist.
      stats.needsClassification += 1;
      continue;
    } else {
      const assignment = await classifyObligation(
        {
          law: regulationKey.split(':')[0] || 'unknown',
          para: regulationKey,
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

    groupables.push({
      id: String(doc._id),
      source: regulationKey.split(':')[0] || 'unknown',
      actionId,
      addresseeClass,
      addresseeSource,
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

export interface CandidatePreview {
  /** Ketten-Anforderungen im Projekt. */
  total: number;
  /** Paare, ueber die der Lauf urteilen wuerde — nach Filter und Verdraengung. */
  candidatePairs: number;
  /** Paare, die lex specialis ausschliesst. KEINE Kandidaten (THE-563). */
  excludedByDisplacement: number;
  /** Der Deckel, der bei diesem Lauf greifen wuerde. */
  cap: number;
  /** Wie viele Kandidaten der Deckel abschneiden wuerde. */
  wouldCap: number;
  /** Anforderungen, die der echte Lauf erst klassifizieren muesste. */
  needsClassification: number;
  unmappedAddressee: number;
  /** Wonach ausgewaehlt wuerde, falls gekappt. Stabil, keine Rangfolge. */
  selectionOrder: PairSelectionOrder;
}

/**
 * Was dieser Lauf kosten wuerde — **ohne** ihn zu bezahlen (THE-590).
 *
 * Kein Richter, kein Klassifikator, kein Schreibzugriff. Beides ist nicht
 * zugesichert, sondern erzwungen: `buildGroupables` bekommt kein `ask`, also
 * existiert kein Pfad zum Modell und keiner zu `doc.save()`.
 *
 * Die Zahl ist eine **Untergrenze**. Anforderungen ohne gecachte Handlung
 * nehmen nicht teil und stehen als `needsClassification` daneben — sonst
 * laese sich „0 Kandidaten" als Befund, wo in Wahrheit nur nicht klassifiziert
 * wurde. Genau diese Verwechslung ist die Fehlerklasse, die dieses Ticket
 * schliesst.
 */
export async function previewCandidatePairs(
  projectId: mongoose.Types.ObjectId | string,
  ctx: { cap?: number; fetchProvisions?: FetchProvisions },
): Promise<CandidatePreview> {
  const cap = ctx.cap ?? DEFAULT_MAX_JUDGED_PAIRS;
  const { groupables, stats } = await buildGroupables(projectId, {
    ...(ctx.fetchProvisions ? { fetchProvisions: ctx.fetchProvisions } : {}),
  });
  // Derselbe Filter, den der Lauf benutzt — nicht eine zweite Kopie davon.
  const { pairs, excludedByDisplacement } = enumerateCandidatePairs(groupables);
  return {
    total: stats.total,
    candidatePairs: pairs.length,
    excludedByDisplacement: excludedByDisplacement.length,
    cap,
    wouldCap: Math.max(0, pairs.length - cap),
    needsClassification: stats.needsClassification,
    unmappedAddressee: stats.unmappedAddressee,
    selectionOrder: PAIR_SELECTION_ORDER,
  };
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
  ctx: { ask: AskFn; judge: JudgeFn; maxJudgedPairs?: number; fetchProvisions?: FetchProvisions },
): Promise<ProposeResult> {
  const { groupables, stats } = await buildGroupables(projectId, {
    ask: ctx.ask,
    ...(ctx.fetchProvisions ? { fetchProvisions: ctx.fetchProvisions } : {}),
  });
  let pairsJudged = 0;
  const countingJudge: JudgeFn = async (system, user) => {
    pairsJudged += 1;
    return ctx.judge(system, user);
  };
  const grouping = await groupIntoMeasures(groupables, {
    judge: countingJudge,
    maxJudgedPairs: ctx.maxJudgedPairs ?? DEFAULT_MAX_JUDGED_PAIRS,
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
