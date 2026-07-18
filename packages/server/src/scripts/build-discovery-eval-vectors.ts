/**
 * UC-LAW-002 Slice-2b (THE-465) — one-shot precompute script.
 *
 * Embeds (a) every fixture-corpus paragraph's `text` and (b) each golden
 * case's `profileText` (baseline retrieval query) via the embedding sidecar,
 * writing the vectors back into the JSON files so `runDiscoveryEval.ts`
 * (Task 7) can run fully offline afterwards — no network call in CI/dev.
 * With `--hyde`, also generates a hypothetical-document text per case via
 * Anthropic (injectable client, Haiku by default) and embeds it, enabling
 * the offline baseline-vs-HyDE retrieval comparison (AC-8).
 *
 *   npm run eval:discovery:build                  # baseline vectors only (needs EMBEDDING_SIDECAR_URL)
 *   npm run eval:discovery:build -- --hyde         # + HyDE text/vector (needs ANTHROPIC_API_KEY)
 *   npm run eval:discovery:build -- --force        # re-embed everything, ignore existing vectors
 *
 * Idempotent by default: only fills gaps (missing `vector`/`baselineVector`/
 * `hydeVector`), so an interrupted run can simply be re-run. Meant to run
 * ONCE (Owner/Controller, with network access) — the resulting artifacts are
 * committed to the repo; this script is NOT part of the offline eval path.
 *
 * Linear: THE-465 (REQ-LAW-002.6)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import {
  loadFixtureCorpus,
  loadDiscoveryGoldenSet,
  DEFAULT_DISCOVERY_CORPUS_PATH,
  DEFAULT_DISCOVERY_GOLDEN_PATH,
  type FixtureCorpus,
  type DiscoveryGoldenSet,
} from '../evals/discoveryGolden';

export const EMBEDDING_DIM = 768;
export const DEFAULT_QUERIES_PATH = path.join(__dirname, '..', 'evals', 'golden', 'discovery.queries.v1.json');

export interface CaseQueryVectors {
  caseId: string;
  baselineVector?: number[];
  hydeText?: string;
  hydeVector?: number[];
}

export interface QueriesFile {
  version: string;
  queries: CaseQueryVectors[];
}

export class BuildVectorsError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'BuildVectorsError';
  }
}

export interface BuildDeps {
  embed: (text: string) => Promise<number[]>;
  generateHyde: (profileText: string) => Promise<string>;
}

function validateDim(vector: number[]): number[] {
  if (vector.length !== EMBEDDING_DIM) {
    throw new BuildVectorsError(`unexpected embedding dim ${vector.length}, expected ${EMBEDDING_DIM}`);
  }
  return vector;
}

async function defaultEmbed(text: string): Promise<number[]> {
  const url = process.env.EMBEDDING_SIDECAR_URL;
  if (!url) throw new BuildVectorsError('EMBEDDING_SIDECAR_URL is not configured');
  let res: Response;
  try {
    res = await fetch(`${url}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    throw new BuildVectorsError('embedding sidecar fetch failed', err);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new BuildVectorsError(`embedding sidecar ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { vector: number[]; dim: number };
  return validateDim(data.vector);
}

// HyDE-Prompt (Muster THE-434): das Modell schreibt den hypothetischen
// Pflichten-/Rechtstext, der auf die Architektur zutreffen würde — dessen
// Embedding wird als Query genutzt (Retrieval-Vergleichslauf, AC-8), NICHT
// im Prod-Pfad.
const HYDE_INSTRUCTION =
  'Schreibe den hypothetischen Pflichten-/Rechtstext (2-4 Sätze), der auf diese Architektur zutreffen würde. ' +
  'Antworte NUR mit dem Text selbst, ohne Einleitung oder Meta-Kommentar.';

function defaultGenerateHyde(model: string, client: Anthropic): (profileText: string) => Promise<string> {
  return async (profileText: string): Promise<string> => {
    const res = await client.messages.create({
      model,
      max_tokens: 400,
      messages: [{ role: 'user', content: `${HYDE_INSTRUCTION}\n\nArchitektur-Profil:\n${profileText}` }],
    });
    const block = res.content.find(b => b.type === 'text');
    const text = block && block.type === 'text' ? block.text.trim() : '';
    if (!text) throw new BuildVectorsError('HyDE generation returned empty text');
    return text;
  };
}

// ─── Pure Orchestrierung (kein direktes I/O — testbar mit gemocktem embed) ───

export interface EmbedCorpusResult {
  corpus: FixtureCorpus;
  embedded: number;
  skipped: number;
}

/** Embeddet fehlende (oder bei force=true ALLE) Fixture-§-Vektoren. */
export async function embedMissingParagraphs(
  corpus: FixtureCorpus,
  deps: Pick<BuildDeps, 'embed'>,
  force: boolean,
): Promise<EmbedCorpusResult> {
  let embedded = 0;
  let skipped = 0;
  const paragraphs = [];
  for (const p of corpus.paragraphs) {
    if (p.vector && !force) {
      skipped++;
      paragraphs.push(p);
      continue;
    }
    const vector = validateDim(await deps.embed(p.text));
    embedded++;
    paragraphs.push({ ...p, vector });
  }
  return { corpus: { ...corpus, paragraphs }, embedded, skipped };
}

