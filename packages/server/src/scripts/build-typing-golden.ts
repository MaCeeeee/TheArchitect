/**
 * build-typing-golden — baut aus den Projekt-Regulations einen Typing-Golden-
 * DRAFT (Labels leer bzw. LLM-vorgeschlagen), aus dem `typing:worksheet` die
 * HTML-Adjudikationsvorlage erzeugt.
 *
 * Workflow (User-Entscheidung 2026-07-12: LLM-vorlabeln → Mensch adjudiziert):
 *   1. build-typing-golden  → Draft (eine Provision = ein Case, Labels undefined)
 *   2. [optional] LLM-Prelabel füllt `labels` als VORSCHLAG (leakage dokumentiert)
 *   3. typing:worksheet     → HTML mit Dropdowns, auf Vorschlag vorbelegt
 *   4. Mensch adjudiziert, exportiert, Kappa ≥ 0.6 → `frozen: true`
 *
 *   export TA_API=http://localhost:3000/api TA_KEY=ta_... TA_PROJECT=6a3ff887...
 *   npm run typing:build -- --source dsgvo --out src/evals/golden/typing.draft.json
 *   npm run typing:build -- --source nis2  --out /tmp/typing-nis2.json
 *
 * Der Draft ist bewusst LLM-FREI (kein Kosten-/Modell-Entscheid hier); der
 * Prelabel-Schritt ist separat + flag-gated, damit dieser Build deterministisch
 * + testbar bleibt.
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Muster: build-self-golden.ts (THE-379)
 */
import fs from 'node:fs';
import path from 'node:path';
import { NORM_ONTOLOGY } from '@thearchitect/shared';
import { TypingGoldenSetSchema, type TypingGoldenCase } from '../evals/typingGolden';
import { mulberry32 } from '../evals/metrics';

// ─── Reine Transformation (ohne I/O — testbar) ──────────────────

interface ApiRegulation {
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: string;
  jurisdiction: string;
}

