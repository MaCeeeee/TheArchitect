/**
 * relations-baseline — die Baseline-Messung für THE-433 (Slice 1, Task 4):
 * derselbe Klassifikator, der produktiv Kanten vorschlägt (Haiku + rp-4),
 * über die LLM-Fälle des eingefrorenen Golden `relations.v5.json`.
 *
 * THE-529 (Task 6): INTERPRETS ist mechanisch (`derivation: 'mechanical'`) —
 * der Parser-Pfad im Crawler-Batch erzeugt diese Kanten, nicht das LLM.
 * Mechanische Wahrheiten werden deshalb NICHT ans LLM gegeben und NICHT in die
 * F1-Gates gerechnet; der Report weist sie als „mechanical (Parser-Pfad,
 * THE-529)" aus. Deren Messung ist der Parser-Eval
 * (interprets-parser-eval.ts), nicht diese Baseline.
 *
 * WARUM DIESES SKRIPT DAS GATE IST: Der Batch (compliance-crawler, Server B)
 * schreibt Kanten-VORSCHLÄGE an den Korpus. Ob diese Vorschläge überhaupt
 * stehen bleiben dürfen, entscheidet nicht ein Eindruck, sondern die VOR der
 * Messung fixierte Erfolgs-/Abbruchregel des Plans — sie steht unten als
 * RELATIONS_BASELINE_SUCCESS_RULE wörtlich im Report, damit ein späterer Leser
 * die Zahl nicht von der Regel trennen kann, gegen die sie gemessen wurde.
 *
 * BYTE-IDENTISCHER PROMPT: System, Rubrik und Template kommen aus
 * @thearchitect/shared (rp-4) — exakt die Quelle, aus der auch der Batch baut.
 * Ein zweiter Prompt hier würde etwas anderes messen als das, was produktiv
 * läuft, und die Zahl wäre keine Aussage über den Batch.
 *
 * DREI TRENNUNGEN, DIE DIE ZAHL TRAGEN:
 *  1. Messausfall ≠ Enthaltung. Eine leere Antwort (auch nach den Retries in
 *     withEmptyResponseRetry) ist FEHLENDE DATEN, kein Datenpunkt: sie verlässt
 *     Zähler UND Nenner und wird laut ausgewiesen. Sie darf niemals als 'none'
 *     durchgehen — 'none' ist hier die Negativ-KLASSE (der Löwenanteil des
 *     Golden), und ein Ausfall, der dort landet, schönt genau die Zahl, die
 *     das Gate prüft.
 *  2. Richtungs-Fehler ≠ Typ-Fehler. „Wer verdrängt wen" IST die Behauptung;
 *     ein vertauschter Pfeil ist ein anderer Defekt als eine falsche Beziehung
 *     und bekommt deshalb einen eigenen Zähler (er zählt trotzdem als Fehler).
 *  3. Dünne Klassen ≠ gemessene Klassen. Klassen mit n < 10 werden
 *     AUSGEWIESEN, aber nicht gegated (n≥3/n≥10-Ausweis-Regel): ein F1 aus 1–5
 *     Fällen ist Rauschen, und ein Gate auf Rauschen wäre eine erfundene
 *     Sicherheit.
 *
 * Der Lauf klassifiziert nichts nach — er misst nur. Kein Schreibzugriff auf
 * irgendeinen Bestand.
 *
 *   export ANTHROPIC_API_KEY=sk-...
 *   npm run relations:baseline
 *   npm run relations:baseline -- --golden src/evals/golden/relations.v5.json \
 *                                 --json reports/the-433-baseline.json
 *
 * Exit-Code 1 bei ABBRUCH — das Gate ist maschinenlesbar, nicht nur lesbar.
 *
 * Linear: THE-433 (Slice 1, Task 4) · THE-529 (Task 6) · Golden: relations.v5
 * (frozen, 188 Fälle, davon 16 mechanische INTERPRETS-Wahrheiten)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  NORM_ONTOLOGY,
  RELATIONS_PRELABEL_SYSTEM,
  RELATIONS_PROMPT_VERSION,
  buildRelationsPrompt,
  isMechanicalRelation,
  parseRelationLabel,
  type RelationDirection,
  type RelationsPromptPair,
} from '@thearchitect/shared';
import {
  annotatorTag,
  createRaterClient,
  isEmptyRaterText,
  resolveRaterConfig,
  type RaterClient,
} from '../evals/raterClient';
import { loadRelationsGolden } from '../evals/relationsGolden';

/** Gleiches Budget wie im Prelabel-Lauf, der den Prompt kalibriert hat. */
const MAX_TOKENS = 200;

