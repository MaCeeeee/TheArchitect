/**
 * Tests für relationsCandidates.ts (THE-421, Task 12a) — reine Ranking- +
 * Selektions-Logik für das Relations-Golden-Kandidaten-Set. Kein I/O, kein
 * Fetching (das ist Task 12b) — nur die Auswahl-Logik selbst.
 */
import {
  rankCandidatePairs,
  selectCandidates,
  referencesLaw,
  detectPairReference,
  selectCandidatesWithReferences,
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

// ─── Referenz-getriebene Auswahl (THE-433) ───────────────────────────
//
// Hintergrund für alles hier drunter: Ein Zwei-Rater-Lauf auf einem rein
// similarity-gezogenen Set ergab 94% Rohübereinstimmung, aber Kappa 0,212 —
// 111 von 120 Paaren waren „keine Beziehung". Das ist kein Rater-Problem,
// sondern ein Auswahl-Problem: Similarity findet THEMENZWILLINGE, und ein
// Themenzwilling ist nach RUBRIC.md C4 ausdrücklich KEINE Beziehung. Echte
// Beziehungen stehen dort, wo eine Norm die andere im Text ADRESSIERT.
// Diese Tests halten genau diese Unterscheidung fest.

function paraWithText(
  regulationKey: string,
  source: string,
  angleDeg: number,
  fullText: string,
): CandidateParagraph {
  return { ...para(regulationKey, source, angleDeg), fullText };
}

describe('referencesLaw', () => {
  it('detects a German citation of the GDPR by its regulation number', () => {
    const hits = referencesLaw(
      'Diese Verarbeitung erfolgt unbeschadet der Verordnung (EU) 2016/679 des Europäischen Parlaments.',
      'dsgvo',
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects the GDPR under its english source variant too (patterns are per law, not per language file)', () => {
    const hits = referencesLaw('without prejudice to Regulation (EU) 2016/679', 'dsgvo-en');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('detects the GDPR by its common name and abbreviation, not only by number', () => {
    expect(referencesLaw('im Sinne der Datenschutz-Grundverordnung', 'dsgvo').length).toBeGreaterThan(0);
    expect(referencesLaw('Artikel 6 DSGVO bleibt unberührt', 'dsgvo').length).toBeGreaterThan(0);
    expect(referencesLaw('as defined in the GDPR', 'dsgvo-en').length).toBeGreaterThan(0);
  });

  it('does not detect a reference in a text that merely shares the topic', () => {
    expect(
      referencesLaw(
        'Der Verantwortliche trifft geeignete technische und organisatorische Maßnahmen, um ein angemessenes Schutzniveau zu gewährleisten.',
        'nis2',
      ),
    ).toHaveLength(0);
  });

  it('extracts the pinpointed article from "Article N of Directive (EU) 2022/2555"', () => {
    const hits = referencesLaw(
      'means a network and information system as defined in Article 6, point 1, of Directive (EU) 2022/2555;',
      'nis2',
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.flatMap((h) => h.articleHints)).toContain('6');
  });

  it('returns no hits for a source without registered reference patterns', () => {
    expect(referencesLaw('Verordnung (EU) 2016/679', 'does-not-exist')).toHaveLength(0);
  });
});

describe('detectPairReference', () => {
  const dsgvo32 = paraWithText(
    'dsgvo:art-32',
    'dsgvo',
    10,
    'Der Verantwortliche und der Auftragsverarbeiter treffen geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten.',
  );
  const nis221 = paraWithText(
    'nis2-de:art-21',
    'nis2-de',
    10, // identischer Winkel → Cosine 1.0: maximal ähnlich
    'Die Mitgliedstaaten stellen sicher, dass wesentliche und wichtige Einrichtungen geeignete technische und organisatorische Risikomanagementmaßnahmen im Bereich der Cybersicherheit ergreifen.',
  );
  const doraArt1 = paraWithText(
    'dora:art-1',
    'dora',
    5,
    'In relation to financial entities identified as essential or important entities pursuant to national rules transposing Article 3 of Directive (EU) 2022/2555, this Regulation shall be considered a sector-specific Union legal act.',
  );
  const nis2Art4 = paraWithText(
    'nis2:art-4',
    'nis2',
    170, // bewusst UNÄHNLICH zu dora:art-1
    'Where sector-specific Union legal acts require essential or important entities to adopt cybersecurity risk-management measures, those provisions shall apply.',
  );

  function pairOf(a: CandidateParagraph, b: CandidateParagraph): RankedPair {
    const [x, y] = a.regulationKey < b.regulationKey ? [a, b] : [b, a];
    return { a: x, b: y, score: 0.5 };
  }

  // DAS ist der Kern: RUBRIC.md C4. DSGVO Art. 32 und NIS2 Art. 21 sind maximal
  // ähnlich und stehen in KEINER Beziehung — keine sagt etwas über die andere.
  it('does NOT mark the GDPR Art. 32 / NIS2 Art. 21 topical twin as reference-linked despite maximal similarity', () => {
    const twin = pairOf(dsgvo32, nis221);
    expect(twin.a.embedding).toEqual(twin.b.embedding); // maximal ähnlich, per Konstruktion
    expect(detectPairReference(twin)).toBeUndefined();
  });

  it('marks a pair as reference-linked and records which side did the referencing', () => {
    const ev = detectPairReference(pairOf(doraArt1, nis2Art4));
    expect(ev).toBeDefined();
    // dora:art-1 < nis2:art-4 → dora ist Seite a und zitiert NIS2.
    expect(ev?.aReferencesB).toBe(true);
    expect(ev?.bReferencesA).toBe(false);
    expect(ev?.side).toBe('a');
  });

  it('records side "both" when each provision references the other law', () => {
    const mutualA = paraWithText(
      'dora:art-9',
      'dora',
      20,
      'This Regulation applies without prejudice to Directive (EU) 2022/2555 as regards incident reporting.',
    );
    const mutualB = paraWithText(
      'nis2:art-9',
      'nis2',
      160,
      'This Directive shall not apply to entities covered by Regulation (EU) 2022/2554 in respect of ICT risk management.',
    );
    const ev = detectPairReference(pairOf(mutualA, mutualB));
    expect(ev?.aReferencesB).toBe(true);
    expect(ev?.bReferencesA).toBe(true);
    expect(ev?.side).toBe('both');
  });

  it('flags a pinpoint when the citation names exactly the other provision', () => {
    const nis2Art3 = paraWithText(
      'nis2:art-3',
      'nis2',
      170,
      'Member States shall by 17 April 2025 establish a list of essential and important entities.',
    );
    const pinpointed = detectPairReference(pairOf(doraArt1, nis2Art3));
    expect(pinpointed?.pinpoint).toBe(true); // "Article 3 of Directive (EU) 2022/2555"
    const generic = detectPairReference(pairOf(doraArt1, nis2Art4));
    expect(generic?.pinpoint).toBe(false); // zitiert NIS2, aber nicht dessen Art. 4
  });
});

describe('selectCandidatesWithReferences', () => {
  // Ein Referenz-Paar mit ABSICHTLICH niedriger Similarity, damit der Test
  // beweist: es überlebt die Auswahl, obwohl das reine Similarity-Ranking es
  // ans Ende sortiert hätte.
  const doraRef = paraWithText(
    'dora:art-1',
    'dora',
    5,
    'Pursuant to Article 3 of Directive (EU) 2022/2555, this Regulation shall be considered a sector-specific Union legal act.',
  );
  const doraPlain = lawAParas.slice(1);
  const nis2All = lawBParas;

  const rankedRef = rankCandidatePairs([doraRef, ...doraPlain], nis2All);

  it('selects reference-linked pairs even when their similarity is low', () => {
    const { pairs, stats } = selectCandidatesWithReferences(rankedRef, {
      targetSize: 8,
      negativeShare: 0.3,
      seed: 42,
    });
    expect(stats.reference).toBeGreaterThan(0);
    const refPairs = pairs.filter((p) => p.bucket === 'reference');
    expect(refPairs.length).toBe(stats.reference);
    // dora:art-1 zitiert NIS2 → jedes seiner Paare ist referenz-verknüpft,
    // auch das mit der schlechtesten Similarity der ganzen Rangliste.
    const worst = [...rankedRef].reverse().find((p) => p.a.regulationKey === 'dora:art-1');
    expect(worst).toBeDefined();
    const worstIsSelectable = rankedRef
      .filter((p) => p.a.regulationKey === 'dora:art-1' || p.b.regulationKey === 'dora:art-1')
      .every((p) => detectPairReference(p) !== undefined);
    expect(worstIsSelectable).toBe(true);
  });

  it('reports a composition of reference-linked pairs plus similarity negatives', () => {
    const { pairs, stats } = selectCandidatesWithReferences(rankedRef, {
      targetSize: 10,
      negativeShare: 0.3,
      seed: 42,
    });
    expect(stats.reference + stats.negative + stats.anchor + stats.similar).toBe(pairs.length);
    expect(stats.negative).toBeGreaterThan(0);
    const neg = pairs.filter((p) => p.bucket === 'negative');
    expect(neg).toHaveLength(stats.negative);
  });

  it('always includes configured anchors', () => {
    const { pairs } = selectCandidatesWithReferences(rankedRef, {
      targetSize: 3,
      anchors: [['dora:art-6', 'nis2:art-2']],
      seed: 42,
    });
    const anchor = pairs.find((p) => p.a.regulationKey === 'dora:art-6' && p.b.regulationKey === 'nis2:art-2');
    expect(anchor).toBeDefined();
    expect(anchor?.bucket).toBe('anchor');
  });

  it('throws when a configured anchor pair is not present among the ranked candidates', () => {
    expect(() =>
      selectCandidatesWithReferences(rankedRef, { targetSize: 5, anchors: [['dora:art-99', 'nis2:art-1']] }),
    ).toThrow(/dora:art-99/);
  });

  it('is deterministic for the same seed and differs for another', () => {
    const a1 = selectCandidatesWithReferences(rankedRef, { targetSize: 12, seed: 42 }).pairs.map(pairKey);
    const a2 = selectCandidatesWithReferences(rankedRef, { targetSize: 12, seed: 42 }).pairs.map(pairKey);
    const b = selectCandidatesWithReferences(rankedRef, { targetSize: 12, seed: 7 }).pairs.map(pairKey);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });

  it('never returns duplicate pairs', () => {
    const { pairs } = selectCandidatesWithReferences(rankedRef, {
      targetSize: 30,
      anchors: [['dora:art-6', 'nis2:art-2']],
      seed: 42,
    });
    expect(new Set(pairs.map(pairKey)).size).toBe(pairs.length);
  });

  it('carries the reference evidence on the selected pair so raters see WHY it was picked', () => {
    const { pairs } = selectCandidatesWithReferences(rankedRef, { targetSize: 8, seed: 42 });
    const ref = pairs.find((p) => p.bucket === 'reference');
    expect(ref?.reference).toBeDefined();
    expect(['a', 'b', 'both']).toContain(ref?.reference?.side);
  });
});
