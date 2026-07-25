/**
 * Relations-Batch — reiner Kern für den Cross-Norm-Kanten-Vorschlags-Batch
 * (THE-433, Slice 1, Task 3b). Muster: typingBatch.ts (Slice T) — jede Regel
 * hat dort ihren erprobten Grund.
 *
 * Pro ZITIERENDEM Korpus-Dokument werden alle Verweis-Kandidaten (aus
 * enumerateRelationCandidates, verweis-getrieben — NIE Similarity als
 * Positiv-Quelle) mit dem Byte-identischen rp-2-Prompt aus
 * @thearchitect/shared klassifiziert und als `relationSuggestions[]`
 * (status 'suggested') an das zitierende Dokument geschrieben. Suggest-only:
 * confirmed/rejected setzt NUR ein Mensch, und menschliche Entscheidungen
 * überleben JEDEN Re-Scan — auch --force (Asilomar #16).
 *
 * Idempotenz-Anker pro DOKUMENT (nicht pro Paar): `relationScan
 * {promptVersion, versionHash, scannedAt}` — ein Scan verarbeitet alle
 * Kandidaten des Dokuments. Der Anker wird auch gesetzt, wenn alle Kandidaten
 * 'none' ergaben (sonst würde jeder Lauf neu klassifizieren) — aber NIE, wenn
 * auch nur eine Messung ausfiel (sonst würde der Ausfall nie nachgeholt).
 *
 * Zod-Grenze: RelationSuggestionSchema.parse VOR dem Write — die
 * Mongoose-Schicht validiert relationType bewusst nicht (Begründung in
 * regulation.model.ts), die Zod-Grenze ist die Erzwingung von AC-1/AC-5.
 *
 * Dieses Modul ist bewusst rein (kein Mongo, kein Netz): Skip-Logik, Merge,
 * Assemblierung, TOCTOU-Filter und die Pro-Dokument-Pipeline sind ohne
 * Infrastruktur testbar; der CLI (src/cli/relations-batch.ts) ist nur Glue.
 *
 * Linear: THE-433 (Slice 1) · Vorbild: typingBatch.ts (THE-432 Slice T)
 */
import {
  RELATIONS_PROMPT_VERSION,
  RelationSuggestionSchema,
  buildRelationsPrompt,
  parseRelationLabel,
  type RelationDirection,
  type RelationSuggestion,
} from '@thearchitect/shared';
import type { RelationCandidate, RelationCandidateDoc } from './relationCandidates';
import type { RetryOutcome } from './typingBatch';

// Gleiche Modell-Klasse wie der Typing-Batch UND wie die Baseline-Eval
// (Task 4): Instruct/Haiku. Die Erfolgs-/Abbruchregel des Plans misst genau
// diese Kombination (Haiku + rp-2) — ein anderes Modell hier würde etwas
// anderes produktiv fahren, als die Baseline gemessen hat.
export const RELATIONS_BATCH_MODEL = 'claude-haiku-4-5-20251001';

/** Der Idempotenz-Anker, wie er als `relationScan` ans Dokument geschrieben wird. */
export interface RelationScanAnchor {
  promptVersion: string;
  versionHash: string;
  scannedAt: Date;
}

/** Schlanke Sicht auf das zitierende Korpus-Dokument — Kandidaten-Felder + Batch-Zustand. */
export interface RelationsBatchDoc extends RelationCandidateDoc {
  _id: unknown;
  relationScan?: { promptVersion?: string; versionHash?: string };
  relationSuggestions?: RelationSuggestion[];
}

/**
 * Entscheidet, ob ein zitierendes Dokument übersprungen wird (Idempotenz).
 * Anders als beim Typing gibt es hier KEINEN Dokument-Skip für menschliche
 * Entscheidungen: die leben pro EINTRAG im Array und werden beim Merge
 * geschützt (mergeRelationSuggestions) — ein Dokument kann gleichzeitig eine
 * confirmed-Kante tragen und für neue Ziele frisch gescannt werden.
 */
export function shouldSkipRelationScan(
  doc: { versionHash: string; relationScan?: { promptVersion?: string; versionHash?: string } },
  opts: { force: boolean; promptVersion: string }
): boolean {
  if (opts.force) return false;
  const scan = doc.relationScan;
  return (
    !!scan && scan.versionHash === doc.versionHash && scan.promptVersion === opts.promptVersion
  );
}

/**
 * Baut aus Kandidat + geparstem Modell-Label den Vorschlag und validiert ihn
 * an der Zod-Grenze (RelationSuggestionSchema.parse) — wirft LAUT bei jedem
 * Verstoß statt still zu schreiben. promptVersion kommt aus dem Import, NICHT
 * als Parameter (kein Aufrufer kann einen fremden Prompt-Stand stempeln —
 * dasselbe Provenance-Muster wie assembleTypingSuggestion).
 */
