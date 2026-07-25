/**
 * prelabel-relations — füllt einen Relations-Golden-DRAFT (Task 12b: Paar-
 * Kandidaten) mit LLM-VORSCHLÄGEN für die Cross-Norm-Relation zwischen zwei
 * Paragraphen, die dann im Worksheet menschlich adjudiziert werden.
 *
 * Mirrors prelabel-typing.ts (THE-430) — gleiches Muster, zwei Hard-Regeln
 * mehr, weil eine Relation zwei Achsen statt einer hat:
 *
 *  1. INFERRED-ONLY (THE-433 AC-5): nur Relationstypen mit
 *     `derivation: 'inferred'` dürfen dem Modell überhaupt angeboten werden.
 *     `AMENDS`/`CONSOLIDATES`/`REPEALS`/`CITES` kommen aus offiziellen
 *     Dokument-Metadaten (ELI/CELLAR) — ein Sprachmodell darf sie NIEMALS
 *     vorschlagen. `isInferredRelation` (aus @thearchitect/shared) ist das
 *     Gate, sowohl beim Bauen der Options-Liste als auch beim Parsen: schlägt
 *     das Modell trotzdem eine Metadata-Relation vor, wird sie wie OOV
 *     behandelt und verworfen.
 *
 *  2. EXPLICIT DIRECTION: das Paar ist nach `regulationKey` sortiert
 *     gespeichert (stabile Identität), das trägt aber KEINE rechtliche
 *     Bedeutung. Die Richtung ist ein eigenes Modell-Feld (`direction`,
 *     'a-to-b' | 'b-to-a') und wird nie aus der Sortierung abgeleitet. Eine
 *     Relation ohne gültige Richtung ist unvollständig → offen bleiben
 *     (droppen), nicht raten.
 *
 *  3. LEAKAGE: dasselbe Modell-Klasse (Instruct/Haiku), das später getestet
 *     wird, schlägt hier vor → im Report als Kalibrierungs-Caveat vermerken.
 *
 *   export ANTHROPIC_API_KEY=sk-...
 *   npm run relations:prelabel -- --in src/evals/golden/relations.v1.draft.json \
 *                                  --out src/evals/golden/relations.v1.prelabeled.json
 *   # optional: ANTHROPIC_MODEL überschreibt das Default (Instruct-Klasse).
 *
 * ZWEITER PRÜFER AUS EINEM ANDEREN HAUS (THE-421): Regel 3 bleibt ein bloßes
 * Caveat, solange beide Durchgänge aus derselben Familie stammen — für das
 * Freeze-Gate (Kappa >= 0,6) zu wenig. Zweiter Durchgang deshalb:
 *
 *   export OPENROUTER_API_KEY=sk-or-...
 *   npm run relations:prelabel -- --provider openrouter \
 *                                  --in src/evals/golden/relations.v1.draft.json \
 *                                  --out src/evals/golden/relations.v1.openrouter.json
 *
 * Der Prompt ist in beiden Durchgängen Byte-identisch (siehe raterClient).
 *
 * Linear: THE-421 (Task 13) · Modell-Muster: prelabel-typing.ts (THE-430)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  RELATIONS_PRELABEL_SYSTEM,
  buildRelationsPrompt,
  parseRelationLabel,
} from '@thearchitect/shared';
import {
  annotatorTag,
  createRaterClient,
  isEmptyRaterText,
  resolveRaterConfig,
  EMPTY_RESPONSE_MAX_ATTEMPTS,
  type RaterClient,
} from '../evals/raterClient';
import { RelationsGoldenSetSchema, type RelationsGoldenCase } from '../evals/relationsGolden';

// Modell + Provider kommen aus raterClient — hier kein zweites Default.
const MAX_TOKENS = 200;

// ─── Prompt: seit THE-433 (Slice 1, Task 3a) in @thearchitect/shared ─────────
//
// System-Prompt, Rubrik-Regeln (rp-2), buildRelationsPrompt und
// parseRelationLabel sind nach shared/src/relations/prompt.ts umgezogen
// (mitsamt ihrer Begründungs-Kommentare) — dasselbe Muster wie der
// Typing-Prompt (shared/src/typing/prompt.ts): Eval (hier) und Batch
// (compliance-crawler, Server B) müssen den BYTE-identischen Prompt fahren,
// sonst misst die Eval ein anderes System als das produktive.
// Re-Export, damit bestehende Importeure (prelabelRelations.test.ts)
// unverändert weiterlaufen — deren Grün ist der Beweis der Gleichheit.
export {
  RELATIONS_PRELABEL_SYSTEM,
  RELATIONS_PROMPT_VERSION,
  RELATIONS_RUBRIC_RULES,
  buildRelationsPrompt,
  parseRelationLabel,
} from '@thearchitect/shared';
export type { ParsedRelationLabel } from '@thearchitect/shared';

// ─── API-Glue ───────────────────────────────────────────────────

export interface RelationsPrelabelResult {
  cases: RelationsGoldenCase[];
  inputTokens: number;
  outputTokens: number;
  droppedTotal: number;
  /**
   * Fälle, für die der Prüfer auch nach allen Wiederholungen NICHTS geliefert
   * hat — fehlgeschlagene Messungen. Eigener Zähler neben `droppedTotal`: ein
   * Drop ist eine verworfene Aussage, ein Ausfall ist gar keine Aussage.
   */
  noResponseTotal: number;
  /** caseIds der Ausfälle — damit sie gezielt nachgefahren werden können. */
  noResponseCaseIds: string[];
}

