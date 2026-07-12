/**
 * Typing-Eval-Metriken — reine, deterministische Funktionen (kein LLM, kein I/O).
 *
 * Anders als die Mapping-Eval (Set-Zugehörigkeit, metrics.ts) ist Term Typing
 * eine Single-Label-Klassifikation JE ACHSE (normKind/bindingness/obligationKind/
 * partyRole) gegen einen geschlossenen E6-Raum. Darum:
 *   - Accuracy je Achse (nur über gelabelte Gold-Achsen)
 *   - per-Klassen-Confusion → Precision/Recall/F1 + macro-F1 je Achse
 *   - Breakdowns nach Sprache / Source / C_score-Band (THE-431)
 *   - Kalibrierung (ECE) je Achse, WENN die Vorhersage Confidence trägt —
 *     wiederverwendet expectedCalibrationError aus metrics.ts.
 *
 * Konventionen:
 *   gold[axis] === undefined  → Achse nicht gelabelt → aus der Achsen-Metrik AUS.
 *   gold[axis] === null       → bewusst "nicht anwendbar" → eigene Klasse '__na__'.
 *   predicted[axis] undefined → Modell hat nichts/OOV geliefert → Klasse '__none__'
 *                               (zählt als Fehler, nicht ausgeschlossen).
 *
 * Linear: THE-430 (REQ-ONTO-001.5) · Bänder THE-431 · ECE-Reuse THE-380
 */
import { expectedCalibrationError, type CalibrationSample, type CalibrationReport } from './metrics';
import type { TypingLabels, TypingAxis } from './typingGolden';
import { TYPING_AXES } from './typingGolden';
import type { ComplexityBand } from '../norms/complexityScore';

const NA = '__na__'; // gold/pred === null
const NONE = '__none__'; // pred === undefined (keine Vorhersage)

export interface TypingEvalCase {
  caseId: string;
  source: string;
  language: 'de' | 'en';
  /** Band der Norm, zu der die Provision gehört (aus C_score, THE-431). */
  complexityBand?: ComplexityBand;
  gold: TypingLabels;
  predicted: TypingLabels;
  /** Optionale Modell-Confidence je Achse (für Kalibrierung). */
  confidence?: Partial<Record<TypingAxis, number>>;
}

/** Interne Normalisierung eines Achsen-Werts auf einen Confusion-Key. */
function classKey(v: string | null | undefined, isPrediction: boolean): string {
  if (v === null) return NA;
  if (v === undefined) return isPrediction ? NONE : '';
  return v;
}

// ─── Accuracy je Achse ──────────────────────────────────────────

export interface AxisAccuracy {
  axis: TypingAxis;
  labeled: number; // Gold-Achse gesetzt (string ODER null)
  correct: number;
  accuracy: number;
}

export function axisAccuracy(cases: TypingEvalCase[], axis: TypingAxis): AxisAccuracy {
  let labeled = 0;
  let correct = 0;
  for (const c of cases) {
    const g = c.gold[axis];
    if (g === undefined) continue; // ungelabelte Gold-Achse zählt nicht
    labeled++;
    const p = c.predicted[axis];
    // null===null gilt als korrekt; string-Gleichheit sonst.
    if ((g === null && p === null) || (g !== null && g === p)) correct++;
  }
  return { axis, labeled, correct, accuracy: labeled ? correct / labeled : 0 };
}

// ─── per-Klassen-Confusion + macro-F1 je Achse ──────────────────

export interface ClassMetric {
  cls: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  support: number; // Gold-Vorkommen der Klasse
}

export interface AxisConfusion {
  axis: TypingAxis;
  classes: ClassMetric[];
  macroF1: number;
}

export function axisConfusion(cases: TypingEvalCase[], axis: TypingAxis): AxisConfusion {
  const labeled = cases.filter((c) => c.gold[axis] !== undefined);
  // Klassen = alle im Gold vorkommenden Werte (inkl. '__na__').
  const goldClasses = new Set<string>();
  for (const c of labeled) goldClasses.add(classKey(c.gold[axis], false));

  const classes: ClassMetric[] = [];
  let f1Sum = 0;
  for (const cls of [...goldClasses].sort()) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (const c of labeled) {
      const g = classKey(c.gold[axis], false);
      const p = classKey(c.predicted[axis], true);
      if (g === cls) support++;
      if (p === cls && g === cls) tp++;
      else if (p === cls && g !== cls) fp++;
      else if (p !== cls && g === cls) fn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    classes.push({ cls, tp, fp, fn, precision, recall, f1, support });
    f1Sum += f1;
  }
  return { axis, classes, macroF1: goldClasses.size ? f1Sum / goldClasses.size : 0 };
}

// ─── Breakdowns ─────────────────────────────────────────────────

export function breakdownByKey(
  cases: TypingEvalCase[],
  keyOf: (c: TypingEvalCase) => string | undefined,
  axis: TypingAxis
): Record<string, AxisAccuracy> {
  const groups = new Map<string, TypingEvalCase[]>();
  for (const c of cases) {
    const k = keyOf(c);
    if (k === undefined) continue;
    const list = groups.get(k) ?? [];
    list.push(c);
    groups.set(k, list);
  }
  const out: Record<string, AxisAccuracy> = {};
  for (const [k, list] of groups) out[k] = axisAccuracy(list, axis);
  return out;
}

// ─── Kalibrierung je Achse (nur wenn Confidence vorhanden) ──────

export function axisCalibration(cases: TypingEvalCase[], axis: TypingAxis): CalibrationReport | null {
  const samples: CalibrationSample[] = [];
  for (const c of cases) {
    const conf = c.confidence?.[axis];
    const g = c.gold[axis];
    if (conf === undefined || g === undefined) continue;
    const p = c.predicted[axis];
    const correct = (g === null && p === null) || (g !== null && g === p);
    samples.push({ confidence: conf, correct });
  }
  return samples.length ? expectedCalibrationError(samples) : null;
}

// ─── Gesamt-Report-Assembly ─────────────────────────────────────

export interface TypingReport {
  total: number;
  axes: Record<
    TypingAxis,
    {
      accuracy: AxisAccuracy;
      confusion: AxisConfusion;
      byLanguage: Record<string, AxisAccuracy>;
      bySource: Record<string, AxisAccuracy>;
      byComplexityBand: Record<string, AxisAccuracy>;
      calibration: CalibrationReport | null;
    }
  >;
}

export function buildTypingReport(cases: TypingEvalCase[]): TypingReport {
  const axes = {} as TypingReport['axes'];
  for (const axis of TYPING_AXES) {
    axes[axis] = {
      accuracy: axisAccuracy(cases, axis),
      confusion: axisConfusion(cases, axis),
      byLanguage: breakdownByKey(cases, (c) => c.language, axis),
      bySource: breakdownByKey(cases, (c) => c.source, axis),
      byComplexityBand: breakdownByKey(cases, (c) => c.complexityBand, axis),
      calibration: axisCalibration(cases, axis),
    };
  }
  return { total: cases.length, axes };
}
