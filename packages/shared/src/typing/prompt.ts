/**
 * Typing-Prompt — die EINE Quelle für den Term-Typing-Klassifizierungs-Prompt
 * (5 E6-Achsen gegen die geschlossene Ontologie).
 *
 * WARUM in shared (THE-432 Slice T): Der Batch (packages/compliance-crawler,
 * Server B) und die Eval (packages/server, Golden-Set-Messung) MÜSSEN den
 * Byte-identischen Prompt verwenden — sonst misst die Eval ein anderes System
 * als das, das produktiv klassifiziert, und die Kappa-/Accuracy-Zahlen sind
 * keine Aussage über den Batch. Der Crawler hängt nur von @thearchitect/shared
 * ab, nicht von packages/server — deshalb lebt der Prompt hier.
 *
 * Hierher verschoben aus packages/server/src/scripts/prelabel-typing.ts
 * (THE-430) — reine Relokation, kein Inhalts-Change. Die Zod-Schemata des
 * Golden-Sets bleiben bewusst in packages/server/src/evals/typingGolden.ts:
 * der Crawler braucht sie nicht, und shared soll keine Eval-Infrastruktur
 * tragen.
 *
 * Linear: THE-432 (Slice T) · Ursprung: THE-430 (REQ-ONTO-001.5)
 */
import {
  NORM_ONTOLOGY,
  isNormKind,
  isObligationKind,
  isProvisionKind,
  BINDINGNESS_IDS,
  PARTY_ROLE_IDS,
} from '../ontology';

/** Bump bei JEDER inhaltlichen Änderung an System/Rules/Template — Teil der Provenance (AC-1) und der Batch-Idempotenz (THE-432). */
export const TYPING_PROMPT_VERSION = 'tp-1';

// ─── Achsen (Kontrakt-Oberfläche, siehe axisFacetOf) ────────────
export const TYPING_AXES = [
  'normKind',
  'bindingness',
  'obligationKind',
  'partyRole',
  'provisionKind',
] as const;
export type TypingAxis = (typeof TYPING_AXES)[number];

/**
 * Labels als PLAINER Typ (kein Zod): `null` = bewusst nicht anwendbar,
 * fehlend/undefined = offen. Strukturell identisch mit dem Zod-inferierten
 * `TypingLabels` in packages/server/src/evals/typingGolden.ts — die Validierung
 * gegen das Golden-Schema bleibt dort, der Crawler braucht nur die Struktur.
 */
export type TypingLabels = Partial<Record<TypingAxis, string | null>>;

// ─── Membership pro Achse (O(1), E6 als einzige Quelle) ─────────
const BINDINGNESS_SET = new Set<string>(BINDINGNESS_IDS);
const PARTY_ROLE_SET = new Set<string>(PARTY_ROLE_IDS);

export const AXIS_VALIDATOR: Record<TypingAxis, (v: string) => boolean> = {
  normKind: isNormKind,
  bindingness: (v) => BINDINGNESS_SET.has(v),
  obligationKind: isObligationKind,
  partyRole: (v) => PARTY_ROLE_SET.has(v),
  provisionKind: isProvisionKind,
};

// ─── Prompt (rein, testbar) ─────────────────────────────────────

export const PRELABEL_SYSTEM =
  'You are a legal-informatics classifier. You type a single legal provision against a CLOSED ' +
  'ontology. You MUST choose ids only from the provided lists, or "na" if an axis genuinely does ' +
  'not apply to this provision (e.g. a definitions or scope clause has no deontic force). Never ' +
  'invent ids. Respond with STRICT JSON only, no prose.';

function axisList(entries: ReadonlyArray<{ id: string; label: string }>): string {
  return entries.map((e) => `${e.id} (${e.label})`).join(', ');
}

// Achse → E6-Facette. Zusammen mit TYPING_AXES (Achsenliste) und AXIS_VALIDATOR
// (Membership) bilden diese drei Records die komplette Kontrakt-Oberfläche
// einer Achse — alle drei sind `Record<TypingAxis, …>`, der Compiler zwingt
// also bei jeder neuen Achse zu allen drei Stellen. Der Prompt unten wird aus
// TYPING_AXES + dieser Facetten-Map GENERIERT statt Zeile für Zeile
// handgeschrieben — genau die Parallel-Pflege (vier Achsen im Prosa-Text,
// fünf im Schema) war der Drift, den dieser Task beheben soll.
export function axisFacetOf(
  ontology: typeof NORM_ONTOLOGY
): Record<TypingAxis, ReadonlyArray<{ id: string; label: string }>> {
  return {
    normKind: ontology.normKinds,
    bindingness: ontology.bindingness,
    obligationKind: ontology.obligationKinds,
    partyRole: ontology.partyRoles,
    provisionKind: ontology.provisionKinds,
  };
}

