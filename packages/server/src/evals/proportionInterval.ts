/**
 * Beta-Intervall für einfache Quoten k/n (Treffer von Fällen).
 *
 * Wozu, wenn es `bootstrapCI` gibt? Der Bootstrap zieht Fälle neu, und das
 * reicht bei kleinen Mengen nicht: Aus 9 Treffern bei 9 Fällen zieht er nie
 * einen Fehler, das Intervall wird [1, 1] und behauptet eine Sicherheit, die
 * neun Fälle nicht tragen. Genau diese kleinen Zählungen entscheiden bei uns
 * Kill/Go („Fang 9/9, Fehlalarm 1/5").
 *
 * Verfahren: Jeffreys-Intervall — die Quantile α/2 und 1−α/2 der Beta-Verteilung
 * Beta(k + ½, n − k + ½), also der Posterior einer Binomialquote unter dem
 * Jeffreys-Prior. Mit der Randkorrektur nach Brown, Cai & DasGupta (2001):
 * bei k = 0 ist die Untergrenze 0, bei k = n die Obergrenze 1. Die Überdeckung
 * liegt auch bei kleinem n nahe am Nennwert, ohne so konservativ zu sein wie
 * Clopper-Pearson.
 *
 * Gilt nur für Quoten aus unabhängigen Ja/Nein-Fällen. Für Kennzahlen über
 * mehrere Ebenen (Micro-Recall über Mappings, F2) bleibt `bootstrapCI` richtig.
 *
 * Reine Funktionen, keine Abhängigkeiten.
 */

import type { ConfidenceInterval } from './metrics';

// ─── Log-Gamma (Lanczos, g = 7, n = 9) ──────────────────────────

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function logGamma(x: number): number {
  if (x < 0.5) {
    // Spiegelung: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const z = x - 1;
  let sum = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) sum += LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

// ─── Regularisierte unvollständige Beta-Funktion ────────────────

/** Kettenbruch nach Lentz (Numerical Recipes, `betacf`). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITER = 500;
  const EPS = 1e-15;
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/** I_x(a, b) — die CDF der Beta(a, b)-Verteilung an der Stelle x. */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logFront = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(logFront);
  // Der Kettenbruch konvergiert schnell für x < (a+1)/(a+b+2); sonst über die Symmetrie.
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Quantil der Beta(a, b)-Verteilung per Bisektion — langsam, aber monoton sicher. */
export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ─── Jeffreys-Intervall ─────────────────────────────────────────

/**
 * (1 − α)-Intervall für die Quote k/n.
 *
 * `null` bei n = 0: Ohne Fall gibt es keine Quote — nicht gemessen ist nicht
 * dasselbe wie 0 % (leere Messung ≠ Bestehen).
 */
export function jeffreysInterval(k: number, n: number, alpha = 0.05): ConfidenceInterval | null {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) {
    throw new RangeError(`jeffreysInterval: ungültige Zählung ${k}/${n}`);
  }
  if (n === 0) return null;
  const a = k + 0.5;
  const b = n - k + 0.5;
  return {
    lo: k === 0 ? 0 : betaQuantile(alpha / 2, a, b),
    hi: k === n ? 1 : betaQuantile(1 - alpha / 2, a, b),
  };
}

/** „2–63 %" — für Markdown-Tabellen. `null` (nicht gemessen) wird „—". */
export function formatInterval(ci: ConfidenceInterval | null, digits = 0): string {
  if (!ci) return '—';
  return `${(100 * ci.lo).toFixed(digits)}–${(100 * ci.hi).toFixed(digits)} %`;
}
