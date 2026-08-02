/**
 * Tests für die Nachrechnung des Gold-Abgleichs (THE-545).
 *
 * Die Nachrechnung darf genau eines: aus GESPEICHERTER Gruppierung und NEU
 * bestimmten Handlungen den Abgleich neu ziehen. Sie darf keine Maßnahme
 * entstehen lassen, die im Lauf nicht entstand — sonst wäre sie kein
 * Nachrechnen, sondern ein zweiter Lauf mit weniger Kontrollen.
 */
import { rescore, lawOfId, renderRescoreReport, type RescoreInput } from '../scripts/reqtrace-rescore';

const input = (over: Partial<RescoreInput['grouping']> = {}): RescoreInput => ({
  sysReqTexts: {
    'dsgvo:art32:c01:q1s1': 'Das Unternehmen muss …',
    'nis2:art21:c02:q1s1': 'Das Unternehmen muss …',
    'dora:art6:c01:q1s1': 'Das Unternehmen muss …',
  },
  grouping: {
    measures: [
      {
        id: 'measure__dsgvo:art32:c01:q1s1',
        memberIds: ['dsgvo:art32:c01:q1s1', 'nis2:art21:c02:q1s1'],
        laws: ['dsgvo', 'nis2'],
      },
    ],
    sharedCorePairs: [],
    ...over,
  },
});

describe('lawOfId', () => {
  it('reads the law from the id prefix — same source the grouping uses', () => {
    expect(lawOfId('dsgvo:art32:c01:q1s1')).toBe('dsgvo');
    expect(lawOfId('nis2:art21:c02:q1s1')).toBe('nis2');
  });

  it('does not invent a law for a malformed id', () => {
    expect(lawOfId('kaputt')).toBe('kaputt');
    expect(lawOfId('')).toBe('');
  });
});

describe('rescore (THE-545)', () => {
  it('finds a gold entry when laws AND action line up', () => {
    const r = rescore(input(), {
      'dsgvo:art32:c01:q1s1': 'betriebskontinuitaet',
      'nis2:art21:c02:q1s1': 'betriebskontinuitaet',
      'dora:art6:c01:q1s1': null,
    });
    expect(r.goldHits.find((g) => g.id === 'BCD-01')?.matchedBy).toBe('measure__dsgvo:art32:c01:q1s1');
    expect(r.goldHitCount).toBe(1);
  });

  it('accepts the ALTERNATIVE law set — that is the whole point of the correction', () => {
    // GOV-02 verlangt laut SCF drei Gesetze; erreichbar ist nur dsgvo+nis2
    // ODER dsgvo+dora. Hier liegt die zweite Alternative vor.
    const r = rescore(
      input({
        measures: [
          { id: 'm1', memberIds: ['dsgvo:art32:c01:q1s1', 'dora:art6:c01:q1s1'], laws: ['dsgvo', 'dora'] },
        ],
      }),
      {
        'dsgvo:art32:c01:q1s1': 'compliance-nachweisen',
        'dora:art6:c01:q1s1': 'compliance-nachweisen',
        'nis2:art21:c02:q1s1': null,
      },
    );
    expect(r.goldHits.find((g) => g.id === 'GOV-02')?.matchedBy).toBe('m1');
  });

  it('does NOT count a match when only the action fits but the laws do not', () => {
    const r = rescore(
      input({
        measures: [
          { id: 'm1', memberIds: ['dsgvo:art32:c01:q1s1', 'dora:art6:c01:q1s1'], laws: ['dsgvo', 'dora'] },
        ],
      }),
      {
        'dsgvo:art32:c01:q1s1': 'betriebskontinuitaet', // BCD-01 verlangt dsgvo+nis2
        'dora:art6:c01:q1s1': 'betriebskontinuitaet',
        'nis2:art21:c02:q1s1': null,
      },
    );
    expect(r.goldHits.find((g) => g.id === 'BCD-01')?.matchedBy).toBeNull();
  });

  it('counts a shared-core PAIR, not just a merged measure', () => {
    const r = rescore(
      input({
        measures: [],
        sharedCorePairs: [
          { a: 'dsgvo:art32:c01:q1s1', b: 'nis2:art21:c02:q1s1', relation: 'intersects' },
        ],
      }),
      {
        'dsgvo:art32:c01:q1s1': 'verschluesselung-pseudonymisierung',
        'nis2:art21:c02:q1s1': 'verschluesselung-pseudonymisierung',
        'dora:art6:c01:q1s1': null,
      },
    );
    expect(r.goldHits.find((g) => g.id === 'CRY-01')?.matchedBy).toMatch(/^pair__/);
  });

  it('invents NO measure — only what the run produced is a candidate', () => {
    // Zwei perfekt passende Anforderungen, aber der Lauf hat sie nie gepaart.
    const r = rescore(input({ measures: [], sharedCorePairs: [] }), {
      'dsgvo:art32:c01:q1s1': 'betriebskontinuitaet',
      'nis2:art21:c02:q1s1': 'betriebskontinuitaet',
      'dora:art6:c01:q1s1': null,
    });
    expect(r.goldHitCount).toBe(0);
  });

  it('reports unclassified texts instead of hiding them', () => {
    const r = rescore(input(), {
      'dsgvo:art32:c01:q1s1': 'betriebskontinuitaet',
      'nis2:art21:c02:q1s1': null,
      'dora:art6:c01:q1s1': null,
    });
    expect(r.unclassified).toBe(2);
    expect(r.classified).toBe(1);
  });

  it('flags a measure that spans two actions — the semantic control still applies', () => {
    const r = rescore(input(), {
      'dsgvo:art32:c01:q1s1': 'betriebskontinuitaet',
      'nis2:art21:c02:q1s1': 'risikobewertung',
      'dora:art6:c01:q1s1': null,
    });
    expect(r.negativeSemantic).toBe(false);
  });

  it('names ambiguous matches — three gold entries share one action', () => {
    const r = rescore(input(), {
      'dsgvo:art32:c01:q1s1': 'resilienz-governance',
      'nis2:art21:c02:q1s1': 'resilienz-governance',
      'dora:art6:c01:q1s1': null,
    });
    expect(r.ambiguousGoldMatches).toContain('measure__dsgvo:art32:c01:q1s1');
  });
});

describe('renderRescoreReport', () => {
  const r = rescore(input(), {
    'dsgvo:art32:c01:q1s1': 'betriebskontinuitaet',
    'nis2:art21:c02:q1s1': 'betriebskontinuitaet',
    'dora:art6:c01:q1s1': null,
  });

  it('shows the previous number so the correction stays visible', () => {
    const md = renderRescoreReport(r, { runPath: 'docs/evals/x.json', previousGoldHitCount: 2 });
    expect(md).toContain('Vorher, mit dem adressaten-blinden Gold: 2');
  });

  it('states the second-pass limitation with numbers, not as a footnote', () => {
    const md = renderRescoreReport(r, { runPath: 'x.json', previousGoldHitCount: 2 });
    expect(md).toMatch(/Zweiter Klassifikations-Durchgang/);
    expect(md).toMatch(/nur senken, nie heben/);
  });
});
