/**
 * build-relations-golden — pure draft-assembly transform (THE-421, Task 12b).
 * Only exercises `buildRelationsDraft` with in-memory `RankedPair` fixtures —
 * no network, no corpus fetch (that's the CLI's `main()`, untested here by
 * design, mirroring buildTypingGolden.test.ts).
 *
 * Run: cd packages/server && npx jest src/__tests__/buildRelationsGolden.test.ts
 */
import { buildRelationsDraft } from '../scripts/build-relations-golden';
import { RelationsGoldenSetSchema } from '../evals/relationsGolden';
import type { CandidateParagraph, RankedPair } from '../evals/relationsCandidates';

const LONG_TEXT = 'Dies ist ein hinreichend langer Provisions-Text zum Testen der Draft-Erzeugung. '.repeat(2);

function candidate(regulationKey: string, source: string, over: Partial<CandidateParagraph> = {}): CandidateParagraph {
  return {
    regulationKey,
    source,
    paragraphNumber: regulationKey.split(':')[1] ?? '1',
    fullText: LONG_TEXT,
    language: 'de',
    embedding: [1, 0],
    ...over,
  };
}

function pair(a: CandidateParagraph, b: CandidateParagraph, score = 0.5): RankedPair {
  return { a, b, score, bucket: 'similar' };
}

describe('buildRelationsDraft', () => {
  const selectedPairs: RankedPair[] = [
    pair(candidate('dora:art-1', 'dora'), candidate('nis2:art-4', 'nis2'), 0.9),
    pair(candidate('dora:art-2', 'dora'), candidate('nis2:art-21', 'nis2'), -0.7),
    pair(candidate('dsgvo:art-32', 'dsgvo'), candidate('nis2:art-21', 'nis2'), 0.6),
  ];

  it('emits schema-valid cases with the relation left open', () => {
    const draft = buildRelationsDraft(selectedPairs);
    expect(RelationsGoldenSetSchema.safeParse(draft).success).toBe(true);
    for (const c of draft.cases) expect(c.relation).toBeUndefined();
  });

  it('enforces the sorted pair convention even if a caller passes an unsorted pair', () => {
    const a = candidate('nis2:art-4', 'nis2');
    const b = candidate('dora:art-1', 'dora');
    // Deliberately construct a RankedPair violating the a < b invariant that
    // rankCandidatePairs/selectCandidates normally guarantee — the builder
    // must defensively re-sort rather than trust the caller.
    const pairWithSidesSwapped: RankedPair = { a, b, score: 0.9, bucket: 'similar' };

    const draft = buildRelationsDraft([pairWithSidesSwapped]);
    expect(draft.cases[0].a.regulationKey < draft.cases[0].b.regulationKey).toBe(true);
    expect(draft.cases[0].a.regulationKey).toBe('dora:art-1');
    expect(draft.cases[0].b.regulationKey).toBe('nis2:art-4');
  });

  it('derives a stable, unique caseId from both regulation keys', () => {
    const draft = buildRelationsDraft(selectedPairs);
    const ids = draft.cases.map((c) => c.caseId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildRelationsDraft(selectedPairs).cases.map((c) => c.caseId)).toEqual(ids);
  });

  it('stamps the ontology version and marks the draft as not frozen', () => {
    const draft = buildRelationsDraft(selectedPairs, { ontologyVersion: '1.4.0' });
    expect(draft.ontologyVersion).toBe('1.4.0');
    expect(draft.frozen).toBe(false);
  });

  it('defaults ontologyVersion from the ontology when not given', () => {
    const draft = buildRelationsDraft(selectedPairs);
    expect(draft.ontologyVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('skips pairs whose text is too short to be labelable', () => {
    const shortA = candidate('dora:art-9', 'dora', { fullText: 'zu kurz' });
    const okB = candidate('nis2:art-9', 'nis2');
    const shortPair = pair(shortA, okB, 0.1);

    const draft = buildRelationsDraft([...selectedPairs, shortPair]);
    expect(draft.cases).toHaveLength(selectedPairs.length);
    expect(draft.cases.some((c) => c.a.regulationKey === 'dora:art-9' || c.b.regulationKey === 'dora:art-9')).toBe(
      false,
    );
  });

  it('drops a pair when either side is too short, not just the short side', () => {
    const okA = candidate('dora:art-10', 'dora');
    const shortB = candidate('nis2:art-10', 'nis2', { fullText: 'kurz' });
    // Mixed in with a valid pair so the assembled draft still satisfies the
    // golden schema's `cases.min(1)` — a draft left with zero labelable
    // cases after filtering is a builder-input problem, not something this
    // test needs to cover.
    const draft = buildRelationsDraft([pair(okA, shortB, 0.1), selectedPairs[0]]);
    expect(draft.cases).toHaveLength(1);
    expect(draft.cases.some((c) => c.a.regulationKey === 'dora:art-10' || c.b.regulationKey === 'dora:art-10')).toBe(
      false,
    );
  });

  it('throws if schema validation fails on the assembled draft (e.g. all candidates filtered out)', () => {
    const tooShort = pair(
      candidate('dora:art-11', 'dora', { fullText: 'kurz' }),
      candidate('nis2:art-11', 'nis2', { fullText: 'kurz' }),
      0.1,
    );
    expect(() => buildRelationsDraft([tooShort])).toThrow();
  });
});
