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
 * Linear: THE-421 (Task 13) · Modell-Muster: prelabel-typing.ts (THE-430)
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { NORM_ONTOLOGY, isInferredRelation } from '@thearchitect/shared';
import { RelationsGoldenSetSchema, type RelationsGoldenCase } from '../evals/relationsGolden';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
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

/** Baut den User-Prompt mit der geschlossenen inferred-Relations-Liste + dem Paar. Rein. */
export function buildRelationsPrompt(c: RelationsGoldenCase): string {
  return [
    'Decide whether a cross-norm relation holds between paragraph A and paragraph B below, and if so, which one.',
    '',
    `relation: ${relationOptionsList()}, or "none" if no relation holds.`,
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

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY ist nicht gesetzt.');
  return new Anthropic({ apiKey });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const inPath = arg('--in');
  if (!inPath) {
    console.error('Usage: relations:prelabel --in <draft.json> [--out <out.json>]');
    process.exitCode = 2;
    return;
  }
  const outPath = path.resolve(arg('--out') ?? inPath.replace(/\.json$/, '.prelabeled.json'));
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const draft = RelationsGoldenSetSchema.parse(JSON.parse(fs.readFileSync(path.resolve(inPath), 'utf8')));
  const client = getClient();

  let inTok = 0;
  let outTok = 0;
  let droppedTotal = 0;
  const cases: RelationsGoldenCase[] = [];
  for (const [i, c] of draft.cases.entries()) {
    const userMessage = buildRelationsPrompt(c);
    const res = await client.messages.create({
      model,
      system: RELATIONS_PRELABEL_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: MAX_TOKENS,
    });
    const block = res.content.find((b) => b.type === 'text');
    const text = block && block.type === 'text' ? block.text : '';
    const { relation, direction, dropped } = parseRelationLabel(text);
    if (dropped) droppedTotal += 1;
    const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    inTok += usage?.input_tokens ?? 0;
    outTok += usage?.output_tokens ?? 0;

    const updated: RelationsGoldenCase = { ...c, annotator: `llm-prelabel:${model}` };
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
    process.stdout.write(`\r[prelabel] ${i + 1}/${draft.cases.length}`);
  }

  const out = { ...draft, version: draft.version, frozen: false as const, cases };
  RelationsGoldenSetSchema.parse(out);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  console.log(
    `\n[prelabel] ${cases.length} Paare vorgelabelt (${model})\n` +
      `[prelabel] Tokens: ${inTok} in / ${outTok} out · Drops (Metadata/OOV/fehlende Richtung): ${droppedTotal}\n` +
      `[prelabel] → ${outPath}\n` +
      `[prelabel] LEAKAGE-CAVEAT: gleiche Modell-Klasse labelt+wird getestet — im Report vermerken.\n` +
      `[prelabel] NEXT: npm run relations:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/relations-label.html`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[prelabel] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
