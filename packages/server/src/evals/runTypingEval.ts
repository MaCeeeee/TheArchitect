/**
 * runTypingEval — misst die Term-Typing-Qualität gegen ein frozen Typing-Golden
 * (THE-430 Slice 1, Phase 3). Klassifiziert jede Provision mit demselben
 * Instruct-Prompt wie der Prelabel-Schritt und vergleicht gegen die menschlich
 * adjudizierten Gold-Labels.
 *
 * Aufbau bewusst dreigeteilt:
 *   - renderTypingReportMarkdown : rein (kein I/O) → testbar.
 *   - evaluateTyping             : Kern, `classify` INJIZIERT → mit Stub testbar,
 *                                  kein Live-LLM nötig.
 *   - main                       : Glue — echter Anthropic-Classifier (Reuse aus
 *                                  prelabel-typing) + C_score-Band (norm.service).
 *
 *   export ANTHROPIC_API_KEY=sk-...
 *   npm run typing:eval -- --golden src/evals/golden/typing.dsgvo.json
 *
 * Freigabe-Schwellen je Suggest-Feature: docs/evals/typing-release-gates.md (AC-5).
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Muster runMappingEval (THE-380)
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { loadTypingGolden, TYPING_AXES, type TypingGoldenSet, type TypingLabels, type TypingAxis } from './typingGolden';
import { buildTypingReport, type TypingEvalCase, type TypingReport } from './typingMetrics';
import type { ComplexityBand } from '../norms/complexityScore';
import { complexityForNorm } from '../norms/normComplexity.reader';
import { listNorms } from '../services/norm.service';
import { lawSourceFromRegulationKey } from '@thearchitect/shared';
import { buildPrelabelUserPrompt, parsePrelabelLabels, PRELABEL_SYSTEM } from '../scripts/prelabel-typing';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;

export interface Classification {
  labels: TypingLabels;
  confidence?: Partial<Record<TypingAxis, number>>;
}
export type Classify = (c: TypingGoldenSet['cases'][number]) => Promise<Classification>;

// ─── Kern (classify injiziert → testbar ohne LLM) ───────────────

export async function evaluateTyping(args: {
  golden: TypingGoldenSet;
  classify: Classify;
  bandOf?: (c: TypingGoldenSet['cases'][number]) => ComplexityBand | undefined;
}): Promise<TypingReport> {
  const evalCases: TypingEvalCase[] = [];
  for (const c of args.golden.cases) {
    const { labels, confidence } = await args.classify(c);
    evalCases.push({
      caseId: c.caseId,
      source: c.source,
      language: c.language,
      complexityBand: args.bandOf?.(c),
      gold: c.labels,
      predicted: labels,
      confidence,
    });
  }
  return buildTypingReport(evalCases);
}

// ─── Markdown-Report (rein) ─────────────────────────────────────

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function accRow(label: string, a: { labeled: number; correct: number; accuracy: number }): string {
  return `| ${label} | ${a.correct}/${a.labeled} | ${a.labeled ? pct(a.accuracy) : '—'} |`;
}

export function renderTypingReportMarkdown(report: TypingReport, meta: { golden: string; model?: string } = { golden: '' }): string {
  const lines: string[] = [];
  lines.push(`# Typing-Eval Report`);
  lines.push('');
  lines.push(`- Golden: \`${meta.golden}\` · Cases: **${report.total}**${meta.model ? ` · Modell: \`${meta.model}\`` : ''}`);
  lines.push(`- ⚠ Leakage-Caveat: wurde das Golden LLM-vorgelabelt, labelt dieselbe Modell-Klasse, die hier getestet wird.`);
  lines.push('');
  for (const axis of TYPING_AXES) {
    const a = report.axes[axis];
    lines.push(`## ${axis}`);
    lines.push('');
    lines.push(`Accuracy: **${a.accuracy.labeled ? pct(a.accuracy.accuracy) : '—'}** (${a.accuracy.correct}/${a.accuracy.labeled}) · macro-F1: **${a.accuracy.labeled ? a.confusion.macroF1.toFixed(3) : '—'}**${a.calibration ? ` · ECE: ${a.calibration.ece.toFixed(3)}` : ''}`);
    lines.push('');
    if (!a.accuracy.labeled) {
      lines.push('_keine gelabelten Gold-Achsen_');
      lines.push('');
      continue;
    }
    lines.push('| Breakdown | correct/labeled | accuracy |');
    lines.push('| --- | --- | --- |');
    for (const [k, v] of Object.entries(a.byLanguage)) lines.push(accRow(`lang: ${k}`, v));
    for (const [k, v] of Object.entries(a.bySource)) lines.push(accRow(`source: ${k}`, v));
    for (const [k, v] of Object.entries(a.byComplexityBand)) lines.push(accRow(`C_score: ${k}`, v));
    lines.push('');
    lines.push('| Klasse | P | R | F1 | support |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const c of a.confusion.classes) {
      lines.push(`| ${c.cls} | ${c.precision.toFixed(2)} | ${c.recall.toFixed(2)} | ${c.f1.toFixed(2)} | ${c.support} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ─── Glue ───────────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY ist nicht gesetzt.');
  return new Anthropic({ apiKey });
}

/**
 * Best-effort C_score-Band je Golden-Source (THE-431 AC-3 / THE-430 AC-2).
 * Lädt die Normen des Projekts via norm.service-Facade, rechnet C_score über den
 * Section-Baum und mappt law-source → Band. Defensiv: ohne TA_PROJECT oder bei
 * Lookup-Fehler bleibt das Band undefined (Breakdown lässt die Achse dann aus).
 */
