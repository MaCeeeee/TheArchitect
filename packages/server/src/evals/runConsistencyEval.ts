/**
 * Konsistenz-Eval Runner — label-freie Fehler-Untergrenze für das Mapping.
 *
 *   npm run eval:consistency                     # View-Paare (DE/EN) + Shuffle-Modus
 *   npm run eval:consistency -- --offline        # nur Cache (deterministisch)
 *   npm run eval:consistency -- --no-shuffle     # nur explizite View-Paare
 *   npm run eval:consistency -- --pairs <path>   # anderes Paar-Set
 *
 * Zwei Modi (Stereogramm-Prinzip: zwei Ansichten, ein Inhalt):
 *   1. language:        DE- vs. EN-Fassung desselben Paragraphen (EUR-Lex ist
 *                       mehrsprachig) — Abweichung = garantierter Fehler in
 *                       mindestens einer Antwort, ohne ein einziges Label.
 *   2. candidate-order: gleicher Text, deterministisch umsortierte Kandidaten-
 *                       liste — Abweichung = Positions-Bias.
 *
 * Abweichende Fälle werden als Active-Learning-Kandidaten fürs Golden-Set
 * (THE-379) ausgewiesen: diese zuerst von Hand labeln.
 *
 * Linear: THE-380 (REQ-EVAL-001.2) · Ergänzung aus SSL-Review (UC-EVAL-001)
 */
import fs from 'node:fs';
import path from 'node:path';
import { mapTextToElements } from '../services/complianceMapping.service';
import { SYSTEM_PROMPT } from '../prompts/complianceMapping.prompt';
import { sha256, cacheKeyFor, readCache, writeCache } from './predictionCache';
import { loadGoldenSet, toCandidateElements, DEFAULT_GOLDEN_PATH } from './goldenSet';
import {
  ConsistencySetSchema,
  pairOutcome,
  aggregateConsistency,
  seededShuffle,
  seedFromString,
  type ConsistencySet,
  type PairOutcome,
} from './consistency';
import type { CandidateElement } from '../services/complianceMapping.service';

const CACHE_DIR = path.join(__dirname, 'cache');
const REPORTS_DIR = path.join(__dirname, 'reports');
const DEFAULT_PAIRS_PATH = path.join(__dirname, 'golden', 'consistency-pairs.v1.json');

interface CliOptions {
  pairsPath: string;
  goldenPath: string;
  offline: boolean;
  shuffle: boolean;
  outDir: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    pairsPath: DEFAULT_PAIRS_PATH,
    goldenPath: DEFAULT_GOLDEN_PATH,
    offline: false,
    shuffle: true,
    outDir: REPORTS_DIR,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pairs' && argv[i + 1]) opts.pairsPath = path.resolve(argv[++i]);
    else if (argv[i] === '--golden' && argv[i + 1]) opts.goldenPath = path.resolve(argv[++i]);
    else if (argv[i] === '--offline') opts.offline = true;
    else if (argv[i] === '--no-shuffle') opts.shuffle = false;
    else if (argv[i] === '--out' && argv[i + 1]) opts.outDir = path.resolve(argv[++i]);
  }
  return opts;
}

