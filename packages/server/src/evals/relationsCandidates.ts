/**
 * Relations-Kandidaten — reine Ranking- + Selektions-Logik für das Relations-
 * Golden-Set (THE-421, Task 12a). ~1532 Paragraphen im Korpus, ein Gesetzespaar
 * wie DORA×NIS2 liegt bei ~300×300 = 90.000 Kombinationen — das lässt sich
 * weder vollständig noch zufällig labeln (Zufalls-Sample ≈ 100% Negative, misst
 * nichts). Also müssen Kandidaten VORAB selektiert werden, und weil die Qualität
 * des gesamten nachgelagerten Labeling-Sets davon abhängt, ist diese Auswahl-
 * Logik hier bewusst als reine, isoliert getestete Funktion isoliert — kein
 * I/O, kein Netz, kein LLM. Fetching + Draft-Assembly ist Task 12b.
 *
 * Drei Kandidatenquellen (siehe Task-Spec):
 *  1. similar  — hohe Cosine-Similarity zwischen den Paragraph-Embeddings, wo
 *     echte Cross-Norm-Relationen plausibel liegen.
 *  2. negative — das UNÄHNLICHE Ende. Ohne bewusste Negative ist Precision
 *     nicht messbar: ein Labeler, der nur plausible Paare sieht, kann nie
 *     zeigen, dass die Methode Unplausibles zurückweist (Analogon zu den
 *     "Hard Negatives" im Mapping-Rubric).
 *  3. anchor   — bekannte, IMMER einzuschließende Paare (z. B. DORAs
 *     Eröffnungsartikel referenzieren NIS2 explizit; DSGVO Art. 32 und
 *     NIS2 Art. 21 fordern beide Sicherheitsmaßnahmen) — unabhängig davon, wo
 *     Similarity sie einordnen würde.
 *
 * Design-Entscheidungen:
 *  - Ein Anchor, dessen Paar in `ranked` nicht existiert, wird NICHT still
 *    verworfen — `selectCandidates` wirft. Ein Anchor ist genau der Fall, den
 *    jemand bewusst angefordert hat; ein stilles Weglassen wäre eine Falle,
 *    die erst auffällt, wenn im Label-Set eine erwartete Zeile fehlt.
 *  - Anchors dürfen in beliebiger Reihenfolge angegeben werden ([keyX,keyY]
 *    ODER [keyY,keyX]) — das interne a/b ist nach regulationKey sortiert
 *    (relationsGolden.ts-Konvention: a.regulationKey < b.regulationKey). Ein
 *    Anchor-Lookup, der nur die exakte (a,b)-Reihenfolge akzeptiert, würde
 *    einen in "natürlicher" Reihenfolge angegebenen Anchor am internen Sort
 *    scheitern lassen — dieselbe Silent-Drop-Falle, nur über die Argument-
 *    Reihenfolge statt über ein wirklich fehlendes Paar ausgelöst.
 *  - Similar/Negative werden GREEDY von den beiden Enden der Rangliste
 *    gezogen (maximale Trennschärfe: die extremsten Positiv-/Negativ-
 *    Kandidaten) — das bleibt der `seed` bewusst unangetastet, sonst würde
 *    eine zufällige Auswahl schwächere Kandidaten ziehen als das Optimum, das
 *    bereits vorliegt. `seed`/`mulberry32` steuern stattdessen deterministisch
 *    die PRÄSENTATIONS-Reihenfolge der finalen Auswahl — ohne das sähe ein
 *    menschlicher Labeler immer "erst alle Anchors, dann alle Similar, dann
 *    alle Negative", was Reihenfolge-Bias in die Annotation einführen würde.
 *  - Ties in der Similarity dürfen `rankCandidatePairs` nicht non-
 *    deterministisch machen — Tie-Break auf dem stabilen Pair-Key.
 *
 * Linear: THE-421 (Task 12a)
 */
import { mulberry32 } from './metrics';

export interface CandidateParagraph {
  regulationKey: string;
  source: string;
  paragraphNumber: string;
  title?: string;
  fullText: string;
  language: 'de' | 'en';
  embedding: number[];
}

export interface RankedPair {
  a: CandidateParagraph;
  b: CandidateParagraph; // sorted: a.regulationKey < b.regulationKey
  score: number; // cosine similarity
  bucket?: 'similar' | 'negative' | 'anchor';
}

export interface SelectOptions {
  targetSize: number;
  negativeShare?: number; // default 0.3
  anchors?: Array<[string, string]>; // regulationKey pairs, always included
  seed?: number; // default 42
}

