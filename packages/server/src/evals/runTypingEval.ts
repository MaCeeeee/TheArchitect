/**
 * runTypingEval — misst die Term-Typing-Qualität gegen ein frozen Typing-Golden
 * (THE-430 Slice 1, Phase 3). Klassifiziert jede Provision mit demselben
 * Instruct-Prompt wie der Prelabel-Schritt und vergleicht gegen die menschlich
 * adjudizierten Gold-Labels.
 *
 * Aufbau bewusst viergeteilt:
 *   - renderTypingReportMarkdown : rein (kein I/O) → testbar.
 *   - evaluateTyping             : Kern, `classify` INJIZIERT → mit Stub testbar,
 *                                  kein Live-LLM nötig.
 *   - main                       : Glue — echter Anthropic-Classifier (Reuse aus
 *                                  prelabel-typing) + C_score-Band (norm.service).
 *   - aggregateVotes/withSelfConsistency + renderThe597Section : rein, THE-597.
 *
 *   export ANTHROPIC_API_KEY=sk-...
 *   npm run typing:eval -- --golden src/evals/golden/typing.dsgvo.json [--samples <k> (ungerade empfohlen)]
 *
 * Freigabe-Schwellen je Suggest-Feature: docs/evals/typing-release-gates.md (AC-5).
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Muster runMappingEval (THE-380)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// Kein 'dotenv/config'-Import: sonst lädt jeder Test, der dieses Modul importiert, den echten Key. Geladen in main(), nach allen Modul-Seiteneffekten; Modul-Scope-Leser (logger: NODE_ENV) sehen die Shell-Umgebung, nicht .env — für die Eval-Ergebnisse irrelevant, alle relevanten Variablen werden lazy gelesen.
import { config as loadEnv } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import { loadTypingGolden, TYPING_AXES, type TypingGoldenSet, type TypingLabels, type TypingAxis } from './typingGolden';
import { buildTypingReport, type TypingEvalCase, type TypingReport, axisCalibrationSamples } from './typingMetrics';
import { aurocFromSamples, thresholdRoutingStats, type RoutingStat } from './metrics';
import type { ComplexityBand } from '../norms/complexityScore';
import { complexityForNorm } from '../norms/normComplexity.reader';
import { listNorms } from '../services/norm.service';
import { lawSourceFromRegulationKey } from '@thearchitect/shared';
import { buildPrelabelUserPrompt, parsePrelabelLabels, PRELABEL_SYSTEM } from '../scripts/prelabel-typing';
/**
 * THE-691: Achsen, die den RECHTSAKT beschreiben, nicht die Bestimmung.
 * Sie bleiben im Report sichtbar, sind aber als ererbt markiert und gehören
 * in keine Genauigkeits-Aggregation über Achsen.
 */
const AKT_METADATEN_ACHSEN = new Set<string>(['bindingness', 'normKind']);


const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 400;

export interface Classification {
  labels: TypingLabels;
  confidence?: Partial<Record<TypingAxis, number>>;
  /** THE-668: Beobachtung aus dem Freitext-Kanal — keine Achse, nur gezählt. */
  partyRoleObserved?: string;
}
export type Classify = (c: TypingGoldenSet['cases'][number]) => Promise<Classification>;

// ─── Kern (classify injiziert → testbar ohne LLM) ───────────────

export async function evaluateTyping(args: {
  golden: TypingGoldenSet;
  classify: Classify;
  bandOf?: (c: TypingGoldenSet['cases'][number]) => ComplexityBand | undefined;
  /** THE-683: additiver Beobachter je Fall — für Subset-Auswertungen (mit/ohne Zweck). */
  collect?: (ec: TypingEvalCase) => void;
}): Promise<TypingReport> {
  const evalCases: TypingEvalCase[] = [];
  for (const c of args.golden.cases) {
    const { labels, confidence, partyRoleObserved } = await args.classify(c);
    const ec: TypingEvalCase = {
      caseId: c.caseId,
      source: c.source,
      language: c.language,
      complexityBand: args.bandOf?.(c),
      gold: c.labels,
      predicted: labels,
      confidence,
      partyRoleObserved,
    };
    args.collect?.(ec);
    evalCases.push(ec);
  }
  return buildTypingReport(evalCases);
}