export function assembleRelationSuggestion(
  candidate: RelationCandidate,
  label: { relation: string; direction: RelationDirection },
  meta: { model: string; now: Date }
): RelationSuggestion {
  return RelationSuggestionSchema.parse({
    targetRegulationKey: candidate.target.regulationKey,
    targetVersionHash: candidate.target.versionHash,
    sourceVersionHash: candidate.citing.versionHash,
    relationType: label.relation,
    direction: label.direction,
    evidence: {
      matched: candidate.evidence.matched,
      articleHints: [...candidate.evidence.articleHints],
    },
    promptVersion: RELATIONS_PROMPT_VERSION,
    model: meta.model,
    suggestedAt: meta.now.toISOString(),
    status: 'suggested',
  });
}

/**
 * Menschliche Entscheidung schlägt Batch: confirmed/rejected-Einträge bleiben
 * IMMER stehen (auch bei --force), und ein frischer Vorschlag für dasselbe
 * Ziel-Paar (targetRegulationKey) wird verworfen — der Mensch hat für dieses
 * Paar bereits entschieden. Nur 'suggested'-Einträge des Dokuments werden
 * beim Re-Scan ersetzt.
 */
export function mergeRelationSuggestions(
  existing: RelationSuggestion[] | undefined,
  fresh: RelationSuggestion[]
): { merged: RelationSuggestion[]; humanTargets: string[]; skippedHumanPairs: number } {
  const human = (existing ?? []).filter((s) => s.status !== 'suggested');
  const humanTargets = human.map((s) => s.targetRegulationKey);
  const humanTargetSet = new Set(humanTargets);
  const kept = fresh.filter((s) => !humanTargetSet.has(s.targetRegulationKey));
  return {
    merged: [...human, ...kept],
    humanTargets,
    skippedHumanPairs: fresh.length - kept.length,
  };
}

/**
 * TOCTOU-Guard analog typingBatch (Review-Fix 4 dort): das Update darf nur
 * greifen, wenn (a) der Text-Stand unverändert ist (versionHash) und (b)
 * KEINE menschliche Entscheidung existiert, die der Merge nicht kannte —
 * d. h. keine confirmed/rejected außerhalb der beim Snapshot-Read gesehenen
 * humanTargets. Landet eine menschliche Entscheidung ZWISCHEN Read und Write,
 * matcht der Filter nicht und der Batch verliert das Rennen — nie umgekehrt.
 * Mongo-Semantik: `$not` über `$elemMatch` matcht auch Dokumente, deren
 * Array-Feld fehlt (kein Element kann den $elemMatch erfüllen).
 */
export function relationWriteFilter(
  docId: unknown,
  versionHash: string,
  humanTargets: string[]
): Record<string, unknown> {
  return {
    _id: docId,
    versionHash,
    relationSuggestions: {
      $not: {
        $elemMatch: {
          status: { $in: ['confirmed', 'rejected'] },
          targetRegulationKey: { $nin: humanTargets },
        },
      },
    },
  };
}

/** Was der CLI persistieren soll — anchor null = Teil-Ausfall, Anker NICHT setzen. */
export interface RelationsBatchWrite {
  docId: unknown;
  versionHash: string;
  suggestions: RelationSuggestion[];
  humanTargets: string[];
  anchor: RelationScanAnchor | null;
}

/** Lauf-Zähler — vom reinen Kern gepflegt, vom CLI nur noch ins Summary gedruckt. */
export interface RelationsBatchCounters {
  docsProcessed: number;
  candidatesProcessed: number;
  /** Klassifizierte (und Zod-validierte) Vorschläge je Relationstyp. */
  suggestionsByType: Record<string, number>;
  /** Bewusste Negativ-Aussagen des Modells — echte Klasse, kein Ausfall. */
  none: number;
  /** OOV- ODER metadata-Antworten sowie Relationen ohne gültige Richtung — verworfen, nie geschrieben. */
  droppedOov: number;
  /** Dokumente mit passendem relationScan-Anker — übersprungen. */
  skippedUpToDate: number;
  /** Frische Vorschläge, deren Ziel-Paar bereits menschlich entschieden ist. */
  skippedHumanPair: number;
  /** Write-Guard hat nicht gematcht — Mensch (oder Novelle) gewann das Rennen. */
  raceLost: number;
  /** regulationKeys mit mindestens einem Messausfall oder Write-Fehler — KEIN Anker gesetzt. */
  failedDocs: string[];
  inputTokens: number;
  outputTokens: number;
}

export function newRelationsBatchCounters(): RelationsBatchCounters {
  return {
    docsProcessed: 0,
    candidatesProcessed: 0,
    suggestionsByType: {},
    none: 0,
    droppedOov: 0,
    skippedUpToDate: 0,
    skippedHumanPair: 0,
    raceLost: 0,
    failedDocs: [],
    inputTokens: 0,
    outputTokens: 0,
  };
}