export function slugifyCaseId(source: string, paragraphNumber: string): string {
  return `${source}-${paragraphNumber}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface TypingDraft {
  version: string;
  frozen: false;
  ontologyVersion: string;
  rubricRef: string;
  cases: TypingGoldenCase[];
}

export interface BuildTypingDraftOptions {
  ontologyVersion?: string;
  version?: string;
  /** Ziel-Case-Zahl; weggelassen → altes Verhalten (alle eligiblen Provisions). */
  targetSize?: number;
  /** Seed für den deterministischen PRNG (mulberry32) hinter der Stratifikation. */
  seed?: number;
}

/**
 * Deterministische Stratifikation: Round-Robin über `source`, innerhalb einer
 * Quelle alternierend über die vorhandenen Sprachen — damit ein Quoten-Pull
 * nicht ein einzelnes Gesetz leerzieht, bevor andere überhaupt drankommen.
 * Reihenfolge von Quellen/Sprachen/Cases wird per Seed gemischt (Fisher-Yates),
 * also reproduzierbar bei gleichem (cases, seed) und unterschiedlich bei
 * unterschiedlichem Seed. Kann die Quote nicht gefüllt werden (zu wenig
 * Material), werden NIE Duplikate nachgefüllt — es wird einfach das gegeben.
 */
function stratifiedSelect(allCases: TypingGoldenCase[], targetSize: number, seed: number): TypingGoldenCase[] {
  if (allCases.length <= targetSize) return allCases;

  const rand = mulberry32(seed);
  const shuffle = <T>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  // source -> language -> cases (sortierte Keys vor dem Mischen: rand-Verbrauch
  // hängt so nur von den Daten ab, nie von Map-Iterationsreihenfolge).
  const bySource = new Map<string, Map<string, TypingGoldenCase[]>>();
  for (const c of allCases) {
    let langs = bySource.get(c.source);
    if (!langs) {
      langs = new Map();
      bySource.set(c.source, langs);
    }
    const list = langs.get(c.language) ?? [];
    list.push(c);
    langs.set(c.language, list);
  }

  const sources = shuffle([...bySource.keys()].sort());

  // Pro Quelle eine Warteschlange, die die Sprachen im Round-Robin alterniert.
  const queues = new Map<string, TypingGoldenCase[]>();
  for (const source of sources) {
    const langs = bySource.get(source)!;
    const langKeys = shuffle([...langs.keys()].sort());
    const shuffledByLang = new Map(langKeys.map((l) => [l, shuffle(langs.get(l)!)]));
    const queue: TypingGoldenCase[] = [];
    const idx = Object.fromEntries(langKeys.map((l) => [l, 0])) as Record<string, number>;
    let more = true;
    while (more) {
      more = false;
      for (const l of langKeys) {
        const list = shuffledByLang.get(l)!;
        if (idx[l] < list.length) {
          queue.push(list[idx[l]]);
          idx[l]++;
          more = true;
        }
      }
    }
    queues.set(source, queue);
  }

  // Round-Robin über Quellen bis targetSize erreicht oder alles erschöpft ist.
  const selected: TypingGoldenCase[] = [];
  const srcIdx = Object.fromEntries(sources.map((s) => [s, 0])) as Record<string, number>;
  let more = true;
  while (selected.length < targetSize && more) {
    more = false;
    for (const source of sources) {
      if (selected.length >= targetSize) break;
      const queue = queues.get(source)!;
      if (srcIdx[source] < queue.length) {
        selected.push(queue[srcIdx[source]]);
        srcIdx[source]++;
        more = true;
      }
    }
  }

  return selected;
}

/** Ein Case je Provision, `labels` LEER (undefined-Achsen) — der Labeler/Prelabel füllt. */
export function buildTypingDraft(
  regulations: ApiRegulation[],
  opts: BuildTypingDraftOptions = {}
): TypingDraft {
  const {
    ontologyVersion = NORM_ONTOLOGY.ontologyVersion,
    version = 'v1-draft',
    targetSize,
    seed = 42,
  } = opts;

  const seen = new Set<string>();
  const allCases: TypingGoldenCase[] = [];
  for (const r of regulations) {
    if (!r.fullText || r.fullText.length < 50) continue;
    let caseId = slugifyCaseId(r.source, r.paragraphNumber);
    while (seen.has(caseId)) caseId = `${caseId}-x`;
    seen.add(caseId);
    allCases.push({
      caseId,
      source: r.source,
      paragraphNumber: r.paragraphNumber,
      title: r.title,
      fullText: r.fullText,
      language: r.language === 'en' ? 'en' : 'de',
      jurisdiction: r.jurisdiction || 'EU',
      labels: {}, // alle Achsen offen — bewusst kein Default-Label
    });
  }

  const cases = targetSize === undefined ? allCases : stratifiedSelect(allCases, targetSize, seed);

  return { version, frozen: false, ontologyVersion, rubricRef: '../RUBRIC.md', cases };
}

// ─── API-Glue ───────────────────────────────────────────────────

function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outArg = argValue(argv, '--out');
  const sourceArg = argValue(argv, '--source');
  const sourcesArg = argValue(argv, '--sources');
  const targetSizeArg = argValue(argv, '--target-size');
  const seedArg = argValue(argv, '--seed');

  // --sources a,b,c stratifiziert über mehrere Gesetze; --source bleibt der
  // Ein-Gesetz-Kurzweg (Default 'dsgvo', unverändertes Verhalten).
  const sources = sourcesArg
    ? sourcesArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [sourceArg || 'dsgvo'];
  const targetSize = targetSizeArg !== undefined ? Number(targetSizeArg) : undefined;
  const seed = seedArg !== undefined ? Number(seedArg) : undefined;

  const outPath = path.resolve(
    outArg
      ? outArg
      : path.join(__dirname, '..', 'evals', 'golden', `typing.${sources.join('-')}.draft.json`)
  );

  const api = process.env.TA_API || 'http://localhost:3000/api';
  const key = process.env.TA_KEY;
  const projectId = process.env.TA_PROJECT;
  if (!key || !projectId) {
    console.error('TA_KEY und TA_PROJECT müssen gesetzt sein.');
    process.exitCode = 2;
    return;
  }
  const headers = { 'X-API-Key': key };

  const regulations: ApiRegulation[] = [];
  for (const source of sources) {
    const regRes = await fetch(`${api}/projects/${projectId}/regulations?source=${source}&limit=300`, { headers });
    if (!regRes.ok) throw new Error(`GET regulations (${source}): HTTP ${regRes.status}`);
    const items = ((await regRes.json()) as { data: { items: ApiRegulation[] } }).data.items;
    regulations.push(...items);
  }

  const draft = buildTypingDraft(regulations, { targetSize, seed });
  // Schema-Validierung vor dem Schreiben (fängt kaputte Cases sofort).
  TypingGoldenSetSchema.parse(draft);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(draft, null, 2) + '\n');

  console.log(
    `[typing-build] ${draft.cases.length} Provisions (${sources.join(',')}) · E6 ${draft.ontologyVersion}\n` +
      `[typing-build] → ${outPath}\n` +
      `[typing-build] NEXT: npm run typing:worksheet -- ${path.relative(process.cwd(), outPath)} /tmp/typing-label.html`
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[typing-build] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