/**
 * Der eigentliche Prelabel-Lauf — Client wird HEREINGEREICHT (siehe
 * runTypingPrelabel für die ausführliche Begründung): welches Haus antwortet
 * und was gefragt wird, sind getrennt, damit die Prompt-Identität über beide
 * Provider hinweg prüfbar ist.
 */
export async function runRelationsPrelabel(
  draft: { cases: RelationsGoldenCase[] },
  client: RaterClient,
  onProgress?: (done: number, total: number) => void
): Promise<RelationsPrelabelResult> {
  const annotator = annotatorTag({ provider: client.provider, model: client.model });
  let inputTokens = 0;
  let outputTokens = 0;
  let droppedTotal = 0;
  const noResponseCaseIds: string[] = [];
  const cases: RelationsGoldenCase[] = [];
  for (const [i, c] of draft.cases.entries()) {
    const res = await client.complete({
      system: RELATIONS_PRELABEL_SYSTEM,
      user: buildRelationsPrompt(c),
      maxTokens: MAX_TOKENS,
    });
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;

    // Leerer Text = keine Antwort (der Client hat bereits wiederholt). Gar
    // nicht erst parsen: der Parser würde daraus korrekt „offen" machen, und
    // danach wäre der Ausfall von der bewussten Nicht-Aussage des Prüfers nicht
    // mehr zu trennen. Auf DIESER Achse wiegt das doppelt — „none" ist hier
    // eine echte Klasse; ein Ausfall darf dort niemals landen.
    if (isEmptyRaterText(res.text)) {
      noResponseCaseIds.push(c.caseId);
      const failed: RelationsGoldenCase = { ...c, annotator, measurementFailed: true };
      delete failed.relation;
      delete failed.direction;
      cases.push(failed);
      onProgress?.(i + 1, draft.cases.length);
      continue;
    }

    const { relation, direction, dropped } = parseRelationLabel(res.text);
    if (dropped) droppedTotal += 1;

    const updated: RelationsGoldenCase = { ...c, annotator };
    if (relation === null) {
      updated.relation = null;
      delete updated.direction;
    } else if (relation !== undefined) {
      updated.relation = relation;
      if (direction) updated.direction = direction;
    } else {
      // offen (weder gelabelt noch als "none" beantwortet, oder verworfen) —
      // vorhandene relation/direction NICHT übernehmen, Draft-Zustand bleibt.
      delete updated.relation;
      delete updated.direction;
    }
    cases.push(updated);
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
      'Usage: relations:prelabel --in <draft.json> [--out <out.json>] ' +
        '[--provider anthropic|openrouter] [--model <id>]'
    );
    process.exitCode = 2;
    return;
  }
  const outPath = path.resolve(arg('--out') || inPath.replace(/\.json$/, '.prelabeled.json'));
  const cfg = resolveRaterConfig(argv);

  const draft = RelationsGoldenSetSchema.parse(JSON.parse(fs.readFileSync(path.resolve(inPath), 'utf8')));
  const client = createRaterClient(cfg);

  const { cases, inputTokens, outputTokens, droppedTotal, noResponseTotal, noResponseCaseIds } =
    await runRelationsPrelabel(draft, client, (done, total) =>
      process.stdout.write(`\r[prelabel] ${done}/${total}`)
    );

  const out = { ...draft, version: draft.version, frozen: false as const, cases };
  RelationsGoldenSetSchema.parse(out);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  // Regel 3 (LEAKAGE) greift nur beim Durchgang aus demselben Haus.
  const caveat =
    cfg.provider === 'anthropic'
      ? '[prelabel] LEAKAGE-CAVEAT: gleiche Modell-Klasse labelt+wird getestet — im Report vermerken.'
      : `[prelabel] CROSS-HOUSE pass (${cfg.provider}) — unabhängig vom getesteten Anthropic-Modell.`;

  console.log(
    `\n[prelabel] ${cases.length} Paare vorgelabelt (${cfg.provider}/${cfg.model})\n` +
      `[prelabel] Tokens: ${inputTokens} in / ${outputTokens} out · Drops (Metadata/OOV/fehlende Richtung): ${droppedTotal} · ` +
      `no response: ${noResponseTotal}\n` +
      `[prelabel] annotator: ${annotatorTag(cfg)}\n` +
      `[prelabel] → ${outPath}\n` +
      `${caveat}\n` +
      `[prelabel] NEXT: npm run relations:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/relations-label.html`
  );

  // Unübersehbar ganz zum Schluss + Exit-Code: Ausfälle fallen später als
  // „offen" aus dem Kappa und schönen die Zahl, ohne dass es jemand bemerkt.
  if (noResponseTotal > 0) {
    console.error(
      `\n[prelabel] ⚠️  FAILED MEASUREMENTS: ${noResponseTotal} case(s) produced NO response after ` +
        `${EMPTY_RESPONSE_MAX_ATTEMPTS} attempts.\n` +
        `[prelabel] These are missing data, NOT rater abstentions — in particular they are NOT "none". ` +
        `They are marked with "measurementFailed": true in the output file and would otherwise be ` +
        `silently excluded from kappa as "open", which INVALIDATES this pass as a measurement until ` +
        `they are re-run.\n` +
        `[prelabel] Affected caseIds: ${noResponseCaseIds.join(', ')}`
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[prelabel] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
