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
  normalizeArticleNumber,
  selectCandidatesWithPinpoints,
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

  // Verifiziert am echten CRA-Art.-12-Text: dort steht „… gemäß Artikel 32
  // Absatz 3 der vorliegenden Verordnung unterliegen, und auch nach Artikel 6
  // der Verordnung (EU) 2024/1689 …". Die 32 gehört dem ZITIERENDEN Gesetz.
  // Ohne diesen Filter wurde CRA Art. 12 mit AI-Act Art. 32 verknüpft — ein
  // Paar, das der Text nie behauptet.
  it('ignores an article number that the text assigns to the citing law itself', () => {
    const hits = referencesLaw(
      'Produkte, die den Konformitätsbewertungsverfahren gemäß Artikel 32 Absatz 3 der vorliegenden Verordnung unterliegen, und auch nach Artikel 6 der Verordnung (EU) 2024/1689 als Hochrisiko-KI-Systeme eingestuft sind',
      'ai-act-de',
    );
    const hints = hits.flatMap((h) => h.articleHints);
    expect(hints).toContain('6'); // gehört zur zitierten Norm
    expect(hints).not.toContain('32'); // gehört zur zitierenden Norm
  });

  it('applies the same filter to the english "of this Regulation" phrasing', () => {
    const hits = referencesLaw(
      'entities subject to Article 20 of this Regulation shall also comply with Directive (EU) 2022/2555',
      'nis2',
    );
    expect(hits.flatMap((h) => h.articleHints)).not.toContain('20');
  });

  it('keeps "der genannten Verordnung", which points at the foreign norm, not at the citing one', () => {
    const hits = referencesLaw(
      'gemäß Artikel 43 der genannten Verordnung gilt das Verfahren der Verordnung (EU) 2024/1689',
      'ai-act-de',
    );
    expect(hits.flatMap((h) => h.articleHints)).toContain('43');
  });

  it('returns no hits for a source without registered reference patterns', () => {
    expect(referencesLaw('Verordnung (EU) 2016/679', 'does-not-exist')).toHaveLength(0);
  });
});

