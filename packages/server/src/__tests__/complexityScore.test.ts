/**
 * C_score Tests — THE-431 (REQ-ONTO-001.1)
 *
 * Deckt: AC-1 (deterministisch + idempotent, Property-Test über Permutationen),
 * AC-2 (Bänder + benannte Konfig), AC-4 (Band-Threshold Default = No-op),
 * AC-5 (rein, kein LLM/IO — implizit: Modul importiert nichts davon).
 *
 * Run: cd packages/server && npx jest src/__tests__/complexityScore.test.ts
 */
import {
  computeComplexityScore,
  computeFamilyMetrics,
  bandForScore,
  confidenceThresholdForBand,
  C_SCORE_CONFIG,
  C_SCORE_BANDS,
  type NormTreeNode,
} from '../norms/complexityScore';

// ─── Fixtures ───────────────────────────────────────────────────

/** Flacher Baum (P1-Korpus-Projektion): N Sections, eine Ebene, keine Kanten. */
function flatTree(n: number): NormTreeNode[] {
  return Array.from({ length: n }, (_, i) => ({
    eId: `s${i}`,
    heading: `Section ${i}`,
    text: 'x'.repeat(60),
    level: 1,
  }));
}

/** Tiefer, verzweigter Baum: 1 Wurzel → `breadth` Kinder → je `breadth` Enkel. */
function deepTree(breadth: number): NormTreeNode[] {
  const nodes: NormTreeNode[] = [{ eId: 'root', heading: 'Root', text: 'root text body', level: 0 }];
  for (let i = 0; i < breadth; i++) {
    const cid = `c${i}`;
    nodes.push({ eId: cid, parentEId: 'root', heading: `Chapter ${i}`, text: 'chapter body text', level: 1 });
    for (let j = 0; j < breadth; j++) {
      nodes.push({ eId: `${cid}-${j}`, parentEId: cid, heading: `Art ${i}.${j}`, text: 'article body text', level: 2 });
    }
  }
  return nodes;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  // deterministisches Mischen (kein Math.random — reproduzierbar).
  const out = [...arr];
  let a = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    a = (a * 1664525 + 1013904223) >>> 0;
    const j = a % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── AC-1: Determinismus + Idempotenz ───────────────────────────

describe('C_score — Determinismus (AC-1)', () => {
  it('gleicher Baum → identischer Score über wiederholte Aufrufe', () => {
    const tree = deepTree(3);
    const a = computeComplexityScore(tree);
    const b = computeComplexityScore(tree);
    expect(b.score).toBe(a.score);
    expect(b.aggregate).toBe(a.aggregate);
    expect(b.band).toBe(a.band);
  });

  it('invariant gegen Section-Reihenfolge (Property-Test, 20 Permutationen)', () => {
    const tree = deepTree(4);
    const ref = computeComplexityScore(tree);
    for (let seed = 1; seed <= 20; seed++) {
      const permuted = computeComplexityScore(shuffle(tree, seed));
      expect(permuted.score).toBeCloseTo(ref.score, 12);
      expect(permuted.metrics.graph).toEqual(ref.metrics.graph);
      expect(permuted.band).toBe(ref.band);
    }
  });
});

// ─── AC-2: Score-Range, Bänder, Monotonie ───────────────────────

describe('C_score — Range + Bänder (AC-2)', () => {
  it('Score liegt immer in [0,1]', () => {
    for (const tree of [flatTree(1), flatTree(50), deepTree(2), deepTree(6)]) {
      const { score } = computeComplexityScore(tree);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('mehr Struktur → höherer Score (Monotonie)', () => {
    const small = computeComplexityScore(flatTree(3)).score;
    const medium = computeComplexityScore(deepTree(2)).score;
    const large = computeComplexityScore(deepTree(6)).score;
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
  });

  it('Gewichte summieren zu 1.0', () => {
    const sum = Object.values(C_SCORE_CONFIG.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('bandForScore respektiert die 5 dokumentierten Grenzen', () => {
    expect(bandForScore(0.0)).toBe('trivial');
    expect(bandForScore(0.19)).toBe('trivial');
    expect(bandForScore(0.2)).toBe('low');
    expect(bandForScore(0.45)).toBe('moderate');
    expect(bandForScore(0.6)).toBe('high');
    expect(bandForScore(0.95)).toBe('very-high');
    expect(C_SCORE_BANDS).toHaveLength(5);
  });
});

// ─── Robustheit ─────────────────────────────────────────────────

describe('C_score — Robustheit', () => {
  it('leerer Baum → Score ohne Crash (untere Kante)', () => {
    const { score, metrics } = computeComplexityScore([]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(metrics.graph.nodes).toBe(0);
  });

  it('Ein-Knoten-Baum: 1 Root, 0 Kanten, 1 Leaf', () => {
    const m = computeFamilyMetrics([{ eId: 'only', heading: 'H', text: 'body text here now' }]);
    expect(m.graph).toEqual({ nodes: 1, edges: 0, roots: 1, leaves: 1 });
  });

  it('parentEId auf unbekannte eId → als Wurzel behandelt, kein Crash', () => {
    const m = computeFamilyMetrics([{ eId: 'a', parentEId: 'ghost', heading: 'A' }]);
    expect(m.graph.roots).toBe(1);
    expect(m.graph.edges).toBe(0);
  });

  it('Zyklus (a→b→a) terminiert und produziert endlichen Score', () => {
    const cyclic: NormTreeNode[] = [
      { eId: 'a', parentEId: 'b', heading: 'A' },
      { eId: 'b', parentEId: 'a', heading: 'B' },
    ];
    const { score } = computeComplexityScore(cyclic);
    expect(Number.isFinite(score)).toBe(true);
  });

  it('flacher vs. tiefer Baum gleicher Knotenzahl: tiefer hat höhere Hierarchie-Metrik', () => {
    const flat = computeFamilyMetrics(flatTree(13)); // 13 Knoten, 1 Ebene
    const deep = computeFamilyMetrics(deepTree(3)); // 1+3+9 = 13 Knoten, 3 Ebenen
    expect(deep.hierarchy.maxDepth).toBeGreaterThan(flat.hierarchy.maxDepth);
  });
});

// ─── AC-4: Band-Threshold ───────────────────────────────────────

describe('C_score — Band-Threshold (AC-4)', () => {
  it('ohne Override gilt die globale Schwelle (keine Regression)', () => {
    for (const b of C_SCORE_BANDS) {
      expect(confidenceThresholdForBand(b.band, 0.5)).toBe(0.5);
    }
  });

  it('Override wirkt nur für das gesetzte Band', () => {
    const overrides = { 'very-high': 0.85 } as const;
    expect(confidenceThresholdForBand('very-high', 0.5, overrides)).toBe(0.85);
    expect(confidenceThresholdForBand('low', 0.5, overrides)).toBe(0.5);
  });
});