async function bandBySource(projectId: string | undefined): Promise<(c: TypingGoldenSet['cases'][number]) => ComplexityBand | undefined> {
  if (!projectId) return () => undefined;
  const map = new Map<string, ComplexityBand>();
  try {
    for (const norm of await listNorms(projectId)) {
      const src = norm.corpusRef ? lawSourceFromRegulationKey(norm.corpusRef.regulationKey) : undefined;
      if (src) map.set(src, complexityForNorm(norm).band);
    }
  } catch (err) {
    console.error(`[typing-eval] WARN: C_score-Band-Lookup fehlgeschlagen (${(err as Error).message}) — Bänder bleiben leer.`);
  }
  return (c) => map.get(c.source);
}

/** Echter Classifier: derselbe Instruct-Prompt wie der Prelabel-Schritt. */
function anthropicClassify(client: Anthropic, model: string): Classify {
  return async (c) => {
    const res = await client.messages.create({
      model,
      system: PRELABEL_SYSTEM,
      messages: [{ role: 'user', content: buildPrelabelUserPrompt(c) }],
      max_tokens: MAX_TOKENS,
    });
    const block = res.content.find((b) => b.type === 'text');
    const text = block && block.type === 'text' ? block.text : '';
    return { labels: parsePrelabelLabels(text).labels };
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--golden');
  const goldenPath = gi !== -1 ? argv[gi + 1] : undefined;
  if (!goldenPath) {
    console.error('Usage: typing:eval --golden <typing-golden.json>');
    process.exitCode = 2;
    return;
  }
  const golden = loadTypingGolden(path.resolve(goldenPath));
  if (!golden.frozen) {
    console.error('[typing-eval] WARN: Golden ist NICHT frozen — kein verbindlicher Baseline-Report (THE-430 AC-1).');
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const bandOf = await bandBySource(process.env.TA_PROJECT);
  const report = await evaluateTyping({ golden, classify: anthropicClassify(getClient(), model), bandOf });

  const md = renderTypingReportMarkdown(report, { golden: path.basename(goldenPath), model });
  const outDir = path.join(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `typing-${golden.version}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(`${base}.md`, md);
  console.log(`[typing-eval] Report → ${base}.md / .json`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[typing-eval] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