// ─── Cosine similarity ───────────────────────────────────────────────
//
// A local, dependency-free implementation on purpose: the two existing
// occurrences in the codebase (runDiscoveryEval.ts, elementSimilarity.service.ts)
// both live in modules with I/O side effects at import time (`dotenv/config`,
// the Anthropic SDK, QdrantClient) — importing either into this pure module
// would drag those side effects into every caller, including tests. The
// formula itself mirrors the existing convention (plain dot-product /
// (‖a‖·‖b‖), 0 for a zero-vector) so scores stay comparable across the
// codebase.

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function pairKey(regA: string, regB: string): string {
  return regA < regB ? `${regA}|${regB}` : `${regB}|${regA}`;
}

// ─── Ranking ─────────────────────────────────────────────────────────

/**
 * Ranks every cross-law pair (lawA × lawB) by cosine similarity, descending.
 * Pairs are stored sorted by `regulationKey` (a < b), matching the
 * relationsGolden.ts case convention. Same-source combinations (a data
 * mistake, since lawA/lawB are meant to be two different laws) and
 * self-pairs are skipped defensively.
 */
export function rankCandidatePairs(lawA: CandidateParagraph[], lawB: CandidateParagraph[]): RankedPair[] {
  const seen = new Set<string>();
  const pairs: RankedPair[] = [];

  for (const x of lawA) {
    for (const y of lawB) {
      if (x.source === y.source) continue;
      if (x.regulationKey === y.regulationKey) continue;
      const key = pairKey(x.regulationKey, y.regulationKey);
      if (seen.has(key)) continue;
      seen.add(key);

      const [a, b] = x.regulationKey < y.regulationKey ? [x, y] : [y, x];
      pairs.push({ a, b, score: cosineSimilarity(x.embedding, y.embedding) });
    }
  }

  pairs.sort((p, q) => {
    if (q.score !== p.score) return q.score - p.score;
    // Stable tie-break: ties must not make ordering depend on input/insertion order.
    return pairKey(p.a.regulationKey, p.b.regulationKey).localeCompare(pairKey(q.a.regulationKey, q.b.regulationKey));
  });

  return pairs;
}

// ─── Selection ───────────────────────────────────────────────────────

/**
 * Selects up to `targetSize` pairs from a ranked list: configured anchors
 * first (always included, bucket 'anchor'), then the top slice by score
 * (bucket 'similar') and the bottom slice (bucket 'negative') filling the
 * remaining budget in `negativeShare`/`1 - negativeShare` proportion.
 *
 * Throws if a configured anchor's pair is not present in `ranked` — see the
 * module doc for why a silent skip is the wrong default here.
 */
export function selectCandidates(ranked: RankedPair[], opts: SelectOptions): RankedPair[] {
  const { targetSize, negativeShare = 0.3, anchors = [], seed = 42 } = opts;

  const byKey = new Map<string, RankedPair>();
  for (const p of ranked) byKey.set(pairKey(p.a.regulationKey, p.b.regulationKey), p);

  const selected = new Map<string, RankedPair>();
  const missing: string[] = [];
  for (const [x, y] of anchors) {
    const key = pairKey(x, y);
    const found = byKey.get(key);
    if (!found) {
      missing.push(`${x} <-> ${y}`);
      continue;
    }
    selected.set(key, { ...found, bucket: 'anchor' });
  }
  if (missing.length > 0) {
    throw new Error(`selectCandidates: anchor pair(s) not found among ranked candidates: ${missing.join(', ')}`);
  }

  // Pool for similar/negative picks excludes anchors already claimed above,
  // so a pair can never be selected twice (once as 'anchor', once as
  // 'similar'/'negative'). `ranked` stays sorted descending by score.
  const pool = ranked.filter((p) => !selected.has(pairKey(p.a.regulationKey, p.b.regulationKey)));

  const remaining = Math.max(0, targetSize - selected.size);
  const totalToPick = Math.min(remaining, pool.length);
  const negativeCount = Math.min(Math.round(totalToPick * negativeShare), totalToPick);
  const similarCount = totalToPick - negativeCount;

  // similarCount + negativeCount <= pool.length by construction, so these two
  // slices — taken from opposite ends of the score-sorted pool — never overlap.
  for (const p of pool.slice(0, similarCount)) {
    selected.set(pairKey(p.a.regulationKey, p.b.regulationKey), { ...p, bucket: 'similar' });
  }
  for (const p of pool.slice(pool.length - negativeCount)) {
    selected.set(pairKey(p.a.regulationKey, p.b.regulationKey), { ...p, bucket: 'negative' });
  }

  return shuffleDeterministic([...selected.values()], seed);
}

/** Fisher–Yates shuffle driven by mulberry32 — deterministic per seed, differs across seeds. */
function shuffleDeterministic<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