/** Das eingefrorene Golden aus THE-519 — 188 adjudizierte Fälle (v5, 2026-07-26). */
export const DEFAULT_BASELINE_GOLDEN_PATH = path.join(
  __dirname,
  '..',
  'evals',
  'golden',
  'relations.v5.json'
);

// ─── Die VOR der Messung fixierte Erfolgs-/Abbruchregel ──────────

export const BASELINE_MIN_OVERALL_AGREEMENT = 0.85;
export const BASELINE_MIN_NONE_PRECISION = 0.9;
export const BASELINE_MIN_TYPE_F1 = 0.7;
/**
 * Ab dieser Gold-Stützung zählt eine Klasse als gemessen (und wird gegated).
 * Darunter: ausweisen, nie gaten — siehe Kopf-Kommentar, Trennung 3.
 */
export const BASELINE_GATE_MIN_SUPPORT = 10;

/**
 * Fixiert VOR der Messung (Ursprung: Plan-Header 2026-07-25-the-433-relation-
 * extraction.md; angepasst durch THE-529 Task 6: das INTERPRETS-F1-Gate ist
 * entfallen, weil INTERPRETS mechanisch erkannt wird und das LLM diese Klasse
 * weder angeboten bekommt noch antworten darf — der Ausweis ersetzt das Gate).
 * Steht im Report, damit Zahl und Regel nie getrennt zitiert werden können.
 */
export const RELATIONS_BASELINE_SUCCESS_RULE =
  'Erfolgs-/Abbruchregel (VOR der Messung fixiert): Baseline = derselbe Klassifikator ' +
  '(Haiku + rp-4) über die LLM-Fälle des frozen Golden relations.v5. INTERPRETS wird ' +
  'mechanisch erkannt (Parser-Pfad, THE-529) und ist NICHT Teil der LLM-Messung — ' +
  'seine Verdrahtung misst interprets-parser-eval, seine Wahrheit die Architekten-' +
  'Adjudikation. Erfolg: Übereinstimmung mit der Wahrheit gesamt >= 0,85 UND ' +
  'none-Precision >= 0,90 UND F1 >= 0,70 für jede gemessene LLM-Klasse mit n >= 10 ' +
  'UND 0 metadata-Typ-Vorschläge. Dann bleiben die Vorschläge im Korpus (suggest-only, ' +
  'dark). Sonst: Vorschläge werden NICHT geschrieben, Fehleranalyse als dokumentierte ' +
  'Grenze ins Nachweisdokument.';

// ─── Datenmodell ────────────────────────────────────────────────

/** Die Wahrheit eines Golden-Falls: `null` = bewusst „keine Beziehung". */
export interface RelationsBaselineTruth {
  caseId: string;
  relation: string | null;
  direction?: RelationDirection;
}

/**
 * Was der Klassifikator zu einem Fall gesagt hat.
 * `relation` undefined = das Modell hat sich nicht festgelegt oder die Antwort
 * wurde verworfen (OOV/metadata/fehlende Richtung) — ein Datenpunkt, ein
 * Fehler. `measurementFailed` = gar keine Antwort — KEIN Datenpunkt.
 */
export interface RelationsBaselinePrediction {
  caseId: string;
  relation?: string | null;
  direction?: RelationDirection;
  /** Antwort kam, musste aber verworfen werden (OOV, metadata, Richtung fehlt). */
  dropped?: boolean;
  /** Der verworfene metadata-Typ, falls das Modell einen vorgeschlagen hat (AC-5). */
  metadataRelation?: string;
  /** Keine Antwort nach allen Wiederholungen — fehlgeschlagene Messung. */
  measurementFailed?: boolean;
}

