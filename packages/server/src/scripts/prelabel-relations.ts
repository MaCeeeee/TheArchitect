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
import { NORM_ONTOLOGY, isInferredRelation } from '@thearchitect/shared';
import {
  annotatorTag,
  createRaterClient,
  resolveRaterConfig,
  type RaterClient,
} from '../evals/raterClient';
import { RelationsGoldenSetSchema, type RelationsGoldenCase } from '../evals/relationsGolden';

// Modell + Provider kommen aus raterClient — hier kein zweites Default.
const MAX_TOKENS = 200;

// ─── Options-Liste: NUR inferred Relationstypen, aus der Ontologie generiert ──
const INFERRED_RELATION_TYPES = NORM_ONTOLOGY.relationTypes.filter((r) => isInferredRelation(r.id));
const DIRECTIONS = ['a-to-b', 'b-to-a'] as const;
type Direction = (typeof DIRECTIONS)[number];
const DIRECTION_SET = new Set<string>(DIRECTIONS);

// ─── Prompt (rein, testbar) ─────────────────────────────────────

export const RELATIONS_PRELABEL_SYSTEM =
  'You are a legal-informatics classifier. You decide whether a CROSS-NORM RELATION holds between two ' +
  'legal provisions from two different laws. You MUST choose the relation id only from the provided ' +
  'CLOSED list, or "none" if no such relation holds. Never invent a relation id, and never propose a ' +
  'relation that is not in the list. If a relation applies, you MUST also state its direction. Respond ' +
  'with STRICT JSON only, no prose.';

function relationOptionsList(): string {
  return INFERRED_RELATION_TYPES.map((r) => `${r.id} (${r.label})`).join(', ');
}

function renderSide(label: 'A' | 'B', side: RelationsGoldenCase['a']): string {
  return [
    `Paragraph ${label} [${side.source} ${side.paragraphNumber}${side.title ? ' — ' + side.title : ''}] (${side.language}):`,
    side.fullText,
  ].join('\n');
}

/**
 * Die Entscheidungsregeln aus RUBRIC.md Teil C, verdichtet für den Prompt.
 *
 * WARUM DAS HIER STEHEN MUSS: Der erste Zwei-Prüfer-Lauf ohne diese Regeln kam
 * auf Gesamt-Kappa 0,265 bei 81,7 % Rohübereinstimmung. Die Analyse der
 * Abweichungen war eindeutig — nahezu alle waren Fälle von C4 (paralleles
 * Schutzziel als Beziehung gelabelt) oder der Abgrenzung Verdrängung vs.
 * Konkretisierung aus C5. Beide Prüfer bekamen nur die Namensliste der
 * Beziehungsarten; die Rubrik hatten sie nie gesehen.
 *
 * Das entscheidet, wie die Zahl zu lesen ist: Ein niedriger Kappa misst nur
 * dann eine unklare Aufgabendefinition, wenn die Prüfer die Definition auch
 * bekommen haben. Sonst misst er die Lücke im Prompt. Deshalb wandert die
 * Rubrik in den Prompt — und deshalb ist das KEIN Modell-Tuning im Sinne von
 * § 7.4: es wird nichts an den Labels gedreht, sondern die Aufgabenstellung
 * überhaupt erst mitgeliefert.
 *
 * Bei Änderungen an RUBRIC.md Teil C ist dieser Text nachzuziehen — er ist
 * bewusst eine Verdichtung, keine zweite Quelle der Wahrheit.
 */
export const RELATIONS_RUBRIC_RULES = [
  'DECISION RULES (from RUBRIC.md part C — apply them strictly):',
  '',
  'RULE 1 — a parallel obligation is NOT a relation. This is the most common labeling error.',
  'Two provisions from different regimes may pursue the same protective goal (e.g. GDPR Art. 32 and',
  'NIS2 Art. 21 both require technical and organisational security measures) without either saying',
  'anything ABOUT the other. Neither displaces, concretises, or substitutes for the other. Correct',
  'label: "none". Test: does one of the two provisions refer — expressly or in substance — to the',
  'OTHER NORM? If not, answer "none", no matter how similar the subject matter is.',
  '',
  'RULE 2 — displacement vs. concretisation. Test: after applying the one, does the other still',
  'apply? If it stops applying in that area → PREVAILS_OVER / DEROGATED_BY (lex specialis; markers:',
  '"shall not apply to the extent that", "without prejudice to", sector-specific priority clauses).',
  'If it keeps applying and is merely filled in more precisely → CONCRETIZES.',
  '',
  'RULE 3 — concretisation vs. parameter. A concrete value, deadline or threshold → SETS_PARAMETER.',
  'Substantive elaboration without a fixed value → CONCRETIZES.',
  '',
  'RULE 4 — RECOGNIZES_EQUIVALENCE requires an actual recognition clause ("shall be deemed to',
  'satisfy…"). IMPLEMENTS requires an implementing act referring to a basic act ("implementing',
  'regulation pursuant to…"). INTERPRETS requires the one to define a term OF the other ("within the',
  'meaning of Article X of Regulation Y"). Do not use these merely because the topics overlap.',
  '',
  'When in doubt between "none" and a relation, answer "none" — the set is conservative by design.',
].join('\n');

