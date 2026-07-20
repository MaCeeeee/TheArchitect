/**
 * Tests für relationsCandidates.ts (THE-421, Task 12a) — reine Ranking- +
 * Selektions-Logik für das Relations-Golden-Kandidaten-Set. Kein I/O, kein
 * Fetching (das ist Task 12b) — nur die Auswahl-Logik selbst.
 */
import {
  rankCandidatePairs,
  selectCandidates,
  type CandidateParagraph,
  type RankedPair,
} from '../evals/relationsCandidates';

// ─── Fixtures ────────────────────────────────────────────────────────
//
// 2D unit vectors at distinct angles → cosine similarity spans a wide,
// (empirically, for these angle choices) tie-free range from ~1 down to ~-1,
// so score-based ordering is unambiguous across the whole fixture.

function vecAt(degrees: number): number[] {
  const rad = (degrees * Math.PI) / 180;
  return [Math.cos(rad), Math.sin(rad)];
}

function para(regulationKey: string, source: string, angleDeg: number): CandidateParagraph {
  return {
    regulationKey,
    source,
    paragraphNumber: regulationKey.split(':')[1] ?? '1',
    fullText: `Full legal text of ${regulationKey} for testing purposes, long enough to be realistic.`,
    language: 'en',
    embedding: vecAt(angleDeg),
  };
}

// Irregular angles (no arithmetic progression) so cosine scores spread across
// the whole [-1, 1] range without clustering. dora:art-1 × nis2:art-1 lands
// mid-pack (score ≈ 0, rank 23 of 36) — deliberately neither a natural
// similarity winner nor a natural hard negative, so the anchor test proves
// forced inclusion rather than coinciding with a pick similarity would have
// made anyway.
const lawAParas: CandidateParagraph[] = [
  para('dora:art-1', 'dora', 5),
  para('dora:art-2', 'dora', 47),
  para('dora:art-3', 'dora', 88),
  para('dora:art-4', 'dora', 123),
  para('dora:art-5', 'dora', 161),
  para('dora:art-6', 'dora', 199),
];

const lawBParas: CandidateParagraph[] = [
  para('nis2:art-1', 'nis2', 95),
  para('nis2:art-2', 'nis2', 33),
  para('nis2:art-3', 'nis2', 150),
  para('nis2:art-4', 'nis2', 12),
  para('nis2:art-5', 'nis2', 175),
  para('nis2:art-6', 'nis2', 60),
];

function pairKey(p: RankedPair): string {
  return `${p.a.regulationKey}|${p.b.regulationKey}`;
}

describe('rankCandidatePairs', () => {
  it('ranks pairs by cosine similarity, descending, and only across different laws', () => {
    const ranked = rankCandidatePairs(lawAParas, lawBParas);
    expect(ranked.length).toBe(lawAParas.length * lawBParas.length);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
    for (const p of ranked) expect(p.a.source).not.toBe(p.b.source);
  });

  it('stores every pair sorted by regulationKey', () => {
    for (const p of rankCandidatePairs(lawAParas, lawBParas)) {
      expect(p.a.regulationKey < p.b.regulationKey).toBe(true);
    }
  });

  it('never produces two ranked entries for the same pair', () => {
    const ranked = rankCandidatePairs(lawAParas, lawBParas);
    const keys = new Set(ranked.map(pairKey));
    expect(keys.size).toBe(ranked.length);
  });
});

describe('selectCandidates', () => {
  const ranked = rankCandidatePairs(lawAParas, lawBParas);

  it('draws the negative share from the dissimilar end', () => {
    const sel = selectCandidates(ranked, { targetSize: 20, negativeShare: 0.3, seed: 42 });
    expect(sel).toHaveLength(20);
    const neg = sel.filter((p) => p.bucket === 'negative');
    const sim = sel.filter((p) => p.bucket === 'similar');
    expect(neg).toHaveLength(6);
    expect(sim).toHaveLength(14);
    expect(Math.max(...neg.map((p) => p.score))).toBeLessThan(Math.min(...sim.map((p) => p.score)));
  });

  it('always includes configured anchors, even when similarity would exclude them', () => {
    const sel = selectCandidates(ranked, {
      targetSize: 5,
      anchors: [['dora:art-1', 'nis2:art-1']],
      seed: 42,
    });
    expect(sel).toHaveLength(5);
    const anchor = sel.find((p) => p.a.regulationKey === 'dora:art-1' && p.b.regulationKey === 'nis2:art-1');
    expect(anchor).toBeDefined();
    expect(anchor?.bucket).toBe('anchor');
    // Prove it would NOT have made a pure-similarity top-5 cut on its own.
    const withoutAnchor = selectCandidates(ranked, { targetSize: 5, seed: 42 });
    expect(withoutAnchor.some((p) => p.a.regulationKey === 'dora:art-1' && p.b.regulationKey === 'nis2:art-1')).toBe(
      false
    );
  });

  it('is deterministic for the same seed and differs for another', () => {
    const a1 = selectCandidates(ranked, { targetSize: 10, seed: 42 }).map(pairKey);
    const a2 = selectCandidates(ranked, { targetSize: 10, seed: 42 }).map(pairKey);
    const b = selectCandidates(ranked, { targetSize: 10, seed: 7 }).map(pairKey);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });

  it('never returns duplicate pairs', () => {
    const sel = selectCandidates(ranked, {
      targetSize: ranked.length,
      anchors: [['dora:art-1', 'nis2:art-1']],
      seed: 42,
    });
    const keys = new Set(sel.map(pairKey));
    expect(keys.size).toBe(sel.length);
  });

  it('returns everything available when targetSize exceeds the candidate count', () => {
    const sel = selectCandidates(ranked, { targetSize: 10_000, seed: 42 });
    expect(sel).toHaveLength(ranked.length);
    const keys = new Set(sel.map(pairKey));
    expect(keys.size).toBe(ranked.length);
  });

  it('throws when a configured anchor pair is not present among the ranked candidates', () => {
    expect(() =>
      selectCandidates(ranked, {
        targetSize: 5,
        anchors: [['dora:art-99', 'nis2:art-1']],
      })
    ).toThrow(/dora:art-99/);
  });

  // Extra risk case (beyond the spec's list): anchors may be handed in
  // reversed order relative to the internal sorted a/b convention (a caller
  // naturally writing "the law I care about first" won't know or respect the
  // regulationKey sort order). A pairKey lookup that only checked
  // (a===x && b===y) would silently miss this and either drop the anchor or
  // throw a false "not found" — exactly the silent-drop trap the task warns
  // about, just triggered by argument order instead of a truly absent pair.
  it('matches a configured anchor regardless of the order its two keys are given in', () => {
    const sel = selectCandidates(ranked, {
      targetSize: 5,
      anchors: [['nis2:art-1', 'dora:art-1']], // reversed vs. sorted a/b order
      seed: 42,
    });
    const anchor = sel.find((p) => p.a.regulationKey === 'dora:art-1' && p.b.regulationKey === 'nis2:art-1');
    expect(anchor).toBeDefined();
    expect(anchor?.bucket).toBe('anchor');
  });

  it('forces anchors in even when targetSize is 0', () => {
    const sel = selectCandidates(ranked, {
      targetSize: 0,
      anchors: [['dora:art-1', 'nis2:art-1']],
      seed: 42,
    });
    expect(sel).toHaveLength(1);
    expect(sel[0].bucket).toBe('anchor');
  });
});