function loadPairs(filePath: string): ConsistencySet | null {
  if (!fs.existsSync(filePath)) return null;
  const parsed = ConsistencySetSchema.safeParse(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `Consistency pairs failed schema validation: ${parsed.error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }
  return parsed.data;
}

async function predict(args: {
  bucket: string;
  cacheId: string;
  fullText: string;
  source: string;
  paragraphNumber: string;
  language: 'de' | 'en';
  jurisdiction: string;
  candidates: CandidateElement[];
  model: string;
  promptHash: string;
  offline: boolean;
}): Promise<{ ids: string[]; fromCache: boolean }> {
  const key = cacheKeyFor(args.fullText, args.candidates.map(c => c.id), args.model, args.promptHash);
  const cached = readCache(CACHE_DIR, args.bucket, args.cacheId, key);
  if (cached) return { ids: cached.predictions.map(p => p.elementId), fromCache: true };

  if (args.offline) {
    throw new Error(
      `--offline: no valid cache for "${args.cacheId}". Run once without --offline to populate.`
    );
  }

  const { candidates } = await mapTextToElements({
    text: args.fullText,
    source: args.source,
    paragraphNumber: args.paragraphNumber,
    language: args.language,
    jurisdiction: args.jurisdiction,
    candidateElements: args.candidates,
  });

  writeCache(CACHE_DIR, args.bucket, args.cacheId, {
    cacheKey: key,
    model: args.model,
    promptHash: args.promptHash,
    textHash: sha256(args.fullText),
    predictions: candidates,
    cachedAt: new Date().toISOString(),
  });
  return { ids: candidates.map(p => p.elementId), fromCache: false };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function buildMarkdown(outcomes: PairOutcome[], model: string, startedAt: string): string {
  const byMode = new Map<string, PairOutcome[]>();
  for (const o of outcomes) {
    const list = byMode.get(o.mode) ?? [];
    list.push(o);
    byMode.set(o.mode, list);
  }

  const lines: string[] = [];
  lines.push('# Konsistenz-Eval Report (label-frei, Zwei-Ansichten-Prinzip)');
  lines.push('');
  lines.push(`- Datum: ${startedAt} · Modell: \`${model}\``);
  lines.push('');
  lines.push('> Lesehilfe: Jede Abweichung zwischen zwei Ansichten desselben Inhalts ist ein');
  lines.push('> **garantierter Fehler in mindestens einer Antwort** — die Disagreement-Rate ist');
  lines.push('> damit eine Fehler-**Untergrenze**, ganz ohne Golden-Labels.');
  lines.push('');
  lines.push('## Zusammenfassung pro Modus');
  lines.push('');
  lines.push('| Modus | Paare | Ø Jaccard | Exakt gleich | Abweichungen |');
  lines.push('|---|---|---|---|---|');
  for (const [mode, list] of byMode) {
    const s = aggregateConsistency(list);
    lines.push(`| ${mode} | ${s.pairs} | ${s.meanJaccard.toFixed(3)} | ${pct(s.exactMatchRate)} | ${s.disagreements} |`);
  }
  const overall = aggregateConsistency(outcomes);
  lines.push(`| **gesamt** | ${overall.pairs} | ${overall.meanJaccard.toFixed(3)} | ${pct(overall.exactMatchRate)} | ${overall.disagreements} |`);
  lines.push('');
  const disagreeing = outcomes.filter(o => !o.exactMatch);
  lines.push('## Abweichende Fälle → zuerst labeln (Active-Learning-Kandidaten für THE-379)');
  lines.push('');
  if (disagreeing.length === 0) {
    lines.push('_Keine Abweichungen — alle View-Paare stimmen überein._');
  } else {
    for (const o of disagreeing) {
      lines.push(
        `- \`${o.caseId}\` [${o.mode}: ${o.viewALabel} vs ${o.viewBLabel}] — Jaccard ${o.jaccard.toFixed(2)} · nur ${o.viewALabel}: ${o.onlyA.join(', ') || '—'} · nur ${o.viewBLabel}: ${o.onlyB.join(', ') || '—'}`
      );
    }
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  const promptHash = sha256(SYSTEM_PROMPT);
  const startedAt = new Date().toISOString();
  const outcomes: PairOutcome[] = [];
  let live = 0;

  // Modus 1: explizite View-Paare (DE/EN)
  const pairs = loadPairs(opts.pairsPath);
  if (pairs) {
    console.log(`[consistency] pairs ${pairs.version}: ${pairs.cases.length} cases`);
    for (const c of pairs.cases) {
      const bucket = `consistency-${pairs.version}`;
      const candidates = c.candidates.map(el => ({
        id: el.id,
        name: el.name,
        type: el.type as CandidateElement['type'],
        layer: el.layer,
        description: el.description,
      }));
      const common = {
        bucket,
        source: c.source,
        paragraphNumber: c.paragraphNumber,
        jurisdiction: c.jurisdiction,
        candidates,
        model,
        promptHash,
        offline: opts.offline,
      };
      const a = await predict({ ...common, cacheId: `${c.caseId}--${c.viewA.label}`, fullText: c.viewA.fullText, language: c.viewA.language });
      const b = await predict({ ...common, cacheId: `${c.caseId}--${c.viewB.label}`, fullText: c.viewB.fullText, language: c.viewB.language });
      if (!a.fromCache) live++;
      if (!b.fromCache) live++;
      outcomes.push(
        pairOutcome({
          caseId: c.caseId,
          source: c.source,
          mode: 'language',
          viewALabel: c.viewA.label,
          viewBLabel: c.viewB.label,
          predictedA: a.ids,
          predictedB: b.ids,
        })
      );
    }
  } else {
    console.log(`[consistency] no pairs file at ${opts.pairsPath} — skipping language mode`);
  }

  // Modus 2: Kandidaten-Reihenfolge (Positions-Bias) über das Golden-Set
  if (opts.shuffle) {
    const golden = loadGoldenSet(opts.goldenPath);
    console.log(`[consistency] shuffle mode over golden ${golden.version}: ${golden.cases.length} cases`);
    for (const c of golden.cases) {
      const bucket = `shuffle-${golden.version}`;
      const original = toCandidateElements(c);
      const shuffled = seededShuffle(original, seedFromString(c.caseId));
      const common = {
        bucket,
        fullText: c.fullText,
        source: c.source,
        paragraphNumber: c.paragraphNumber,
        language: c.language,
        jurisdiction: c.jurisdiction,
        model,
        promptHash,
        offline: opts.offline,
      };
      const a = await predict({ ...common, cacheId: `${c.caseId}--original`, candidates: original });
      const b = await predict({ ...common, cacheId: `${c.caseId}--shuffled`, candidates: shuffled });
      if (!a.fromCache) live++;
      if (!b.fromCache) live++;
      outcomes.push(
        pairOutcome({
          caseId: c.caseId,
          source: c.source,
          mode: 'candidate-order',
          viewALabel: 'original',
          viewBLabel: 'shuffled',
          predictedA: a.ids,
          predictedB: b.ids,
        })
      );
    }
  }

  if (outcomes.length === 0) {
    throw new Error('Nothing to evaluate: no pairs file found and --no-shuffle set.');
  }

  const markdown = buildMarkdown(outcomes, model, startedAt);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const base = path.join(opts.outDir, `consistency-eval-${stamp}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(
    `${base}.json`,
    JSON.stringify({ model, promptHash, startedAt, summary: aggregateConsistency(outcomes), outcomes }, null, 2)
  );

  console.log('\n' + markdown);
  console.log(`\n[consistency] ${live} live calls, ${outcomes.length * 2 - live} cache hits`);
  console.log(`[consistency] Report: ${base}.md / .json`);
}

main().catch(err => {
  console.error('[consistency] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