/** Baut den User-Prompt mit der geschlossenen inferred-Relations-Liste + dem Paar. Rein. */
export function buildRelationsPrompt(c: RelationsGoldenCase): string {
  return [
    'Decide whether a cross-norm relation holds between paragraph A and paragraph B below, and if so, which one.',
    '',
    `relation: ${relationOptionsList()}, or "none" if no relation holds.`,
    '',
    RELATIONS_RUBRIC_RULES,
    '',
    renderSide('A', c.a),
    '',
    renderSide('B', c.b),
    '',
    'If "relation" is set to one of the ids above, you MUST also state "direction": "a-to-b" means the ' +
      'relation points FROM paragraph A TO paragraph B (A is the subject of the relation label, e.g. ' +
      '"A derogated_by B" means A is derogated by B); "b-to-a" means it points from B to A. Do not guess ' +
      'a direction you are not sure of — if unsure, respond "none" instead.',
    '',
    'Respond with exactly: {"relation": "...", "direction": "a-to-b"} or {"relation": "none"}',
  ].join('\n');
}

export interface ParsedRelationLabel {
  /** Absent = open (model did not commit / field missing). null = deliberate "no relation". An id = labeled. */
  relation?: string | null;
  /** Required when `relation` is an id; absent when `relation` is null/undefined. */
  direction?: Direction;
  /** true when the model proposed something (a relation id and/or a direction) that had to be discarded. */
  dropped: boolean;
}

/**
 * Parst die Modell-JSON in ein validiertes Relations-Label. "none" → null
 * (bewusste Negativ-Aussage); fehlendes/leeres `relation` → offen (undefined,
 * kein Drop — das Modell hat sich schlicht nicht committed). Eine
 * Metadata-Relation ODER eine inferred-Relation ohne gültige `direction` wird
 * verworfen (`dropped: true`, Label bleibt offen) — nie geraten. Wirft NIE.
 */
export function parseRelationLabel(text: string): ParsedRelationLabel {
  let obj: Record<string, unknown> = {};
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      obj = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      obj = {};
    }
  }

  const rawRelation = obj.relation;
  if (rawRelation == null || rawRelation === '') {
    // Fehlendes Feld → offen, kein Drop (das Modell hat nichts behauptet).
    return { dropped: false };
  }
  if (rawRelation === 'none') {
    // Bewusste Negativ-Aussage: keine Relation → direction ist verboten.
    return { relation: null, dropped: false };
  }

  const relationId = String(rawRelation);
  if (!isInferredRelation(relationId)) {
    // Metadata-Relation (verboten) ODER komplett erfunden → OOV-Drop.
    return { dropped: true };
  }

  const rawDirection = obj.direction;
  const direction = typeof rawDirection === 'string' ? rawDirection : undefined;
  if (!direction || !DIRECTION_SET.has(direction)) {
    // Relation ohne gültige Richtung ist unvollständig → offen lassen, nicht raten.
    return { dropped: true };
  }

  return { relation: relationId, direction: direction as Direction, dropped: false };
}

// ─── API-Glue ───────────────────────────────────────────────────

export interface RelationsPrelabelResult {
  cases: RelationsGoldenCase[];
  inputTokens: number;
  outputTokens: number;
  droppedTotal: number;
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
  const cases: RelationsGoldenCase[] = [];
  for (const [i, c] of draft.cases.entries()) {
    const res = await client.complete({
      system: RELATIONS_PRELABEL_SYSTEM,
      user: buildRelationsPrompt(c),
      maxTokens: MAX_TOKENS,
    });
    const { relation, direction, dropped } = parseRelationLabel(res.text);
    if (dropped) droppedTotal += 1;
    inputTokens += res.inputTokens;
    outputTokens += res.outputTokens;

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

  const { cases, inputTokens, outputTokens, droppedTotal } = await runRelationsPrelabel(
    draft,
    client,
    (done, total) => process.stdout.write(`\r[prelabel] ${done}/${total}`)
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
      `[prelabel] Tokens: ${inputTokens} in / ${outputTokens} out · Drops (Metadata/OOV/fehlende Richtung): ${droppedTotal}\n` +
      `[prelabel] annotator: ${annotatorTag(cfg)}\n` +
      `[prelabel] → ${outPath}\n` +
      `${caveat}\n` +
      `[prelabel] NEXT: npm run relations:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/relations-label.html`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[prelabel] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