// Die Normalisierung ist der Angelpunkt der Pinpoint-Auswahl: links steht ein
// aus Fließtext gefischter Hinweis („Artikel 15"), rechts ein Korpus-Feld
// („Art. 15"). Passen die beiden Schreibweisen nicht zusammen, verpufft die
// ganze Pinpoint-Logik still — deshalb hat der Helfer eigene Tests.
describe('normalizeArticleNumber', () => {
  it('normalises every spelling the two sides can arrive in to the bare number', () => {
    expect(normalizeArticleNumber('15')).toBe('15');
    expect(normalizeArticleNumber('Article 15')).toBe('15');
    expect(normalizeArticleNumber('Artikel 15')).toBe('15');
    expect(normalizeArticleNumber('Art. 15')).toBe('15');
    expect(normalizeArticleNumber('art 15')).toBe('15');
    expect(normalizeArticleNumber('§ 3')).toBe('3'); // LkSG-Schreibweise
    expect(normalizeArticleNumber('§3')).toBe('3');
    expect(normalizeArticleNumber('art-15')).toBe('15'); // slugifizierter regulationKey-Teil
  });

  it('keeps a letter suffix, because Art. 15 and Art. 15a are different provisions', () => {
    expect(normalizeArticleNumber('Art. 15a')).toBe('15a');
    expect(normalizeArticleNumber('Artikel 15a')).toBe('15a');
    expect(normalizeArticleNumber('Art. 15a')).not.toBe(normalizeArticleNumber('Art. 15'));
  });

  it('does not invent a number where there is none — ein Fehltreffer wiegt schwerer als ein verpasster Treffer', () => {
    expect(normalizeArticleNumber('')).toBeUndefined();
    expect(normalizeArticleNumber('Anhang III')).toBeUndefined();
    expect(normalizeArticleNumber('Annex I')).toBeUndefined();
    expect(normalizeArticleNumber('Erwägungsgrund')).toBeUndefined();
  });

  it('ignores leading zeros so "Art. 06" and "Article 6" are the same provision', () => {
    expect(normalizeArticleNumber('Art. 06')).toBe('6');
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


// ─── Pinpoint-getriebene Auswahl (THE-433, Nachschärfung) ────────────
//
// Der erste referenz-getriebene Wurf hat auf LAW-Ebene verknüpft: zitiert
// Provision A das Gesetz B, galt A als verknüpft mit JEDER Provision von B.
// Das ist eine 1:N-Explosion. Gemessene Folge im echten Set: CRA Art. 12 nennt
// AI-Act Art. 6 und 15 — im Set stand es mit ZEHN AI-Act-Artikeln. Auf dem
// richtigen Paar waren sich beide Rater einig; die Uneinigkeit saß komplett auf
// den willkürlichen Paaren, wo ein Rater korrekt „keine Beziehung" sagte und der
// andere zum vagesten verfügbaren Typ griff. CONCRETIZES kam dadurch auf Kappa
// −0,035 (n=11), also Zufallsniveau, weil es als Auffangtyp für Paare diente,
// die gar keine Positive hätten sein dürfen.
//
// Konsequenz: Eine Zitierung, die einen Artikel BENENNT, verknüpft nur mit
// GENAU diesem Artikel. Eine Zitierung ohne Artikelnummer (law-level mention)
// ist nach RUBRIC.md RULE 1 („verweist eine Provision auf die ANDERE NORM?")
// kein Positiv-Kandidat und darf auch nicht als einer gezählt werden.

describe('pinpoint linking — CRA Art. 12 → AI Act Art. 15 (real corpus case)', () => {
  // Der reale Fall, der den Fehler sichtbar gemacht hat. Der Fixture-Text nennt
  // ausschließlich Artikel 15 — genau ein Gegenüber darf verknüpft sein.
  const cra12 = paraWithText(
    'cra-de:art-12',
    'cra-de',
    30,
    'Produkte mit digitalen Elementen, die als Hochrisiko-KI-Systeme eingestuft werden, gelten als konform mit den Cybersicherheitsanforderungen nach Artikel 15 der Verordnung (EU) 2024/1689, sofern sie die grundlegenden Anforderungen dieses Anhangs erfüllen.',
  );
  const aiAct = (n: string, angle: number) =>
    paraWithText(
      `ai-act-de:art-${n}`,
      'ai-act-de',
      angle,
      `Text des Artikels ${n} der KI-Verordnung, lang genug um realistisch zu sein und ohne Zitat eines anderen Gesetzes.`,
    );

  const counterparts = [aiAct('6', 31), aiAct('15', 120), aiAct('16', 32), aiAct('42', 33), aiAct('47', 34)];

  function pairWith(counterpart: CandidateParagraph): RankedPair {
    const [a, b] = cra12.regulationKey < counterpart.regulationKey ? [cra12, counterpart] : [counterpart, cra12];
    return { a, b, score: 0.5 };
  }

  it('marks only the named article as pinpoint-linked, not every article of the cited law', () => {
    const art15 = detectPairReference(pairWith(counterparts[1]));
    expect(art15?.pinpoint).toBe(true);

    for (const other of [counterparts[0], counterparts[2], counterparts[3], counterparts[4]]) {
      const ev = detectPairReference(pairWith(other));
      // Die Zitierung wird weiterhin gesehen (das Gesetz IST genannt) …
      expect(ev).toBeDefined();
      // … aber sie benennt diese Provision nicht: kein Positiv-Kandidat.
      expect(ev?.pinpoint).toBe(false);
    }
  });

  it('records which article the citation pinpointed, so a rater can check the claim', () => {
    const ev = detectPairReference(pairWith(counterparts[1]));
    expect(ev?.pinpointArticles).toEqual(['15']);
  });

  it('puts only Art. 15 into the positive pool — the other four never become positives', () => {
    const ranked = [...counterparts].map(pairWith);
    const { pairs, stats } = selectCandidatesWithPinpoints(ranked, {
      targetSize: 5,
      negativeShare: 0,
      seed: 42,
    });
    expect(stats.pinpointAvailable).toBe(1);
    expect(stats.lawLevelMentions).toBe(4);
    const positives = pairs.filter((p) => p.bucket === 'pinpoint');
    expect(positives).toHaveLength(1);
    expect(positives[0].a.regulationKey === 'ai-act-de:art-15' || positives[0].b.regulationKey === 'ai-act-de:art-15').toBe(
      true,
    );
  });
});

describe('selectCandidatesWithPinpoints', () => {
  // Ein Pinpoint-Paar mit ABSICHTLICH niedriger Similarity: der Test beweist,
  // dass es die Auswahl überlebt, obwohl reines Similarity-Ranking es ans Ende
  // sortiert hätte. dora:art-1 nennt „Article 3 of Directive (EU) 2022/2555" —
  // also ist GENAU nis2:art-3 verknüpft, die übrigen fünf NIS2-Artikel nicht.
  const doraRef = paraWithText(
    'dora:art-1',
    'dora',
    5,
    'Pursuant to Article 3 of Directive (EU) 2022/2555, this Regulation shall be considered a sector-specific Union legal act.',
  );
  const rankedRef = rankCandidatePairs([doraRef, ...lawAParas.slice(1)], lawBParas);

  it('links the citing provision to the named article only, not to the whole cited law', () => {
    const { pairs, stats } = selectCandidatesWithPinpoints(rankedRef, {
      targetSize: 12,
      negativeShare: 0.3,
      seed: 42,
    });
    expect(stats.pinpointAvailable).toBe(1);
    expect(stats.lawLevelMentions).toBe(5); // dora:art-1 × die fünf übrigen NIS2-Artikel
    const positives = pairs.filter((p) => p.bucket === 'pinpoint');
    expect(positives).toHaveLength(1);
    expect(positives[0].a.regulationKey).toBe('dora:art-1');
    expect(positives[0].b.regulationKey).toBe('nis2:art-3');
  });

  it('never turns a law-level mention into a positive candidate', () => {
    const { pairs } = selectCandidatesWithPinpoints(rankedRef, { targetSize: 30, seed: 42 });
    const lawLevelOnly = pairs.filter((p) => {
      const ev = detectPairReference(p);
      return ev !== undefined && !ev.pinpoint;
    });
    expect(lawLevelOnly.length).toBeGreaterThan(0); // sie sind im Set …
    for (const p of lawLevelOnly) expect(p.bucket).not.toBe('pinpoint'); // … aber nie als Positive
  });

  it('reports a composition of pinpoint positives plus similarity negatives', () => {
    const { pairs, stats } = selectCandidatesWithPinpoints(rankedRef, {
      targetSize: 10,
      negativeShare: 0.3,
      seed: 42,
    });
    expect(stats.anchor + stats.pinpoint + stats.negative).toBe(pairs.length);
    expect(pairs.filter((p) => p.bucket === 'pinpoint')).toHaveLength(stats.pinpoint);
    expect(pairs.filter((p) => p.bucket === 'negative')).toHaveLength(stats.negative);
    expect(pairs.filter((p) => p.bucket === 'anchor')).toHaveLength(stats.anchor);
    expect(stats.negative).toBeGreaterThan(0);
  });

  it('reports how many pinpoint pairs EXISTED versus how much budget they had', () => {
    const { stats } = selectCandidatesWithPinpoints(rankedRef, {
      targetSize: 10,
      negativeShare: 0.3,
      seed: 42,
    });
    // 10 Plätze, 30% Negativ-Quote → 7 Plätze für Positive, aber nur 1 echtes
    // Pinpoint-Paar existiert. Genau diese Lücke muss sichtbar sein.
    expect(stats.pinpointBudget).toBe(7);
    expect(stats.pinpointAvailable).toBe(1);
    expect(stats.pinpoint).toBe(1);
  });

  it('reports a shortfall instead of padding when the pool cannot fill the target', () => {
    const { pairs, stats } = selectCandidatesWithPinpoints(rankedRef, { targetSize: 500, seed: 42 });
    expect(pairs).toHaveLength(rankedRef.length);
    expect(stats.shortfall).toBe(500 - rankedRef.length);
  });

  it('always includes configured anchors', () => {
    const { pairs } = selectCandidatesWithPinpoints(rankedRef, {
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
      selectCandidatesWithPinpoints(rankedRef, { targetSize: 5, anchors: [['dora:art-99', 'nis2:art-1']] }),
    ).toThrow(/dora:art-99/);
  });

  it('is deterministic for the same seed and differs for another', () => {
    const a1 = selectCandidatesWithPinpoints(rankedRef, { targetSize: 12, seed: 42 }).pairs.map(pairKey);
    const a2 = selectCandidatesWithPinpoints(rankedRef, { targetSize: 12, seed: 42 }).pairs.map(pairKey);
    const b = selectCandidatesWithPinpoints(rankedRef, { targetSize: 12, seed: 7 }).pairs.map(pairKey);
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });

  it('never returns duplicate pairs', () => {
    const { pairs } = selectCandidatesWithPinpoints(rankedRef, {
      targetSize: 30,
      anchors: [['dora:art-6', 'nis2:art-2']],
      seed: 42,
    });
    expect(new Set(pairs.map(pairKey)).size).toBe(pairs.length);
  });

  it('carries the reference evidence on the selected positive so raters see WHY it was picked', () => {
    const { pairs } = selectCandidatesWithPinpoints(rankedRef, { targetSize: 8, seed: 42 });
    const ref = pairs.find((p) => p.bucket === 'pinpoint');
    expect(ref?.reference).toBeDefined();
    expect(ref?.reference?.pinpoint).toBe(true);
    expect(['a', 'b', 'both']).toContain(ref?.reference?.side);
  });
});