// ─── THE-597: Self-Consistency als retrospektive Konfidenz ──────
//
// Die Typisierung trägt heute keine Confidence (tp-4 fragt nur nach ids).
// Für das retrospektive Gate wird sie erzeugt, ohne den Prompt zu ändern:
// k Läufe je Fall, Mehrheit je Achse, Konfidenz = Stimmenanteil. Das ist
// verwandt mit `selfConsistency` in escalation.service.ts (Anteil
// übereinstimmender Läufe) — dort Präsenz je Element, hier Mehrheitsanteil
// je Achse; anders als dort gibt es keine getrennte Generator-Confidence,
// der Stimmenanteil IST die Konfidenz. Rein und ohne LLM testbar.

/**
 * Tie-Break: `null` (Enthaltung) vor jeder id, dann String aufsteigend — ''
 * sortiert vor allem. Bei Gleichstand lieber keine Aussage als eine
 * halbsichere Rolle.
 */
const tieRank = (key: string | null): string => (key === null ? '' : key);
/** Byte-Reihenfolge statt localeCompare: ids tragen `_` und `-`, ICU-Kollation ist maschinenabhängig. */
const byteCompare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Mehrheit je Achse.
 *
 * `undefined` = keine Stimme; `null` = Stimme „nicht anwendbar". Bleibt eine
 * Achse in allen Läufen offen, bleibt sie offen (kein Label, keine Konfidenz).
 *
 * Konfidenz = Stimmen des Gewinners / k über ALLE Läufe — offene Läufe
 * drücken sie: Schweigen ist Unsicherheit. Deshalb sind `[a,a,b,b]` und
 * `[a,a,offen,offen]` beide 0,5 — gewollt, weil beides ein Routing-Fall ist.
 *
 * Tie-Break: Enthaltung (`null`) vor jeder id, sonst Byte-Reihenfolge (siehe
 * `tieRank`).
 *
 * Eine vom inneren Classifier gesetzte `confidence` wird verworfen.
 *
 * k sollte ungerade gewählt werden, damit auf einer Achse kein 2:2-Tie
 * entsteht.
 */
