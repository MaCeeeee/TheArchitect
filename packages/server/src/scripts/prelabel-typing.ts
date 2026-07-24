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
  isEmptyRaterText,
  resolveRaterConfig,
  EMPTY_RESPONSE_MAX_ATTEMPTS,
  type RaterClient,
} from '../evals/raterClient';
import { PRELABEL_SYSTEM, buildPrelabelUserPrompt, parsePrelabelLabels } from '@thearchitect/shared';
import { TypingGoldenSetSchema, type TypingGoldenCase } from '../evals/typingGolden';

// Prompt, Parser und Achsen-Kontrakt leben seit THE-432 (Slice T) in
// @thearchitect/shared/src/typing/prompt.ts — der Batch (compliance-crawler,
// Server B) und diese Eval-Seite MÜSSEN den Byte-identischen Prompt verwenden,
// und der Crawler kann nicht aus packages/server importieren. Re-Export hier,
// damit bestehende Importe (runTypingEval, Tests) unverändert weiterlaufen.
export {
  PRELABEL_SYSTEM,
  TYPING_RUBRIC_RULES,
  buildPrelabelUserPrompt,
  parsePrelabelLabels,
  type ParsedPrelabel,
} from '@thearchitect/shared';

// Modell + Provider kommen aus raterClient (RATER_DEFAULT_MODEL.anthropic ist
// weiterhin claude-haiku-4-5-20251001) — hier steht bewusst kein zweites Default.
const MAX_TOKENS = 400;

// ─── API-Glue ───────────────────────────────────────────────────

export interface TypingPrelabelResult {
  cases: TypingGoldenCase[];
  inputTokens: number;
  outputTokens: number;
  droppedTotal: number;
  /**
   * Fälle, für die der Prüfer auch nach allen Wiederholungen NICHTS geliefert
   * hat — fehlgeschlagene Messungen. Bewusst ein EIGENER Zähler neben
   * `droppedTotal`: ein OOV-Drop ist eine verworfene Aussage des Modells, ein
   * Ausfall ist gar keine Aussage. Würde man beide addieren, wäre die
   * Unterscheidung wieder weg, um die es hier geht.
   */
  noResponseTotal: number;
  /** caseIds der Ausfälle — damit sie gezielt nachgefahren werden können. */
  noResponseCaseIds: string[];
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
  const noResponseCaseIds: string[] = [];
  const cases: TypingGoldenCase[] = [];
  for (const [i, c] of draft.cases.entries()) {
    const res = await client.complete({
      system: PRELABEL_SYSTEM,
      user: buildPrelabelUserPrompt(c),
      maxTokens: MAX_TOKENS,
    });
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;

    // Leerer Text = der Prüfer hat nichts gesagt (der Client hat da bereits
    // wiederholt). Er wird NICHT in den Parser gegeben: der würde daraus
    // korrekt „alle Achsen offen" machen, und ab dann wäre der Ausfall von
    // einer bewussten Nicht-Aussage nicht mehr zu unterscheiden — genau der
    // Fehler, der 18 von 100 Fällen lautlos aus dem Kappa fallen ließ.
    if (isEmptyRaterText(res.text)) {
      noResponseCaseIds.push(c.caseId);
      cases.push({ ...c, labels: {}, annotator, measurementFailed: true });
      onProgress?.(i + 1, draft.cases.length);
      continue;
    }

    const { labels, dropped } = parsePrelabelLabels(res.text);
    droppedTotal += dropped.length;
    cases.push({ ...c, labels, annotator });
    onProgress?.(i + 1, draft.cases.length);
  }
  return {
    cases,
    inputTokens,
    outputTokens,
    droppedTotal,
    noResponseTotal: noResponseCaseIds.length,
    noResponseCaseIds,
  };
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

  const { cases, inputTokens, outputTokens, droppedTotal, noResponseTotal, noResponseCaseIds } =
    await runTypingPrelabel(draft, client, (done, total) =>
      process.stdout.write(`\r[prelabel] ${done}/${total}`)
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
      `[prelabel] Tokens: ${inputTokens} in / ${outputTokens} out · OOV-Drops: ${droppedTotal} · ` +
      `no response: ${noResponseTotal}\n` +
      `[prelabel] annotator: ${annotatorTag(cfg)}\n` +
      `[prelabel] → ${outPath}\n` +
      `${caveat}\n` +
      `[prelabel] NEXT: npm run typing:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/typing-label.html`
  );

  // Ausfälle sind KEIN Randdetail: sie fallen später als „offen" aus dem Kappa
  // heraus und schönen die Zahl, ohne dass es jemand sieht. Deshalb ganz zum
  // Schluss, unübersehbar, mit Exit-Code — und mit den caseIds, damit gezielt
  // nachgefahren werden kann statt den ganzen Lauf zu wiederholen.
  reportFailedMeasurements(noResponseTotal, noResponseCaseIds);
}

/** Gemeinsame Ausgabe für Ausfälle (siehe prelabel-relations für das Gegenstück). */
function reportFailedMeasurements(total: number, caseIds: string[]): void {
  if (total === 0) return;
  console.error(
    `\n[prelabel] ⚠️  FAILED MEASUREMENTS: ${total} case(s) produced NO response after ` +
      `${EMPTY_RESPONSE_MAX_ATTEMPTS} attempts.\n` +
      `[prelabel] These are missing data, NOT rater abstentions. They are marked with ` +
      `"measurementFailed": true in the output file and would otherwise be silently excluded from ` +
      `kappa as "open" — which INVALIDATES this pass as a measurement until they are re-run.\n` +
      `[prelabel] Affected caseIds: ${caseIds.join(', ')}`
  );
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[prelabel] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
