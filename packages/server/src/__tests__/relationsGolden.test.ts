/**
 * Relations-Golden Schema/Loader — THE-421 Task 11 (second ground-truth set).
 *
 * Run: cd packages/server && npx jest src/__tests__/relationsGolden.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RelationsGoldenSetSchema,
  RelationsGoldenCaseSchema,
  loadRelationsGolden,
  relationsGoldenStats,
  findDuplicateCaseIds,
  relationLabelForKappa,
  RelationsGoldenError,
  type RelationsGoldenSet,
} from '../evals/relationsGolden';

const sideA = {
  regulationKey: 'dora:art-1',
  source: 'dora',
  paragraphNumber: 'art-1',
  fullText: 'Diese Verordnung regelt die Anforderungen an die digitale operationale Resilienz von Finanzunternehmen.',
  language: 'de' as const,
};

const sideB = {
  regulationKey: 'nis2:art-1',
  source: 'nis2',
  paragraphNumber: 'art-1',
  fullText: 'This Directive lays down measures with a view to achieving a high common level of cybersecurity across the Union.',
  language: 'en' as const,
};

const baseCase = {
  caseId: 'dora-nis2-art1',
  a: sideA,
  b: sideB,
};

const validSet: RelationsGoldenSet = {
  version: 'v1',
  frozen: false,
  ontologyVersion: '1.5.0',
  rubricRef: 'RUBRIC.md',
  cases: [baseCase],
};

describe('RelationsGoldenCaseSchema — label states', () => {
  it('accepts a labeled pair (relation + direction)', () => {
    const c = { ...baseCase, relation: 'DEROGATED_BY', direction: 'b-to-a' };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(true);
  });

  it('accepts the negative class (relation: null, no direction)', () => {
    const c = { ...baseCase, relation: null };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(true);
  });

  it('accepts a fully open case (relation absent — draft state)', () => {
    expect(RelationsGoldenCaseSchema.safeParse(baseCase).success).toBe(true);
  });
});

describe('RelationsGoldenCaseSchema — ontology gate', () => {
  it('rejects a metadata relation (AMENDS) — must never be model-produced', () => {
    const c = { ...baseCase, relation: 'AMENDS', direction: 'a-to-b' };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });

  it('rejects a relation id outside the ontology', () => {
    const c = { ...baseCase, relation: 'FRIENDS_WITH', direction: 'a-to-b' };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });
});

describe('RelationsGoldenCaseSchema — direction gate', () => {
  it('rejects relation set without direction', () => {
    const c = { ...baseCase, relation: 'DEROGATED_BY' };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });

  it('rejects direction present when relation is null', () => {
    const c = { ...baseCase, relation: null, direction: 'a-to-b' };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });
});

describe('RelationsGoldenCaseSchema — pair identity gates', () => {
  it('rejects an unsorted pair (a.regulationKey > b.regulationKey)', () => {
    const c = { ...baseCase, a: sideB, b: sideA };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });

  it('rejects a pair whose two sides come from the same law', () => {
    const sameLawB = { ...sideB, regulationKey: 'dora:art-2', source: 'dora' };
    const c = { ...baseCase, b: sameLawB };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });
});

describe('RelationsGoldenSetSchema', () => {
  it('accepts a well-formed set', () => {
    expect(RelationsGoldenSetSchema.safeParse(validSet).success).toBe(true);
  });

  it('requires ontologyVersion', () => {
    const { ontologyVersion, ...noVer } = validSet;
    expect(RelationsGoldenSetSchema.safeParse(noVer).success).toBe(false);
  });
});

describe('loadRelationsGolden', () => {
  const tmp = path.join(os.tmpdir(), `relations-golden-${process.pid}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('loads + validates a file', () => {
    fs.writeFileSync(tmp, JSON.stringify(validSet));
    expect(loadRelationsGolden(tmp).cases).toHaveLength(1);
  });

  it('throws on duplicate caseIds', () => {
    fs.writeFileSync(tmp, JSON.stringify({ ...validSet, cases: [baseCase, baseCase] }));
    expect(() => loadRelationsGolden(tmp)).toThrow(RelationsGoldenError);
  });

  it('throws on missing file', () => {
    expect(() => loadRelationsGolden('/no/such/file.json')).toThrow(RelationsGoldenError);
  });
});

describe('findDuplicateCaseIds', () => {
  it('flags repeats', () => {
    expect(findDuplicateCaseIds([baseCase, baseCase] as any)).toEqual(['dora-nis2-art1']);
    expect(findDuplicateCaseIds([baseCase] as any)).toEqual([]);
  });
});

describe('relationsGoldenStats', () => {
  it('counts per relation type, negative share and open share', () => {
    const set: RelationsGoldenSet = {
      ...validSet,
      cases: [
        { ...baseCase, relation: 'DEROGATED_BY', direction: 'b-to-a' },
        { ...baseCase, caseId: 'dora-nis2-art2', relation: 'DEROGATED_BY', direction: 'b-to-a' },
        { ...baseCase, caseId: 'dora-nis2-art3', relation: null },
        { ...baseCase, caseId: 'dora-nis2-art4' }, // open
      ],
    };
    const s = relationsGoldenStats(set);
    expect(s.total).toBe(4);
    expect(s.byRelationType).toEqual({ DEROGATED_BY: 2 });
    expect(s.negatives).toBe(1);
    expect(s.negativeShare).toBeCloseTo(0.25);
    expect(s.open).toBe(1);
    expect(s.openShare).toBeCloseTo(0.25);
  });
});

describe('relationLabelForKappa', () => {
  it('returns __none__ for the negative class', () => {
    expect(relationLabelForKappa({ ...baseCase, relation: null } as any)).toBe('__none__');
  });

  it('returns __open__ for the draft state', () => {
    expect(relationLabelForKappa(baseCase as any)).toBe('__open__');
  });

  it('returns type:direction for a labeled relation', () => {
    const c = { ...baseCase, relation: 'DEROGATED_BY', direction: 'b-to-a' } as any;
    expect(relationLabelForKappa(c)).toBe('DEROGATED_BY:b-to-a');
  });
});

// ─── THE-519: evidence + languageTwinOf ──────────────────────────────

const interpretsCase = {
  ...baseCase,
  caseId: 'dora-nis2-interprets',
  relation: 'INTERPRETS',
  direction: 'a-to-b' as const,
};

describe('RelationsGoldenCaseSchema — evidence field', () => {
  it('accepts a case with evidence.sentence only', () => {
    const c = { ...interpretsCase, evidence: { sentence: 'Article 3 borrows the term.' } };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(true);
  });

  it('accepts evidence with optional slots and auditPath', () => {
    const c = {
      ...interpretsCase,
      evidence: {
        sentence: 'Article 3 borrows the term "personal data".',
        slots: { term: 'personal data', citedArticle: 'Art. 4' },
        auditPath: 'P0→P1→P2',
      },
    };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(true);
  });

  it('rejects evidence with an empty sentence', () => {
    const c = { ...interpretsCase, evidence: { sentence: '' } };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });

  it('rejects evidence missing sentence', () => {
    const c = { ...interpretsCase, evidence: { slots: { term: 'x' } } };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(false);
  });
});

describe('RelationsGoldenCaseSchema — languageTwinOf', () => {
  it('accepts a case carrying languageTwinOf', () => {
    const c = { ...interpretsCase, languageTwinOf: 'dora-nis2-interprets-en' };
    expect(RelationsGoldenCaseSchema.safeParse(c).success).toBe(true);
  });
});

describe('RelationsGoldenSetSchema — frozen evidence requirement (v5+)', () => {
  it('rejects a frozen v5 set with an INTERPRETS case lacking evidence', () => {
    const set = { ...validSet, version: 'relations.v5', frozen: true, cases: [interpretsCase] };
    expect(RelationsGoldenSetSchema.safeParse(set).success).toBe(false);
  });

  it('accepts a frozen v5 set with an INTERPRETS case carrying evidence.sentence', () => {
    const set = {
      ...validSet,
      version: 'relations.v5',
      frozen: true,
      cases: [{ ...interpretsCase, evidence: { sentence: 'Article 3 borrows the term.' } }],
    };
    expect(RelationsGoldenSetSchema.safeParse(set).success).toBe(true);
  });

  it('grandfathers a frozen PRE-v5 set (relations.v4) with an INTERPRETS case lacking evidence', () => {
    // Der Beleg-Zwang (THE-519) gilt erst ab v5; v1..v4 luden lange ohne Beleg
    // und MÜSSEN weiter laden (v4→v5-Übergang).
    const set = { ...validSet, version: 'relations.v4', frozen: true, cases: [interpretsCase] };
    expect(RelationsGoldenSetSchema.safeParse(set).success).toBe(true);
  });

  it('accepts a NON-frozen v5 set with an INTERPRETS case lacking evidence (rater/draft file)', () => {
    const set = { ...validSet, version: 'relations.v5', frozen: false, cases: [interpretsCase] };
    expect(RelationsGoldenSetSchema.safeParse(set).success).toBe(true);
  });

  it('accepts a frozen v5 set with a null-case (no relation) lacking evidence — only INTERPRETS needs a proof', () => {
    const set = { ...validSet, version: 'relations.v5', frozen: true, cases: [{ ...baseCase, relation: null }] };
    expect(RelationsGoldenSetSchema.safeParse(set).success).toBe(true);
  });
});

describe('loadRelationsGolden — evidence + languageTwinOf round-trip', () => {
  const tmp = path.join(os.tmpdir(), `relations-golden-twin-${process.pid}.json`);
  afterEach(() => {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  });

  it('preserves languageTwinOf and evidence through parse', () => {
    const set = {
      ...validSet,
      frozen: true,
      cases: [
        {
          ...interpretsCase,
          languageTwinOf: 'dora-nis2-interprets-en',
          evidence: {
            sentence: 'Article 3 borrows the term "personal data".',
            slots: { term: 'personal data' },
            auditPath: 'P0→P1→P2',
          },
        },
      ],
    };
    fs.writeFileSync(tmp, JSON.stringify(set));
    const loaded = loadRelationsGolden(tmp);
    const c = loaded.cases[0];
    expect(c.languageTwinOf).toBe('dora-nis2-interprets-en');
    expect(c.evidence).toEqual({
      sentence: 'Article 3 borrows the term "personal data".',
      slots: { term: 'personal data' },
      auditPath: 'P0→P1→P2',
    });
  });
});
