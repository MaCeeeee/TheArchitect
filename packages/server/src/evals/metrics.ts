/**
 * Eval-Metriken — reine, deterministische Funktionen (kein LLM, kein I/O).
 *
 * Semantik: Ein "Paar" ist (Golden-Case, Element-Kandidat). Pro Case:
 *   TP = vorhergesagt ∧ gold, FP = vorhergesagt ∧ ¬gold, FN = ¬vorhergesagt ∧ gold.
 * Precision/Recall/F-beta werden micro-averaged über alle Paare berechnet.
 * F2 (beta=2) gewichtet Recall doppelt — ein übersehenes Gesetz (FN) ist
 * audit-kritisch, ein Fehlalarm (FP) nur lästig (UC-EVAL-001).
 *
 * Linear: THE-380 (REQ-EVAL-001.2)
 */

export interface PredictedMapping {
  elementId: string;
  confidence: number;
}

export interface CaseOutcome {
  caseId: string;
  source: string;
  goldElementIds: string[];
  predicted: PredictedMapping[];
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
}

export interface PrfMetrics {
  precision: number;
  recall: number;
  f2: number;
  tp: number;
  fp: number;
  fn: number;
}

// ─── Kern: Confusion + P/R/F ────────────────────────────────────

export function confusionForCase(outcome: CaseOutcome): Confusion {
  const gold = new Set(outcome.goldElementIds);
  const predicted = new Set(outcome.predicted.map(p => p.elementId));
  let tp = 0;
  let fp = 0;
  for (const id of predicted) {
    if (gold.has(id)) tp++;
    else fp++;
  }
  let fn = 0;
  for (const id of gold) {
    if (!predicted.has(id)) fn++;
  }
  return { tp, fp, fn };
}

export function fBeta(precision: number, recall: number, beta: number): number {
  const b2 = beta * beta;
  const denom = b2 * precision + recall;
  if (denom === 0) return 0;
  return ((1 + b2) * precision * recall) / denom;
}

/** Micro-averaged Precision/Recall/F2 über alle Cases. */
export function aggregateMetrics(outcomes: CaseOutcome[]): PrfMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const o of outcomes) {
    const c = confusionForCase(o);
    tp += c.tp;
    fp += c.fp;
    fn += c.fn;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return { precision, recall, f2: fBeta(precision, recall, 2), tp, fp, fn };
}

// ─── Empty-Set-Accuracy (Hard Negatives) ────────────────────────

/**
 * Anteil der Hard-Negative-Cases (gold = []), bei denen das Modell korrekt
 * NICHTS vorhergesagt hat. Entlarvt über-eifriges Matchen, das sich hinter
 * gutem Recall versteckt. Returns null, wenn das Set keine Hard Negatives hat.
 */
export function emptySetAccuracy(outcomes: CaseOutcome[]): number | null {
  const negatives = outcomes.filter(o => o.goldElementIds.length === 0);
  if (negatives.length === 0) return null;
  const correct = negatives.filter(o => o.predicted.length === 0).length;
  return correct / negatives.length;
}

// ─── Breakdowns ─────────────────────────────────────────────────

export function breakdownBySource(outcomes: CaseOutcome[]): Record<string, PrfMetrics> {
  const groups = new Map<string, CaseOutcome[]>();
  for (const o of outcomes) {
    const list = groups.get(o.source) ?? [];
    list.push(o);
    groups.set(o.source, list);
  }
  const result: Record<string, PrfMetrics> = {};
  for (const [source, list] of groups) {
    result[source] = aggregateMetrics(list);
  }
  return result;
}

export interface ConfidenceBandStat {
  band: string; // e.g. "0.5–0.6"
  predictions: number;
  correct: number;
  precision: number;
}

/**
 * Precision je Confidence-Band der Vorhersagen. Vorstufe zur Kalibrierung
 * (THE-383): liegt Precision im Band "0.9–1.0" deutlich unter 0.9, ist die
 * selbst-berichtete Confidence zu optimistisch.
 */
export function precisionByConfidenceBand(
  outcomes: CaseOutcome[],
  edges: number[] = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
): ConfidenceBandStat[] {
  const stats: ConfidenceBandStat[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const isLast = i === edges.length - 2;
    let predictions = 0;
    let correct = 0;
    for (const o of outcomes) {
      const gold = new Set(o.goldElementIds);
      for (const p of o.predicted) {
        const inBand = p.confidence >= lo && (isLast ? p.confidence <= hi : p.confidence < hi);
        if (!inBand) continue;
        predictions++;
        if (gold.has(p.elementId)) correct++;
      }
    }
    stats.push({
      band: `${lo.toFixed(1)}–${hi.toFixed(1)}`,
      predictions,
      correct,
      precision: predictions === 0 ? 0 : correct / predictions,
    });
  }
  return stats;
}

// ─── Bootstrap-Konfidenzintervalle ──────────────────────────────

