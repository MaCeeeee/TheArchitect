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
