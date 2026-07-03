/**
 * Zwei-Ansichten-Konsistenz — label-freie Eval nach dem Stereogramm-Prinzip
 * (Becker & Hinton 1992 / JEPA-Familie): Zwei Ansichten desselben Inhalts
 * müssen dieselbe Antwort erzeugen.
 *
 * Für Compliance-Mapping heißt das: Die DE- und EN-Fassung desselben
 * EUR-Lex-Paragraphen (oder Original vs. umsortierte Kandidatenliste) MUSS
 * auf dieselben Elemente mappen. Jede Abweichung ist ein garantierter Fehler
 * in mindestens einer Antwort — ganz ohne Labels. Abweichende Fälle sind
 * zugleich die Active-Learning-Kandidaten fürs Golden-Set (THE-379).
 *
 * Linear: THE-380 (REQ-EVAL-001.2) · Ergänzung aus SSL-Review (UC-EVAL-001)
 */
import { z } from 'zod';
import { mulberry32 } from './metrics';

// ─── Schema: View-Pair-Datensatz (z. B. DE/EN aus EUR-Lex) ──────

const ViewSchema = z.object({
  label: z.string().min(1), // e.g. 'de', 'en', 'paraphrase'
  fullText: z.string().min(50),
  language: z.enum(['de', 'en']),
});

export const ConsistencyCaseSchema = z.object({
  caseId: z.string().min(1),
  source: z.string().min(1),
  paragraphNumber: z.string().min(1),
  jurisdiction: z.string().min(1),
  candidates: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        type: z.string().min(1),
        layer: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .min(1),
  viewA: ViewSchema,
  viewB: ViewSchema,
});

export const ConsistencySetSchema = z.object({
  version: z.string().min(1),
  cases: z.array(ConsistencyCaseSchema).min(1),
});

export type ConsistencyCase = z.infer<typeof ConsistencyCaseSchema>;
export type ConsistencySet = z.infer<typeof ConsistencySetSchema>;

// ─── Metriken ───────────────────────────────────────────────────

/** Jaccard-Ähnlichkeit zweier Element-Mengen. Beide leer ⇒ 1 (perfekte Einigkeit auf „nichts"). */
export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const id of setA) if (setB.has(id)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

export interface PairOutcome {
  caseId: string;
  source: string;
  mode: string; // 'language' | 'candidate-order' | ...
  viewALabel: string;
  viewBLabel: string;
  predictedA: string[];
  predictedB: string[];
  jaccard: number;
  exactMatch: boolean;
  onlyA: string[]; // von A vorhergesagt, von B nicht — mind. eine Seite irrt
  onlyB: string[];
}

export function pairOutcome(args: {
  caseId: string;
  source: string;
  mode: string;
  viewALabel: string;
  viewBLabel: string;
  predictedA: string[];
  predictedB: string[];
}): PairOutcome {
  const setA = new Set(args.predictedA);
  const setB = new Set(args.predictedB);
  return {
    ...args,
    jaccard: jaccard(args.predictedA, args.predictedB),
    exactMatch: setA.size === setB.size && [...setA].every(id => setB.has(id)),
    onlyA: [...setA].filter(id => !setB.has(id)),
    onlyB: [...setB].filter(id => !setA.has(id)),
  };
}

export interface ConsistencySummary {
  pairs: number;
  meanJaccard: number;
  exactMatchRate: number;
  disagreements: number; // Paare mit exactMatch === false
}

export function aggregateConsistency(outcomes: PairOutcome[]): ConsistencySummary {
  if (outcomes.length === 0) {
    return { pairs: 0, meanJaccard: 0, exactMatchRate: 0, disagreements: 0 };
  }
  const meanJaccard = outcomes.reduce((s, o) => s + o.jaccard, 0) / outcomes.length;
  const exact = outcomes.filter(o => o.exactMatch).length;
  return {
    pairs: outcomes.length,
    meanJaccard,
    exactMatchRate: exact / outcomes.length,
    disagreements: outcomes.length - exact,
  };
}

// ─── Deterministischer Shuffle (Positions-Bias-View) ───────────

/** Fisher-Yates mit seeded PRNG — dieselbe Eingabe+Seed ⇒ dieselbe Permutation. */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Stabiler numerischer Seed aus einer caseId (FNV-1a). */
export function seedFromString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