/** Deterministischer PRNG (mulberry32) — Date/Math.random-frei, reproduzierbar. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ConfidenceInterval {
  lo: number;
  hi: number;
}

/**
 * Bootstrap-CI (Resampling der CASES mit Zurücklegen). Bei ~50 Cases kann
 * eine 4%-Differenz Rauschen sein — dieses Intervall macht das sichtbar
 * (statistische Ehrlichkeit, UC-EVAL-001 / THE-386 Regression-Gate).
 */
export function bootstrapCI(
  outcomes: CaseOutcome[],
  metric: (o: CaseOutcome[]) => number,
  iterations = 1000,
  seed = 42,
  alpha = 0.05
): ConfidenceInterval {
  if (outcomes.length === 0) return { lo: 0, hi: 0 };
  const rand = mulberry32(seed);
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const resample: CaseOutcome[] = [];
    for (let j = 0; j < outcomes.length; j++) {
      resample.push(outcomes[Math.floor(rand() * outcomes.length)]);
    }
    samples.push(metric(resample));
  }
  samples.sort((a, b) => a - b);
  const loIdx = Math.floor((alpha / 2) * iterations);
  const hiIdx = Math.min(iterations - 1, Math.ceil((1 - alpha / 2) * iterations) - 1);
  return { lo: samples[loIdx], hi: samples[hiIdx] };
}

// ─── Conciseness (REQ-EVAL-001.10 / CASCADE_DESIGN.md §4) ───────
//
// Zweite Bewertungsachse neben Correctness: matcht das Modell sparsam oder
// wirft es zur Sicherheit alles rein (Alarm-Müdigkeit)? WICHTIG: weiches
// Gate — nie allein optimieren (Anti-Goodhart-Kopplung: Conciseness-Gewinne
// zählen nur bei Recall-Nicht-Unterlegenheit).

export interface ConcisenessMetrics {
  /**
   * Over-Match-Ratio: Σ|predicted| / Σ max(1,|gold|). 1.0 = exakt so viele
   * Mappings wie das Gold verlangt; >1 = Über-Matchen. Hard Negatives zählen
   * mit Nenner 1, damit Vorhersagen auf ihnen die Ratio treiben (gewollt).
   */
  overMatchRatio: number;
  meanPredictionsPerCase: number;
  /** Histogramm der Mapping-Anzahl pro Fall: "0", "1", ..., "<cap>+". */
  predictionCountDistribution: Record<string, number>;
  /**
   * Anteil Fälle, die den Top-N-Cap voll ausschöpfen — Kandidaten für STILLE
   * Trunkierung (der Service kappt bei MAX_MAPPINGS_PER_REGULATION; fällt die
   * Breiten-Entscheidung "breit" aus, wird der Cap zum Recall-Bug).
   */
  capHitRate: number;
}

export function concisenessMetrics(outcomes: CaseOutcome[], cap: number): ConcisenessMetrics {
  if (outcomes.length === 0) {
    return {
      overMatchRatio: 0,
      meanPredictionsPerCase: 0,
      predictionCountDistribution: {},
      capHitRate: 0,
    };
  }

  let predicted = 0;
  let goldDenominator = 0;
  let capHits = 0;
  const distribution: Record<string, number> = {};

  for (const o of outcomes) {
    const n = o.predicted.length;
    predicted += n;
    goldDenominator += Math.max(1, o.goldElementIds.length);
    if (n >= cap) capHits++;
    const bucket = n >= cap ? `${cap}+` : String(n);
    distribution[bucket] = (distribution[bucket] ?? 0) + 1;
  }

  return {
    overMatchRatio: predicted / goldDenominator,
    meanPredictionsPerCase: predicted / outcomes.length,
    predictionCountDistribution: distribution,
    capHitRate: capHits / outcomes.length,
  };
}

// ─── Cohen's Kappa (Inter-Annotator-Agreement) ──────────────────

export type PairLabel = 'match' | 'no-match';

/**
 * Cohen's Kappa für zwei Annotatoren über dieselben Paare (RUBRIC.md §7).
 * Kappa < 0.6 ⇒ Rubrik schärfen, nicht das Modell tunen.
 */
export function cohenKappa(a: PairLabel[], b: PairLabel[]): number {
  if (a.length !== b.length) {
    throw new Error(`cohenKappa: label arrays differ in length (${a.length} vs ${b.length})`);
  }
  const n = a.length;
  if (n === 0) throw new Error('cohenKappa: empty label arrays');

  let agree = 0;
  let aMatch = 0;
  let bMatch = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    if (a[i] === 'match') aMatch++;
    if (b[i] === 'match') bMatch++;
  }
  const po = agree / n;
  const pMatch = (aMatch / n) * (bMatch / n);
  const pNoMatch = ((n - aMatch) / n) * ((n - bMatch) / n);
  const pe = pMatch + pNoMatch;
  if (pe === 1) return 1; // beide Annotatoren völlig einseitig UND einig
  return (po - pe) / (1 - pe);
}