export interface RelationsProcessDeps {
  /** Prompt rein, RetryOutcome raus — der CLI verdrahtet completeWithRetry + Anthropic-SDK. */
  complete: (userPrompt: string) => Promise<RetryOutcome>;
  /** Persistiert Merge + Anker. Rückgabe false = TOCTOU-Guard hat nicht gematcht. */
  write: (w: RelationsBatchWrite) => Promise<boolean>;
  now?: () => Date;
  onError?: (regulationKey: string, err: unknown) => void;
}

export interface RelationsDocGroup {
  /** Das zitierende Dokument — Träger von relationSuggestions + relationScan. */
  doc: RelationsBatchDoc;
  /** Alle Kandidaten dieses Dokuments (candidate.citing === doc, per Konstruktion). */
  candidates: RelationCandidate[];
}

/**
 * Die Pro-Dokument-Pipeline, pur und einzeln testbar:
 * Skip-Entscheid → je Kandidat: Prompt (A = zitierend, B = Ziel, Byte-identisch
 * zur Eval) → Modell-Call (Retry via deps) → Parse → Zod-Assemble → Merge →
 * Write (TOCTOU via deps). Fehler-Invarianten (Muster processTypingDoc):
 *  - Messausfall (text=null, API-Fehler) erzeugt NIE einen Eintrag und
 *    verhindert den Anker für das GANZE Dokument — der Re-Run holt es nach;
 *    erfolgreich klassifizierte Geschwister-Kandidaten werden trotzdem
 *    geschrieben (idempotent: der Re-Scan ersetzt suggested-Einträge).
 *  - Ein Write-Fehler killt nicht den Lauf: failedDocs, normal zurückkehren.
 *  - Tokens werden VOR jedem null-Check gezählt — auch Ausfälle kosten Geld.
 */
export async function processRelationDocGroup(
  group: RelationsDocGroup,
  opts: { force: boolean; dryRun: boolean; promptVersion: string; model: string },
  deps: RelationsProcessDeps,
  counters: RelationsBatchCounters
): Promise<void> {
  const { doc, candidates } = group;

  if (shouldSkipRelationScan(doc, opts)) {
    counters.skippedUpToDate++;
    return;
  }

  const fresh: RelationSuggestion[] = [];
  let failed = false;

  for (const candidate of candidates) {
    counters.candidatesProcessed++;
    const user = buildRelationsPrompt({ a: candidate.citing, b: candidate.target });

    let outcome: RetryOutcome;
    try {
      outcome = await deps.complete(user);
    } catch (err) {
      deps.onError?.(doc.regulationKey, err);
      failed = true;
      continue;
    }
    counters.inputTokens += outcome.inputTokens;
    counters.outputTokens += outcome.outputTokens;
    if (outcome.text === null) {
      failed = true;
      continue;
    }

    const parsed = parseRelationLabel(outcome.text);
    if (parsed.dropped) {
      // Metadata-Typ, OOV oder fehlende Richtung — verworfene Aussage, nie ein Eintrag.
      counters.droppedOov++;
      continue;
    }
    if (parsed.relation == null) {
      // 'none' (bewusste Negativ-Aussage) ODER offen (kein Commit) → kein Eintrag.
      counters.none++;
      continue;
    }
    // Zod-Grenze: wirft laut bei jedem Schema-Verstoß — bewusst NICHT gefangen.
    const suggestion = assembleRelationSuggestion(
      candidate,
      { relation: parsed.relation, direction: parsed.direction! },
      { model: opts.model, now: deps.now?.() ?? new Date() }
    );
    fresh.push(suggestion);
    counters.suggestionsByType[suggestion.relationType] =
      (counters.suggestionsByType[suggestion.relationType] ?? 0) + 1;
  }

  if (failed) counters.failedDocs.push(doc.regulationKey);
  counters.docsProcessed++;

  if (opts.dryRun) return;

  const anchor: RelationScanAnchor | null = failed
    ? null
    : {
        promptVersion: opts.promptVersion,
        versionHash: doc.versionHash,
        scannedAt: deps.now?.() ?? new Date(),
      };

  // Nichts zu schreiben UND kein Anker zu setzen → gar kein Write nötig.
  if (fresh.length === 0 && anchor === null) return;

  const { merged, humanTargets, skippedHumanPairs } = mergeRelationSuggestions(
    doc.relationSuggestions,
    fresh
  );
  counters.skippedHumanPair += skippedHumanPairs;

  try {
    const written = await deps.write({
      docId: doc._id,
      versionHash: doc.versionHash,
      suggestions: merged,
      humanTargets,
      anchor,
    });
    if (!written) {
      // TOCTOU: eine menschliche Entscheidung (oder Novelle) landete zwischen
      // Snapshot-Read und Write — der Batch verliert das Rennen, nie umgekehrt.
      counters.raceLost++;
    }
  } catch (err) {
    deps.onError?.(doc.regulationKey, err);
    if (!failed) counters.failedDocs.push(doc.regulationKey);
  }
}

// Preise claude-haiku-4-5 (Stand 2026-07) — Re-Export-Vermeidung: der CLI nutzt
// estimateCostUsd aus typingBatch (gleiche Modellklasse, gleiche Preise).