/**
 * Die drei strittigen Abgrenzungen aus RUBRIC.md B3, verdichtet für den Prompt.
 *
 * Gleiche Begründung wie bei den Beziehungs-Regeln: Ein Kappa misst nur dann
 * eine unklare Aufgabendefinition, wenn die Prüfer die Definition bekommen
 * haben. Vorher enthielt der Prompt nur die Wertelisten der Ontologie — die
 * Abgrenzungsregeln, an denen Prüfer erfahrungsgemäß auseinandergehen, standen
 * ausschließlich in der Rubrik, die kein Prüfer zu sehen bekam.
 *
 * Bei Änderungen an RUBRIC.md B3 ist dieser Text nachzuziehen — Verdichtung,
 * keine zweite Quelle der Wahrheit.
 */
export const TYPING_RUBRIC_RULES = [
  'DECISION RULES (from RUBRIC.md B3 — the three distinctions annotators disagree on):',
  '',
  '1. scope-applicability vs. definition. Test: does the text decide WHETHER the law applies, or does',
  '   it merely fix vocabulary? A definition may narrow the scope indirectly — it still stays',
  '   "definition". Only where the provision itself states applicability is it "scope-applicability".',
  '',
  '2. obligation vs. procedural. Test: does this provision CREATE the duty, or regulate the handling of',
  '   a duty created elsewhere? A duty to notify is "obligation"; the 72-hour deadline and the',
  '   notification form for it are "procedural". If both are in one provision, the centre of gravity',
  '   decides.',
  '',
  '3. obligation vs. enforcement-supervision. Test: who is addressed? Duties of the regulated party →',
  '   "obligation". Powers or duties of the authority → "enforcement-supervision". This axis almost',
  '   always runs parallel to partyRole — if that is a supervisory authority, "obligation" is suspect.',
  '',
  'normKind and bindingness describe the DOCUMENT the provision comes from, not the individual',
  'provision. A provision that EMPOWERS the Commission to adopt delegated acts is not itself a',
  'delegated act — the label follows the source.',
].join('\n');

/**
 * Minimaler Provisions-Ausschnitt, den der Prompt braucht. Strukturell
 * kompatibel zum Golden-Case (server, `Pick<TypingGoldenCase, …>`) UND zum
 * Korpus-Dokument (crawler) — bewusst plain, damit beide Seiten ohne
 * Zod-Abhängigkeit denselben Prompt bauen können.
 */
export interface TypingPromptProvision {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
}

/** Baut den User-Prompt mit den geschlossenen E6-Listen + der Provision. Rein. */
export function buildPrelabelUserPrompt(
  provision: TypingPromptProvision,
  ontology = NORM_ONTOLOGY
): string {
  const facet = axisFacetOf(ontology);
  return [
    `Classify this provision on ${TYPING_AXES.length} axes. Choose ONE id per axis from its list, or "na".`,
    '',
    ...TYPING_AXES.map((axis) => `${axis}: ${axisList(facet[axis])}`),
    '',
    TYPING_RUBRIC_RULES,
    '',
    `Provision [${provision.source} ${provision.paragraphNumber}${provision.title ? ' — ' + provision.title : ''}] (${provision.language}):`,
    provision.fullText,
    '',
    `Respond with exactly: {${TYPING_AXES.map((axis) => `"${axis}": "..."`).join(', ')}}`,
  ].join('\n');
}

export interface ParsedPrelabel {
  labels: TypingLabels;
  /** Achsen, deren Modell-Wert nicht in E6 stand → verworfen (offen gelassen). */
  dropped: TypingAxis[];
}

/**
 * Parst die Modell-JSON in validierte Labels. "na"/null → null (nicht anwendbar);
 * OOV (nicht in E6) → Achse offen + in `dropped` gezählt. Wirft NICHT — ein
 * kaputter Batch-Eintrag soll den Lauf nicht killen (Achsen bleiben offen).
 */
export function parsePrelabelLabels(text: string): ParsedPrelabel {
  const labels: TypingLabels = {};
  const dropped: TypingAxis[] = [];
  let obj: Record<string, unknown> = {};
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      obj = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }
  for (const axis of TYPING_AXES) {
    const raw = obj[axis];
    if (raw == null || raw === 'na' || raw === '') {
      // "na" ist eine bewusste Nicht-Anwendbar-Aussage → null; fehlend → offen (undefined).
      if (raw === 'na' || raw === null) labels[axis] = null;
      continue;
    }
    const v = String(raw);
    if (AXIS_VALIDATOR[axis](v)) labels[axis] = v;
    else dropped.push(axis); // OOV → offen lassen, nicht raten
  }
  return { labels, dropped };
}
