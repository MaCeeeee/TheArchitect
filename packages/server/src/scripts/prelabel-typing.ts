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
 * Instruct-Default (nicht Thinking): Paper §5 — Instruct schlägt Thinking bei
 * Term Typing durchgängig (Output-Disziplin > Reasoning).
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Modell-Muster: complianceMapping.service
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {
  NORM_ONTOLOGY,
  isNormKind,
  isObligationKind,
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

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;

// ─── Membership pro Achse (O(1), E6 als einzige Quelle) ─────────
const BINDINGNESS_SET = new Set<string>(BINDINGNESS_IDS);
const PARTY_ROLE_SET = new Set<string>(PARTY_ROLE_IDS);

const AXIS_VALIDATOR: Record<TypingAxis, (v: string) => boolean> = {
  normKind: isNormKind,
  bindingness: (v) => BINDINGNESS_SET.has(v),
  obligationKind: isObligationKind,
  partyRole: (v) => PARTY_ROLE_SET.has(v),
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

/** Baut den User-Prompt mit den geschlossenen E6-Listen + der Provision. Rein. */
export function buildPrelabelUserPrompt(
  provision: Pick<TypingGoldenCase, 'source' | 'paragraphNumber' | 'title' | 'fullText' | 'language'>,
  ontology = NORM_ONTOLOGY
): string {
  return [
    'Classify this provision on four axes. Choose ONE id per axis from its list, or "na".',
    '',
    `normKind: ${axisList(ontology.normKinds)}`,
    `bindingness: ${axisList(ontology.bindingness)}`,
    `obligationKind: ${axisList(ontology.obligationKinds)}`,
    `partyRole: ${axisList(ontology.partyRoles)}`,
    '',
    `Provision [${provision.source} ${provision.paragraphNumber}${provision.title ? ' — ' + provision.title : ''}] (${provision.language}):`,
    provision.fullText,
    '',
    'Respond with exactly: {"normKind": "...", "bindingness": "...", "obligationKind": "...", "partyRole": "..."}',
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
    console.error('Usage: typing:prelabel --in <draft.json> [--out <out.json>]');
    process.exitCode = 2;
    return;
  }
  const outPath = path.resolve(arg('--out') ?? inPath.replace(/\.json$/, '.prelabeled.json'));
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const draft = TypingGoldenSetSchema.parse(JSON.parse(fs.readFileSync(path.resolve(inPath), 'utf8')));
  const client = getClient();

  let inTok = 0;
  let outTok = 0;
  let droppedTotal = 0;
  const cases: TypingGoldenCase[] = [];
  for (const [i, c] of draft.cases.entries()) {
    const userMessage = buildPrelabelUserPrompt(c);
    const res = await client.messages.create({
      model,
      system: PRELABEL_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: MAX_TOKENS,
    });
    const block = res.content.find((b) => b.type === 'text');
    const text = block && block.type === 'text' ? block.text : '';
    const { labels, dropped } = parsePrelabelLabels(text);
    droppedTotal += dropped.length;
    const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    inTok += usage?.input_tokens ?? 0;
    outTok += usage?.output_tokens ?? 0;
    cases.push({ ...c, labels, annotator: `llm-prelabel:${model}` });
    process.stdout.write(`\r[prelabel] ${i + 1}/${draft.cases.length}`);
  }

  const out = { ...draft, version: draft.version, frozen: false as const, cases };
  TypingGoldenSetSchema.parse(out);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  console.log(
    `\n[prelabel] ${cases.length} Provisions vorgelabelt (${model})\n` +
      `[prelabel] Tokens: ${inTok} in / ${outTok} out · OOV-Drops: ${droppedTotal}\n` +
      `[prelabel] → ${outPath}\n` +
      `[prelabel] LEAKAGE-CAVEAT: gleiche Modell-Klasse labelt+wird getestet — im Report vermerken.\n` +
      `[prelabel] NEXT: npm run typing:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/typing-label.html`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n[prelabel] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