export function aggregateVotes(runs: Classification[]): Classification {
  const labels: TypingLabels = {};
  const confidence: Partial<Record<TypingAxis, number>> = {};
  const k = runs.length;
  if (k === 0) return { labels };
  for (const axis of TYPING_AXES) {
    const counts = new Map<string | null, number>();
    for (const r of runs) {
      const v = r.labels[axis];
      if (v === undefined) continue; // offen = keine Stimme
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (counts.size === 0) continue; // in allen Läufen offen → bleibt offen
    const [winner, votes] = [...counts.entries()].sort(([ka, na], [kb, nb]) => nb - na || byteCompare(tieRank(ka), tieRank(kb)))[0];
    labels[axis] = winner;
    confidence[axis] = votes / k;
  }
  const observed = new Map<string, number>();
  for (const r of runs) if (r.partyRoleObserved) observed.set(r.partyRoleObserved, (observed.get(r.partyRoleObserved) ?? 0) + 1);
  const topEntry = [...observed.entries()].sort(([ka, na], [kb, nb]) => nb - na || byteCompare(ka, kb))[0];
  const topObserved = topEntry?.[0];
  const topCount = topEntry?.[1] ?? 0;
  return { labels, confidence, ...(topCount > k / 2 ? { partyRoleObserved: topObserved } : {}) };
}

/** k Läufe des inneren Classifiers je Fall, sequenziell (Rate-Limits), aggregiert. k < 2 = unverändert. */
export function withSelfConsistency(inner: Classify, k: number): Classify {
  if (k < 2) return inner;
  return async (c) => {
    const runs: Classification[] = [];
    for (let i = 0; i < k; i++) runs.push(await inner(c));
    return aggregateVotes(runs);
  };
}

// ─── Markdown-Report (rein) ─────────────────────────────────────

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function accRow(label: string, a: { labeled: number; correct: number; accuracy: number }): string {
  return `| ${label} | ${a.correct}/${a.labeled} | ${a.labeled ? pct(a.accuracy) : '—'} |`;
}

export function renderTypingReportMarkdown(report: TypingReport, meta: { golden: string; model?: string; samples?: number } = { golden: '' }): string {
  const lines: string[] = [];
  lines.push(`# Typing-Eval Report`);
  lines.push('');
  lines.push(`- Golden: \`${meta.golden}\` · Cases: **${report.total}**${meta.model ? ` · Modell: \`${meta.model}\`` : ''}`);
  lines.push(`- ⚠ Leakage-Caveat: wurde das Golden LLM-vorgelabelt, labelt dieselbe Modell-Klasse, die hier getestet wird.`);
  lines.push('');
  // THE-668: die AC-5-Messung des Beobachtungskanals — immer ausgewiesen,
  // damit 0 als „gemessen still" lesbar ist und nicht als „nicht erhoben".
  const o = report.observed;
  lines.push(`## Beobachtungskanal (partyRoleObserved)`);
  lines.push('');
  lines.push(`- Beobachtungen gesamt: **${o.total}** von ${report.total} Fällen`);
  lines.push(`- davon wo das Gold KEINE Rolle kennt (gewollt): **${o.whereGoldNa}**`);
  lines.push(`- davon wo das Gold eine Rolle kennt (Rauschen): **${o.whereGoldHasRole}**`);
  if (meta.samples && meta.samples > 1) {
    lines.push(`- ⚠️ k=${meta.samples}: Beobachtung nur gezählt, wenn sie in der strikten Mehrheit der Läufe fiel — nicht vergleichbar mit einem k=1-Report.`);
  }
  lines.push('');
  for (const axis of TYPING_AXES) {
    const a = report.axes[axis];
    lines.push(`## ${axis}`);
    lines.push('');
    // THE-691 (entschieden 19.08.2026): bindingness/normKind sind Akt-Metadaten
    // — am EU-Korpus praktisch konstant (0,014/0,224 Bit). Ihre "Accuracy" misst
    // die Mehrheitsrate, keine Klassifikator-Leistung, und darf in keiner
    // Gesamtbewertung mitzählen.
    if (AKT_METADATEN_ACHSEN.has(axis)) {
      lines.push('> ⚠️ **Akt-Metadatum (THE-691)** — ererbt vom Rechtsakt, zählt nicht als Klassifikator-Leistung.');
      lines.push('');
    }
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

// ─── THE-597: Report-Abschnitt (rein) ───────────────────────────

export interface The597AxisResult {
  samples: number;
  wrong: number;
  auroc: number | null;
  routing: RoutingStat[];
  aktMetadatum: boolean;
}
export interface The597Json {
  k: number;
  goldenSha256: string;
  thresholds: number[];
  axes: Record<TypingAxis, The597AxisResult>;
}

export function renderThe597Section(
  cases: TypingEvalCase[],
  k: number,
  goldenSha256: string,
  thresholds: number[] = [0.6, 0.8, 1.0]
): { markdown: string; json: The597Json } {
  const axes = {} as The597Json['axes'];
  const lines: string[] = [];
  lines.push(`## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=${k})`);
  lines.push('');
  lines.push('Konfidenz = Stimmenanteil der Mehrheit über k Läufe. Routing: confidence < Schwelle ⇒ Mensch.');
  lines.push('Recall = geroutete falsche / alle falschen · Fehlalarm = geroutete richtige / alle richtigen.');
  lines.push('Instrument-Kontrolle: AUROC > 0,6 auf mindestens einer Inhalts-Achse, sonst „nicht messbar".');
  lines.push(`Golden-Hash: \`${goldenSha256}\``);
  lines.push('');
  const row = (cells: Array<string | number>): string => `| ${cells.join(' | ')} |`;
  const head = ['Achse', 'Samples', 'falsche', 'AUROC', ...thresholds.map((t) => `Recall <${t.toFixed(1)}`), ...thresholds.map((t) => `Fehlalarm <${t.toFixed(1)}`)];
  lines.push(row(head));
  lines.push('|' + '---|'.repeat(head.length));
  for (const axis of TYPING_AXES) {
    const samples = axisCalibrationSamples(cases, axis);
    const routing = thresholdRoutingStats(samples, thresholds);
    const auroc = aurocFromSamples(samples);
    const aktMetadatum = AKT_METADATEN_ACHSEN.has(axis);
    axes[axis] = { samples: samples.length, wrong: samples.filter((s) => !s.correct).length, auroc, routing, aktMetadatum };
    const name = aktMetadatum ? `${axis} ⚠️` : axis;
    lines.push(row([name, samples.length, axes[axis].wrong, auroc === null ? '—' : auroc.toFixed(3), ...routing.map((r) => (r.wrong ? pct(r.recall) : '—')), ...routing.map((r) => (r.correct ? pct(r.falseAlarmRate) : '—'))]));
  }
  lines.push('');
  lines.push('_⚠️ = Akt-Metadatum (THE-691), zählt nicht als Klassifikator-Leistung._');
  lines.push('');
  return { markdown: lines.join('\n'), json: { k, goldenSha256, thresholds, axes } };
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

/**
 * Echter Classifier: derselbe Instruct-Prompt wie der Prelabel-Schritt.
 * THE-683: optionaler Zweck-Kontext je Quelle (Experiment-Arm) + OOV-Zähler
 * (AC-4 — die OntoLearner-Warnung wird gemessen, nicht gehofft).
 */
function anthropicClassify(
  client: Anthropic,
  model: string,
  opts?: {
    purposeBySource?: Map<string, { recitals: Array<{ number: number; text: string }> }>;
    oovDrops?: Map<string, number>;
  }
): Classify {
  return async (c) => {
    const purpose = opts?.purposeBySource?.get(c.source);
    const res = await client.messages.create({
      model,
      system: PRELABEL_SYSTEM,
      messages: [{ role: 'user', content: buildPrelabelUserPrompt(c, undefined, purpose) }],
      max_tokens: MAX_TOKENS,
    });
    const block = res.content.find((b) => b.type === 'text');
    const text = block && block.type === 'text' ? block.text : '';
    const parsed = parsePrelabelLabels(text);
    if (opts?.oovDrops) {
      for (const axis of parsed.dropped) {
        opts.oovDrops.set(axis, (opts.oovDrops.get(axis) ?? 0) + 1);
      }
    }
    return { labels: parsed.labels, partyRoleObserved: parsed.partyRoleObserved };
  };
}

/** AC-5 (THE-683): Was erreicht ein sturer „immer häufigste Klasse"-Rater? */
function majorityBaseline(cases: TypingEvalCase[]): Record<string, { klass: string; accuracy: number }> {
  const axes = ['normKind', 'bindingness', 'obligationKind', 'partyRole', 'provisionKind'] as const;
  const out: Record<string, { klass: string; accuracy: number }> = {};
  for (const axis of axes) {
    const counts = new Map<string, number>();
    for (const c of cases) {
      const g = (c.gold as Record<string, string | null | undefined>)[axis] ?? 'na';
      counts.set(String(g), (counts.get(String(g)) ?? 0) + 1);
    }
    const [klass, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['na', 0];
    out[axis] = { klass, accuracy: cases.length ? n / cases.length : 0 };
  }
  return out;
}

async function main(): Promise<void> {
  // .env erst hier laden — Begründung am Import oben.
  loadEnv();
  const argv = process.argv.slice(2);
  const gi = argv.indexOf('--golden');
  const goldenPath = gi !== -1 ? argv[gi + 1] : undefined;
  if (!goldenPath) {
    console.error('Usage: typing:eval --golden <typing-golden.json> [--purpose <purpose-context.json>] [--samples <k> (odd k recommended)]');
    process.exitCode = 2;
    return;
  }
  const golden = loadTypingGolden(path.resolve(goldenPath));
  if (!golden.frozen) {
    console.error('[typing-eval] WARN: Golden ist NICHT frozen — kein verbindlicher Baseline-Report (THE-430 AC-1).');
  }

  // THE-683: --purpose lädt den EINGEFRORENEN Zweck-Kontext (Option b) je Quelle.
  const pi = argv.indexOf('--purpose');
  const purposePath = pi !== -1 ? argv[pi + 1] : undefined;
  let purposeBySource: Map<string, { recitals: Array<{ number: number; text: string }> }> | undefined;
  if (purposePath) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(purposePath), 'utf8')) as {
      perSource: Record<string, Array<{ number: number; text: string }>>;
    };
    purposeBySource = new Map(
      Object.entries(raw.perSource).map(([src, recitals]) => [src, { recitals }])
    );
  }

  // THE-597: k Läufe je Fall → Self-Consistency-Konfidenz (Default 1 = unverändert).
  // Streng prüfen: ein stilles k=1 nach `--samples abc` hätte den vollen Lauf bezahlt
  // und keinen THE-597-Abschnitt geliefert.
  // `--samples=5` wäre ein einzelnes argv-Token: nicht erkannt, stiller k=1-Lauf zum vollen Preis.
  const eqForm = argv.find((a) => a.startsWith('--samples='));
  if (eqForm) {
    console.error(`[typing-eval] --samples erwartet Leerzeichen-Syntax: --samples <k> (bekam "${eqForm}").`);
    process.exitCode = 2;
    return;
  }
  const si = argv.indexOf('--samples');
  const rawSamples = si !== -1 ? argv[si + 1] : undefined;
  if (si !== -1 && !/^[1-9]\d*$/.test(rawSamples ?? '')) {
    console.error(`[typing-eval] --samples erwartet eine positive ganze Zahl, bekam "${rawSamples ?? ''}".`);
    process.exitCode = 2;
    return;
  }
  const samples = rawSamples ? parseInt(rawSamples, 10) : 1;

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const bandOf = await bandBySource(process.env.TA_PROJECT);
  const oovDrops = new Map<string, number>();
  const collected: TypingEvalCase[] = [];
  console.log(`[typing-eval] k=${samples} · ${golden.cases.length} Fälle → ${samples * golden.cases.length} LLM-Aufrufe`);
  const report = await evaluateTyping({
    golden,
    classify: withSelfConsistency(anthropicClassify(getClient(), model, { purposeBySource, oovDrops }), samples),
    bandOf,
    collect: (ec) => collected.push(ec),
  });

  const variante = purposeBySource ? 'tp-4+purpose.v1' : 'tp-4';
  let md = renderTypingReportMarkdown(report, { golden: path.basename(goldenPath), model, samples });
  md += `\n\n## THE-683 — Experiment-Anhang (${variante})\n\n`;
  md += `OOV-Drops je Achse (AC-4${samples > 1 ? `, je Lauf, k=${samples}` : ''}): ${
    oovDrops.size === 0 ? 'keine' : [...oovDrops.entries()].map(([a, n]) => `${a}=${n}`).join(' · ')
  }\n\n`;
  const maj = majorityBaseline(collected);
  md += `Trivial-Messlatte (AC-5 — „immer häufigste Klasse"):\n\n| Achse | Klasse | Accuracy |\n|---|---|---|\n`;
  for (const [axis, m] of Object.entries(maj)) {
    md += `| ${axis} | ${m.klass} | ${(m.accuracy * 100).toFixed(1)}% |\n`;
  }
  if (purposeBySource) {
    const mit = collected.filter((c) => (purposeBySource!.get(c.source)?.recitals.length ?? 0) > 0);
    const ohne = collected.filter((c) => (purposeBySource!.get(c.source)?.recitals.length ?? 0) === 0);
    md += `\nSubsets (AC-6): mit Zweck-Kontext ${mit.length} Fälle · ohne ${ohne.length} (${[...new Set(ohne.map((c) => c.source))].join(', ') || '—'})\n\n`;
    for (const [name, subset] of [
      ['mit Zweck', mit],
      ['ohne Zweck', ohne],
    ] as const) {
      if (subset.length === 0) continue;
      const sub = buildTypingReport(subset);
      md += `### Subset ${name} (${subset.length} Fälle)\n\n| Achse | Accuracy | macro-F1 |\n|---|---|---|\n`;
      for (const [axis, ax] of Object.entries(sub.axes)) {
        const mark = AKT_METADATEN_ACHSEN.has(axis) ? ' ⚠️ Akt-Metadatum' : '';
        md += `| ${axis}${mark} | ${pct(ax.accuracy.accuracy)} | ${ax.confusion.macroF1.toFixed(3)} |\n`;
      }
      md += '\n';
    }
  }

  let the597: The597Json | undefined;
  if (samples > 1) {
    const goldenSha256 = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(goldenPath))).digest('hex');
    const sec = renderThe597Section(collected, samples, goldenSha256);
    md += `\n${sec.markdown}`;
    the597 = sec.json;
  }

  const outDir = path.join(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `typing-${golden.version}${purposeBySource ? '-purpose' : ''}${samples > 1 ? `-sc${samples}` : ''}`);
  const cases = collected.map(({ caseId, source, gold, predicted, confidence }) => ({ caseId, source, gold, predicted, confidence }));
  fs.writeFileSync(`${base}.json`, JSON.stringify({ variante, model, samples, report, oovDrops: Object.fromEntries(oovDrops), majority: maj, the597, cases }, null, 2) + '\n');
  fs.writeFileSync(`${base}.md`, md);
  console.log(`[typing-eval] Report (${variante}) → ${base}.md / .json`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[typing-eval] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