export interface EmbedQueriesResult {
  queries: CaseQueryVectors[];
  embedded: number;
  skipped: number;
  hydeGenerated: number;
}

/**
 * Embeddet fehlende Baseline-Query-Vektoren (profileText je Case) und,
 * mit `hyde:true`, fehlende HyDE-Texte + deren Vektoren. `existing` erlaubt
 * inkrementelle Läufe (bereits vorhandene Einträge werden gemerged/erweitert,
 * nicht verworfen).
 */
export async function embedMissingQueries(
  golden: DiscoveryGoldenSet,
  existing: QueriesFile | null,
  deps: BuildDeps,
  opts: { hyde: boolean; force: boolean },
): Promise<EmbedQueriesResult> {
  const byCaseId = new Map((existing?.queries ?? []).map(q => [q.caseId, q]));
  const queries: CaseQueryVectors[] = [];
  let embedded = 0;
  let skipped = 0;
  let hydeGenerated = 0;

  for (const c of golden.cases) {
    const prev = byCaseId.get(c.caseId);
    let baselineVector = prev?.baselineVector;
    if (!baselineVector || opts.force) {
      baselineVector = validateDim(await deps.embed(c.profileText));
      embedded++;
    } else {
      skipped++;
    }

    let hydeText = prev?.hydeText;
    let hydeVector = prev?.hydeVector;
    if (opts.hyde) {
      if (!hydeText || opts.force) {
        hydeText = await deps.generateHyde(c.profileText);
        hydeGenerated++;
        hydeVector = validateDim(await deps.embed(hydeText));
      } else if (!hydeVector) {
        hydeVector = validateDim(await deps.embed(hydeText));
      }
    }

    queries.push({ caseId: c.caseId, baselineVector, ...(hydeText ? { hydeText } : {}), ...(hydeVector ? { hydeVector } : {}) });
  }

  return { queries, embedded, skipped, hydeGenerated };
}

// ─── I/O ──────────────────────────────────────────────────────────

export function readQueriesFile(filePath: string): QueriesFile | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as QueriesFile;
}

export function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ─── CLI ────────────────────────────────────────────────────────────

interface CliOptions {
  corpusPath: string;
  goldenPath: string;
  queriesPath: string;
  hyde: boolean;
  force: boolean;
  hydeModel: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    corpusPath: DEFAULT_DISCOVERY_CORPUS_PATH,
    goldenPath: DEFAULT_DISCOVERY_GOLDEN_PATH,
    queriesPath: DEFAULT_QUERIES_PATH,
    hyde: false,
    force: false,
    hydeModel: process.env.LAW_DISCOVERY_JUDGE_MODEL || 'claude-haiku-4-5-20251001',
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--corpus' && argv[i + 1]) opts.corpusPath = path.resolve(argv[++i]);
    else if (argv[i] === '--golden' && argv[i + 1]) opts.goldenPath = path.resolve(argv[++i]);
    else if (argv[i] === '--out' && argv[i + 1]) opts.queriesPath = path.resolve(argv[++i]);
    else if (argv[i] === '--hyde') opts.hyde = true;
    else if (argv[i] === '--force') opts.force = true;
    else if (argv[i] === '--hyde-model' && argv[i + 1]) opts.hydeModel = argv[++i];
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const corpus = loadFixtureCorpus(opts.corpusPath);
  const golden = loadDiscoveryGoldenSet(opts.goldenPath);

  console.log(`[build-discovery-eval-vectors] corpus=${corpus.paragraphs.length} paragraphs, golden=${golden.cases.length} cases, hyde=${opts.hyde}, force=${opts.force}`);

  const corpusResult = await embedMissingParagraphs(corpus, { embed: defaultEmbed }, opts.force);
  console.log(`[build-discovery-eval-vectors] paragraphs: embedded=${corpusResult.embedded} skipped=${corpusResult.skipped}`);
  writeJson(opts.corpusPath, corpusResult.corpus);

  let hydeClient: Anthropic | undefined;
  if (opts.hyde) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new BuildVectorsError('--hyde requires ANTHROPIC_API_KEY');
    hydeClient = new Anthropic({ apiKey });
  }
  const deps: BuildDeps = {
    embed: defaultEmbed,
    generateHyde: hydeClient ? defaultGenerateHyde(opts.hydeModel, hydeClient) : async () => {
      throw new BuildVectorsError('generateHyde called without --hyde');
    },
  };

  const existing = readQueriesFile(opts.queriesPath);
  const queriesResult = await embedMissingQueries(golden, existing, deps, { hyde: opts.hyde, force: opts.force });
  console.log(
    `[build-discovery-eval-vectors] queries: embedded=${queriesResult.embedded} skipped=${queriesResult.skipped} hydeGenerated=${queriesResult.hydeGenerated}`,
  );
  writeJson(opts.queriesPath, { version: golden.version, queries: queriesResult.queries });

  console.log('[build-discovery-eval-vectors] done — artifacts are ready for `npm run eval:discovery -- --offline`');
}

if (require.main === module) {
  main().catch(err => {
    console.error('[build-discovery-eval-vectors] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