export interface RelationsClassMetric {
  relationType: string;
  /** Gold-Vorkommen dieser Klasse (unter den gemessenen Fällen). */
  support: number;
  /** Vorhersagen dieser Klasse. */
  predicted: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  /** support < BASELINE_GATE_MIN_SUPPORT — ausgewiesen, aber statistisch zu dünn. */
  thin: boolean;
  /** Fließt in das Gate ein (= nicht thin). */
  gated: boolean;
}

export interface RelationsNoneMetric {
  support: number;
  predicted: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

export interface RelationsBaselineVerdict {
  pass: boolean;
  /** Klartext der verfehlten Bedingungen — leer bei ERFOLG. */
  failed: string[];
  /** Klassen, die zu dünn für ein Gate sind (ausgewiesen, nicht gerechnet). */
  notGated: string[];
}

export interface RelationsBaselineReport {
  promptVersion: string;
  totalCases: number;
  /**
   * Mechanische Wahrheiten (THE-529, z. B. INTERPRETS): der Parser-Pfad ist
   * für sie zuständig — sie verlassen Zähler UND Nenner der LLM-Messung und
   * werden hier nur AUSGEWIESEN.
   */
  mechanical: { count: number; caseIds: string[] };
  /** Gemessene Fälle = totalCases − mechanical − Messausfälle. Nenner aller Quoten. */
  scored: number;
  measurementFailures: number;
  measurementFailureCaseIds: string[];
  correct: number;
  overallAgreement: number;
  none: RelationsNoneMetric;
  types: RelationsClassMetric[];
  /** Typ stimmt, Richtung nicht — eigener Fehlertyp (zählt trotzdem als Fehler). */
  directionErrors: number;
  directionErrorCaseIds: string[];
  /** Vorhergesagter Typ ≠ Gold-Typ (inkl. „Typ statt none" und „none statt Typ"). */
  typeErrors: number;
  /** Antworten, die verworfen werden mussten (OOV, metadata, fehlende Richtung). */
  oovDrops: number;
  metadataProposals: number;
  metadataProposalCaseIds: string[];
  verdict: RelationsBaselineVerdict;
}

// ─── metadata-Erkennung (AC-5) ──────────────────────────────────

const METADATA_RELATION_IDS = new Set<string>(
  NORM_ONTOLOGY.relationTypes.filter((r) => r.derivation === 'metadata').map((r) => r.id)
);

/**
 * Liest aus der ROH-Antwort, ob das Modell einen metadata-Typ vorgeschlagen hat.
 *
 * WARUM NICHT ÜBER parseRelationLabel: Der Parser wirft metadata-Typen korrekt
 * weg — genau deshalb sieht man dort hinterher nicht mehr, dass einer da WAR.
 * Die Erfolgsregel verlangt aber die Zahl „0 metadata-Vorschläge"; ohne diesen
 * Blick auf den Rohtext wäre sie strukturell nicht messbar und würde immer 0
 * lauten. Wirft nie.
 */
export function detectMetadataProposal(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const raw = obj.relation;
  if (typeof raw !== 'string') return null;
  return METADATA_RELATION_IDS.has(raw) ? raw : null;
}

// ─── Metriken (rein, ohne I/O — das eigentliche Gate) ───────────

/** Klassen-Schlüssel eines Labels: null → '__none__', undefined → '__open__'. */
function labelKey(relation: string | null | undefined): string {
  if (relation === null) return '__none__';
  if (relation === undefined) return '__open__';
  return relation;
}

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

/**
 * Rechnet die Baseline aus Wahrheiten + Vorhersagen. Rein: keine Datei, kein
 * Netz — das Gate ist damit ohne API-Key prüfbar.
 *
 * Ein Fall gilt als RICHTIG, wenn der Typ stimmt UND — bei gesetztem Typ — die
 * Richtung. Die per-Typ-Metrik nutzt denselben Maßstab (Typ+Richtung), weil ein
 * vertauschter Pfeil die Aussage der Kante umdreht; getrennt gezählt wird er
 * zusätzlich in `directionErrors`, damit die Fehleranalyse den Unterschied
 * sieht.
 */
export function scoreRelationsBaseline(
  cases: RelationsBaselineTruth[],
  predictions: RelationsBaselinePrediction[]
): RelationsBaselineReport {
  const byCase = new Map(predictions.map((p) => [p.caseId, p]));

  const measurementFailureCaseIds: string[] = [];
  const metadataProposalCaseIds: string[] = [];
  const directionErrorCaseIds: string[] = [];
  const mechanicalCaseIds: string[] = [];
  let oovDrops = 0;

  // Gemessene Paare (Wahrheit, Vorhersage) — Ausfälle sind hier bereits raus.
  const scoredPairs: Array<{ truth: RelationsBaselineTruth; pred: RelationsBaselinePrediction }> = [];

  for (const truth of cases) {
    // THE-529: mechanische Wahrheiten (Parser-Pfad) sind keine LLM-Messfälle.
    // Sie verlassen Zähler UND Nenner — eine fehlende Vorhersage ist hier
    // KEIN Messausfall, sondern die erwartete Arbeitsteilung.
    if (typeof truth.relation === 'string' && isMechanicalRelation(truth.relation)) {
      mechanicalCaseIds.push(truth.caseId);
      continue;
    }
    const pred = byCase.get(truth.caseId);
    // metadata-Vorschläge zählen IMMER, auch auf einem Fall, der als Messung
    // ausfiel: ein verbotener Typ ist eine Aussage des Modells, kein Datum.
    if (pred?.metadataRelation) metadataProposalCaseIds.push(truth.caseId);
    if (!pred || pred.measurementFailed) {
      measurementFailureCaseIds.push(truth.caseId);
      continue;
    }
    if (pred.dropped) oovDrops++;
    scoredPairs.push({ truth, pred });
  }

  let correct = 0;
  let typeErrors = 0;
  const goldCounts = new Map<string, number>();
  const predCounts = new Map<string, number>();
  const tpCounts = new Map<string, number>();

  for (const { truth, pred } of scoredPairs) {
    const g = labelKey(truth.relation);
    const p = labelKey(pred.relation);
    goldCounts.set(g, (goldCounts.get(g) ?? 0) + 1);
    predCounts.set(p, (predCounts.get(p) ?? 0) + 1);

    if (g !== p) {
      typeErrors++;
      continue;
    }
    // Typ stimmt. Bei einer echten Beziehung entscheidet jetzt die Richtung.
    if (truth.relation !== null && truth.direction !== pred.direction) {
      directionErrorCaseIds.push(truth.caseId);
      continue;
    }
    correct++;
    tpCounts.set(g, (tpCounts.get(g) ?? 0) + 1);
  }

  const metricFor = (cls: string): { support: number; predicted: number; tp: number; fp: number; fn: number; precision: number; recall: number; f1: number } => {
    const support = goldCounts.get(cls) ?? 0;
    const predicted = predCounts.get(cls) ?? 0;
    const tp = tpCounts.get(cls) ?? 0;
    const fp = predicted - tp;
    const fn = support - tp;
    const precision = ratio(tp, tp + fp);
    const recall = ratio(tp, tp + fn);
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { support, predicted, tp, fp, fn, precision, recall, f1 };
  };

  const noneRaw = metricFor('__none__');
  const none: RelationsNoneMetric = {
    support: noneRaw.support,
    predicted: noneRaw.predicted,
    tp: noneRaw.tp,
    fp: noneRaw.fp,
    fn: noneRaw.fn,
    precision: noneRaw.precision,
    recall: noneRaw.recall,
  };

  // Klassen-Universum = alles, was im Gold ODER in den Vorhersagen als echter
  // Beziehungstyp vorkam. Über-vorhergesagte Klassen ohne Gold-Support bleiben
  // dadurch sichtbar (Precision 0), statt aus dem Report zu verschwinden.
  const typeIds = new Set<string>();
  for (const k of [...goldCounts.keys(), ...predCounts.keys()]) {
    if (k !== '__none__' && k !== '__open__') typeIds.add(k);
  }

  const types: RelationsClassMetric[] = [...typeIds]
    .sort()
    .map((relationType) => {
      const m = metricFor(relationType);
      const thin = m.support < BASELINE_GATE_MIN_SUPPORT;
      // Mechanische Klassen können hier nur auftauchen, wenn eine Vorhersage
      // sie behauptet (Wahrheiten sind oben ausgesteuert; rp-4 droppt sie als
      // OOV) — sie werden ausgewiesen, aber NIE gegated (THE-529).
      return { relationType, ...m, thin, gated: !thin && !isMechanicalRelation(relationType) };
    });

  // ─── Verdikt gegen die fixierte Regel ───
  const overallAgreement = ratio(correct, scoredPairs.length);
  const failed: string[] = [];
  if (overallAgreement < BASELINE_MIN_OVERALL_AGREEMENT) {
    failed.push(
      `Gesamt-Übereinstimmung ${overallAgreement.toFixed(3)} < ${BASELINE_MIN_OVERALL_AGREEMENT}`
    );
  }
  if (none.precision < BASELINE_MIN_NONE_PRECISION) {
    failed.push(`none-Precision ${none.precision.toFixed(3)} < ${BASELINE_MIN_NONE_PRECISION}`);
  }
  for (const t of types) {
    if (t.gated && t.f1 < BASELINE_MIN_TYPE_F1) {
      failed.push(`${t.relationType}-F1 ${t.f1.toFixed(3)} < ${BASELINE_MIN_TYPE_F1} (n=${t.support})`);
    }
  }
  if (metadataProposalCaseIds.length > 0) {
    failed.push(
      `${metadataProposalCaseIds.length} metadata-Typ-Vorschläge (verlangt: 0) — AC-5 verletzt`
    );
  }

  return {
    promptVersion: RELATIONS_PROMPT_VERSION,
    totalCases: cases.length,
    mechanical: { count: mechanicalCaseIds.length, caseIds: mechanicalCaseIds },
    scored: scoredPairs.length,
    measurementFailures: measurementFailureCaseIds.length,
    measurementFailureCaseIds,
    correct,
    overallAgreement,
    none,
    types,
    directionErrors: directionErrorCaseIds.length,
    directionErrorCaseIds,
    typeErrors,
    oovDrops,
    metadataProposals: metadataProposalCaseIds.length,
    metadataProposalCaseIds,
    verdict: {
      pass: failed.length === 0,
      failed,
      notGated: types.filter((t) => t.thin).map((t) => t.relationType),
    },
  };
}

// ─── Report ─────────────────────────────────────────────────────

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

export function formatRelationsBaselineReport(r: RelationsBaselineReport): string {
  const L: string[] = [];
  L.push('═══ THE-433 Relations-Baseline ═══');
  L.push(`Prompt: ${r.promptVersion}`);
  L.push('');
  L.push(RELATIONS_BASELINE_SUCCESS_RULE);
  L.push('');
  L.push(`Fälle gesamt:        ${r.totalCases}`);
  L.push(
    `mechanical (Parser-Pfad, THE-529): n=${r.mechanical.count} — nicht Teil der LLM-Messung` +
      (r.mechanical.count > 0 ? `  (${r.mechanical.caseIds.join(', ')})` : '')
  );
  L.push(`davon gemessen:      ${r.scored}`);
  L.push(
    `Messausfälle:        ${r.measurementFailures}` +
      (r.measurementFailures > 0 ? `  (${r.measurementFailureCaseIds.join(', ')})` : '')
  );
  L.push('');
  L.push(`Gesamt-Übereinstimmung: ${r.correct}/${r.scored} = ${pct(r.overallAgreement)}`);
  L.push(`  davon Typ-Fehler:      ${r.typeErrors}`);
  L.push(
    `  davon Richtungs-Fehler: ${r.directionErrors}` +
      (r.directionErrors > 0 ? `  (${r.directionErrorCaseIds.join(', ')})` : '')
  );
  L.push('');
  L.push(
    `none (Negativ-Klasse): n=${r.none.support}  P=${pct(r.none.precision)}  R=${pct(r.none.recall)}  ` +
      `tp=${r.none.tp} fp=${r.none.fp} fn=${r.none.fn}`
  );
  L.push('');
  L.push('per Beziehungstyp (Typ UND Richtung müssen stimmen):');
  if (r.types.length === 0) L.push('  (keine)');
  for (const t of r.types) {
    L.push(
      `  ${t.relationType.padEnd(24)} n=${String(t.support).padStart(3)}  ` +
        `P=${pct(t.precision).padStart(6)}  R=${pct(t.recall).padStart(6)}  F1=${t.f1.toFixed(3)}` +
        (t.thin ? `  [zu dünn (n<${BASELINE_GATE_MIN_SUPPORT}) — ausgewiesen, NICHT gegated]` : '  [gegated]')
    );
  }
  L.push('');
  L.push(`OOV/verworfene Antworten: ${r.oovDrops}`);
  L.push(
    `metadata-Typ-Vorschläge:  ${r.metadataProposals} (verlangt: 0)` +
      (r.metadataProposals > 0 ? `  ${r.metadataProposalCaseIds.join(', ')}` : '')
  );
  L.push('');
  if (r.verdict.pass) {
    L.push('VERDIKT: ERFOLG — alle Bedingungen der Erfolgsregel erfüllt.');
    L.push('Die Vorschläge dürfen im Korpus bleiben (suggest-only, dark).');
  } else {
    L.push('VERDIKT: ABBRUCH — verfehlte Bedingungen:');
    for (const f of r.verdict.failed) L.push(`  - ${f}`);
    L.push('Vorschläge werden NICHT geschrieben; Fehleranalyse als dokumentierte Grenze.');
  }
  if (r.verdict.notGated.length > 0) {
    L.push('');
    L.push(`Zu dünn für ein Gate (n<${BASELINE_GATE_MIN_SUPPORT}): ${r.verdict.notGated.join(', ')}`);
  }
  return L.join('\n');
}

// ─── Klassifikator-Schleife ─────────────────────────────────────

/** Minimaler Fall-Shape, den der Lauf braucht (strukturell = RelationsGoldenCase). */
export interface RelationsBaselineCase extends RelationsPromptPair {
  caseId: string;
}

/**
 * THE-529: Trennt die LLM-Messfälle von den mechanischen. Fälle, deren
 * WAHRHEIT eine mechanische Klasse ist (INTERPRETS), erreichen das LLM nicht —
 * der Parser-Pfad ist produktiv für sie zuständig, und ein LLM-Call darauf
 * würde Geld für eine Klasse ausgeben, die rp-4 gar nicht mehr anbietet.
 */
export function selectLlmCases<T extends { relation?: string | null }>(cases: T[]): T[] {
  return cases.filter(
    (c) => !(typeof c.relation === 'string' && isMechanicalRelation(c.relation))
  );
}

export interface RelationsBaselineRun {
  predictions: RelationsBaselinePrediction[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Klassifiziert jeden Fall mit dem rp-2-Prompt. Der Client wird
 * HEREINGEREICHT (Muster runRelationsPrelabel): der reale Lauf nutzt
 * createRaterClient (inkl. withEmptyResponseRetry — leere Antworten sind damit
 * Messausfälle, keine Enthaltungen), Prüfsätze einen Fake ohne Netz.
 *
 * Es wird NICHTS ersetzt und NICHTS geraten: eine leere Antwort wird als
 * measurementFailed markiert, eine verworfene als dropped.
 */
export async function runRelationsBaseline(
  cases: RelationsBaselineCase[],
  client: RaterClient,
  onProgress?: (done: number, total: number) => void
): Promise<RelationsBaselineRun> {
  const predictions: RelationsBaselinePrediction[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const [i, c] of cases.entries()) {
    const res = await client.complete({
      system: RELATIONS_PRELABEL_SYSTEM,
      user: buildRelationsPrompt({ a: c.a, b: c.b }),
      maxTokens: MAX_TOKENS,
    });
    // Tokens VOR jedem Abbruch zählen — auch Ausfälle kosten Geld.
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;

    if (isEmptyRaterText(res.text)) {
      predictions.push({ caseId: c.caseId, measurementFailed: true });
      onProgress?.(i + 1, cases.length);
      continue;
    }

    const metadataRelation = detectMetadataProposal(res.text);
    const parsed = parseRelationLabel(res.text);
    const p: RelationsBaselinePrediction = { caseId: c.caseId, dropped: parsed.dropped };
    if (parsed.relation !== undefined) p.relation = parsed.relation;
    if (parsed.direction) p.direction = parsed.direction;
    if (metadataRelation) p.metadataRelation = metadataRelation;
    predictions.push(p);
    onProgress?.(i + 1, cases.length);
  }

  return { predictions, inputTokens, outputTokens };
}

// ─── CLI ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    const v = i !== -1 ? argv[i + 1] : undefined;
    return v && !v.startsWith('--') ? v : undefined;
  };

