/**
 * prelabel-typing — füllt einen Typing-Golden-DRAFT mit LLM-VORSCHLÄGEN für die
 * vier E6-Achsen, die dann im Worksheet menschlich adjudiziert werden.
 *
 * User-Entscheidung 2026-07-12: LLM-vorlabeln → Adjudikation. Der Vorschlag ist
 * KEINE Ground Truth — er beschleunigt nur das Labeln. Zwei Ehrlichkeits-Regeln:
 *  1. LEAKAGE: dasselbe Modell-Klasse (Instruct/Haiku), das später getestet
 *     wird, schlägt hier vor → im Eval-Report als Kalibrierungs-Caveat vermerken.
 *  2. OOV-DROP: ein vom Modell erfundener Wert, der nicht in E6 steht, wird
 *     verworfen (Achse bleibt offen) statt die Ontologie zu verschmutzen — genau
 *     das Muster der halluzinierten-elementId-Drop in complianceMapping.service.
 *
 *   export ANTHROPIC_API_KEY=sk-...
 *   npm run typing:prelabel -- --in src/evals/golden/typing.dsgvo.draft.json \
 *                              --out src/evals/golden/typing.dsgvo.prelabeled.json
 *   # optional: ANTHROPIC_MODEL überschreibt das Default (Instruct-Klasse).
 *
 * ZWEITER PRÜFER AUS EINEM ANDEREN HAUS (THE-421): Regel 1 oben ist nur ein
 * Caveat, solange beide Durchgänge aus derselben Modell-Familie kommen — für
 * das Freeze-Gate (Kappa >= 0,6) reicht das nicht, weil geteilte
 * Trainingsherkunft die Übereinstimmung aufbläht. Zweiter Durchgang deshalb:
 *
 *   export OPENROUTER_API_KEY=sk-or-...
 *   npm run typing:prelabel -- --provider openrouter \
 *                              --in src/evals/golden/typing.dsgvo.draft.json \
 *                              --out src/evals/golden/typing.dsgvo.openrouter.json
 *
 * Der Prompt ist in beiden Durchgängen Byte-identisch (siehe raterClient) —
 * gemessen wird Prüfer-Unabhängigkeit, nicht Prompt-Unterschied.
 *
 * Instruct-Default (nicht Thinking): Paper §5 — Instruct schlägt Thinking bei
 * Term Typing durchgängig (Output-Disziplin > Reasoning).
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Modell-Muster: complianceMapping.service
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  annotatorTag,
  createRaterClient,
  resolveRaterConfig,
  type RaterClient,
} from '../evals/raterClient';
import {
  NORM_ONTOLOGY,
  isNormKind,
  isObligationKind,
  isProvisionKind,
  BINDINGNESS_IDS,
  PARTY_ROLE_IDS,
} from '@thearchitect/shared';
import {
  TypingGoldenSetSchema,
  TYPING_AXES,
  type TypingLabels,
  type TypingGoldenCase,
  type TypingAxis,
} from '../evals/typingGolden';

// Modell + Provider kommen aus raterClient (RATER_DEFAULT_MODEL.anthropic ist
// weiterhin claude-haiku-4-5-20251001) — hier steht bewusst kein zweites Default.
const MAX_TOKENS = 400;

// ─── Membership pro Achse (O(1), E6 als einzige Quelle) ─────────
const BINDINGNESS_SET = new Set<string>(BINDINGNESS_IDS);
const PARTY_ROLE_SET = new Set<string>(PARTY_ROLE_IDS);

const AXIS_VALIDATOR: Record<TypingAxis, (v: string) => boolean> = {
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
function axisFacetOf(
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

/** Baut den User-Prompt mit den geschlossenen E6-Listen + der Provision. Rein. */
export function buildPrelabelUserPrompt(
  provision: Pick<TypingGoldenCase, 'source' | 'paragraphNumber' | 'title' | 'fullText' | 'language'>,
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

// ─── API-Glue ───────────────────────────────────────────────────

export interface TypingPrelabelResult {
  cases: TypingGoldenCase[];
  inputTokens: number;
  outputTokens: number;
  droppedTotal: number;
}

/**
 * Der eigentliche Prelabel-Lauf — Client wird HEREINGEREICHT, nicht hier
 * gebaut. Das trennt zwei Dinge, die vorher verklebt waren: welches Haus
 * antwortet (Client) und was gefragt wird (dieser Prompt). Der Prompt hier ist
 * dadurch beweisbar unabhängig vom Provider — genau das prüft der
 * Prompt-Identitäts-Test, und genau darauf beruht die Aussage, dass der Kappa
 * Prüfer-Unabhängigkeit misst und nicht Prompt-Unterschiede.
 */
export async function runTypingPrelabel(
  draft: { cases: TypingGoldenCase[] },
  client: RaterClient,
  onProgress?: (done: number, total: number) => void
): Promise<TypingPrelabelResult> {
  const annotator = annotatorTag({ provider: client.provider, model: client.model });
  let inputTokens = 0;
  let outputTokens = 0;
  let droppedTotal = 0;
  const cases: TypingGoldenCase[] = [];
  for (const [i, c] of draft.cases.entries()) {
    const res = await client.complete({
      system: PRELABEL_SYSTEM,
      user: buildPrelabelUserPrompt(c),
      maxTokens: MAX_TOKENS,
    });
    const { labels, dropped } = parsePrelabelLabels(res.text);
    droppedTotal += dropped.length;
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;
    cases.push({ ...c, labels, annotator });
    onProgress?.(i + 1, draft.cases.length);
  }
  return { cases, inputTokens, outputTokens, droppedTotal };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const inPath = arg('--in');
  if (!inPath) {
    console.error(
      'Usage: typing:prelabel --in <draft.json> [--out <out.json>] ' +
        '[--provider anthropic|openrouter] [--model <id>]'
    );
    process.exitCode = 2;
    return;
  }
  const outPath = path.resolve(arg('--out') || inPath.replace(/\.json$/, '.prelabeled.json'));
  const cfg = resolveRaterConfig(argv);

  const draft = TypingGoldenSetSchema.parse(JSON.parse(fs.readFileSync(path.resolve(inPath), 'utf8')));
  const client = createRaterClient(cfg);

  const { cases, inputTokens, outputTokens, droppedTotal } = await runTypingPrelabel(
    draft,
    client,
    (done, total) => process.stdout.write(`\r[prelabel] ${done}/${total}`)
  );

  const out = { ...draft, version: draft.version, frozen: false as const, cases };
  TypingGoldenSetSchema.parse(out);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  // Das Leakage-Caveat gilt nur, wenn der Prüfer aus demselben Haus kommt wie
  // das später getestete Modell. Bei einem Fremd-Haus-Durchgang wäre der
  // Hinweis schlicht falsch — deshalb providerabhängig.
  const caveat =
    cfg.provider === 'anthropic'
      ? '[prelabel] LEAKAGE-CAVEAT: gleiche Modell-Klasse labelt+wird getestet — im Report vermerken.'
      : `[prelabel] CROSS-HOUSE pass (${cfg.provider}) — unabhängig vom getesteten Anthropic-Modell.`;

  console.log(
    `\n[prelabel] ${cases.length} Provisions vorgelabelt (${cfg.provider}/${cfg.model})\n` +
      `[prelabel] Tokens: ${inputTokens} in / ${outputTokens} out · OOV-Drops: ${droppedTotal}\n` +
      `[prelabel] annotator: ${annotatorTag(cfg)}\n` +
      `[prelabel] → ${outPath}\n` +
      `${caveat}\n` +
      `[prelabel] NEXT: npm run typing:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/typing-label.html`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[prelabel] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