  const goldenPath = path.resolve(arg('--golden') || DEFAULT_BASELINE_GOLDEN_PATH);
  const jsonPath = arg('--json');
  const cfg = resolveRaterConfig(argv);

  const golden = loadRelationsGolden(goldenPath);
  if (!golden.frozen) {
    // Ein nicht eingefrorenes Set ist Entwicklungs-Material (RUBRIC §7) — eine
    // Baseline darauf wäre eine Zahl ohne Grundlage.
    console.error(
      `ABBRUCH: ${goldenPath} ist nicht frozen. Eine Baseline misst nur gegen ein eingefrorenes Golden.`
    );
    process.exitCode = 2;
    return;
  }

  // THE-529: mechanische Fälle (INTERPRETS) erreichen das LLM nicht — sie
  // werden nur ausgewiesen. Die Wahrheiten behalten ALLE Fälle; die Trennung
  // rechnet scoreRelationsBaseline selbst (mechanical verlässt Zähler+Nenner).
  const llmGoldenCases = selectLlmCases(golden.cases);
  const cases: RelationsBaselineCase[] = llmGoldenCases.map((c) => ({
    caseId: c.caseId,
    a: c.a,
    b: c.b,
  }));
  const truths: RelationsBaselineTruth[] = golden.cases
    .filter((c) => c.relation !== undefined)
    .map((c) => ({
      caseId: c.caseId,
      relation: c.relation as string | null,
      direction: c.direction,
    }));
  if (truths.length !== golden.cases.length) {
    console.error(
      `ABBRUCH: ${golden.cases.length - truths.length} Fälle ohne Wahrheit — ein frozen Golden darf keine offenen Labels tragen.`
    );
    process.exitCode = 2;
    return;
  }

  const client = createRaterClient(cfg);
  console.log(
    `[baseline] ${cases.length} LLM-Fälle (+${golden.cases.length - cases.length} mechanical, THE-529) · Golden ${golden.version} · Prompt ${RELATIONS_PROMPT_VERSION} · ${annotatorTag(cfg)}`
  );

  const { predictions, inputTokens, outputTokens } = await runRelationsBaseline(
    cases,
    client,
    (done, total) => process.stdout.write(`\r[baseline] ${done}/${total}`)
  );
  process.stdout.write('\n');

  const report = scoreRelationsBaseline(truths, predictions);
  console.log(formatRelationsBaselineReport(report));
  console.log('');
  console.log(`Tokens: in=${inputTokens} out=${outputTokens}`);

  if (jsonPath) {
    const out = path.resolve(jsonPath);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          goldenVersion: golden.version,
          goldenPath,
          successRule: RELATIONS_BASELINE_SUCCESS_RULE,
          provider: cfg.provider,
          model: cfg.model,
          inputTokens,
          outputTokens,
          report,
          predictions,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`JSON → ${out}`);
  }

  if (!report.verdict.pass) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
