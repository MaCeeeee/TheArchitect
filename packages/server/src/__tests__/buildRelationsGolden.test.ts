/**
 * build-relations-golden — pure draft-assembly transform (THE-421, Task 12b).
 * Only exercises `buildRelationsDraft` with in-memory `RankedPair` fixtures —
 * no network, no corpus fetch (that's the CLI's `main()`, untested here by
 * design, mirroring buildTypingGolden.test.ts).
 *
 * Run: cd packages/server && npx jest src/__tests__/buildRelationsGolden.test.ts
 */
import { buildRelationsDraft, buildV5FromAudit } from '../scripts/build-relations-golden';
import { RelationsGoldenSetSchema, type RelationsGoldenCase, type RelationsGoldenSet } from '../evals/relationsGolden';
import type { CandidateParagraph, RankedPair } from '../evals/relationsCandidates';
import type { AuditSidecar, SidecarPerCase } from '../scripts/build-interprets-audit';

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

// ─── buildV5FromAudit (THE-519, --from-audit) ────────────────────────────────

function side(regulationKey: string, source: string) {
  return {
    regulationKey,
    source,
    paragraphNumber: regulationKey.split(':')[1] ?? '1',
    fullText: LONG_TEXT,
    language: 'de' as const,
  };
}

function sidecarSide(regulationKey: string, source: string) {
  return { regulationKey, source, paragraphNumber: regulationKey.split(':')[1] ?? '1', language: 'de' as const };
}

function poolWith(...keys: Array<[string, string]>): Map<string, CandidateParagraph[]> {
  const m = new Map<string, CandidateParagraph[]>();
  for (const [regulationKey, source] of keys) {
    const list = m.get(source) ?? [];
    list.push(candidate(regulationKey, source));
    m.set(source, list);
  }
  return m;
}

/** Full-coverage v4 fixture exercising rules 1–3 in one shot. */
function makeV4(): RelationsGoldenSet {
  return {
    version: 'relations.v4',
    frozen: true,
    ontologyVersion: '1.6.0',
    rubricRef: '../RUBRIC.md',
    cases: [
      // (1) v4-INTERPRETS whose direction the audit corrects.
      { caseId: 'aaa:art-1__bbb:art-1', a: side('aaa:art-1', 'aaa'), b: side('bbb:art-1', 'bbb'), relation: 'INTERPRETS', direction: 'a-to-b' },
      // (2) v4-INTERPRETS the audit demotes to none; carries existing notes.
      { caseId: 'ccc:art-2__ddd:art-2', a: side('ccc:art-2', 'ccc'), b: side('ddd:art-2', 'ddd'), relation: 'INTERPRETS', direction: 'a-to-b', notes: 'adjudiziert rp-3' },
      // (3) v4-CONCRETIZES not in the sidecar → untouched.
      { caseId: 'eee:art-3__fff:art-3', a: side('eee:art-3', 'eee'), b: side('fff:art-3', 'fff'), relation: 'CONCRETIZES', direction: 'a-to-b' },
      // (4) v4-none the audit sees as pair-artifact → stays null.
      { caseId: 'kkk:art-6__lll:art-6', a: side('kkk:art-6', 'kkk'), b: side('lll:art-6', 'lll'), relation: null },
    ] as RelationsGoldenCase[],
  } as RelationsGoldenSet;
}

const SLOTS = { operator: 'im Sinne', term: 'personenbezogene Daten', targetLawHit: '2016/679', targetArticle: '1' };

function makeSidecar(perCase: Record<string, Partial<SidecarPerCase> & Pick<SidecarPerCase, 'autoVerdict'>>): AuditSidecar {
  const full: Record<string, SidecarPerCase> = {};
  for (const [caseId, pc] of Object.entries(perCase)) {
    const [aKey, bKey] = caseId.split('__');
    full[caseId] = {
      bucket: 'a-interprets',
      v4Label: undefined,
      slots: SLOTS,
      pPath: 'P0 ✓ · P1 ✓ · P2 ✓',
      a: sidecarSide(aKey.replace('-art-', ':art-'), aKey.split('-art-')[0]),
      b: sidecarSide(bKey.replace('-art-', ':art-'), bKey.split('-art-')[0]),
      ...pc,
    } as SidecarPerCase;
  }
  return {
    generatedFrom: 'relations.v4.json',
    frozenAt: '2026-07-26T00:00:00.000Z',
    caseIds: Object.keys(full),
    counts: { a: 0, b: 0, c: 0, total: Object.keys(full).length },
    perCase: full,
  };
}

describe('buildV5FromAudit', () => {
  it('keeps a v4-INTERPRETS as INTERPRETS, applies the corrected direction, and attaches evidence', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'aaa:art-1__bbb:art-1': {
        autoVerdict: 'interprets',
        direction: 'b-to-a', // v4 had a-to-b — the audit flips it
        citingSentence: 'Beleg-Satz A im Sinne von Artikel 1 der Verordnung (EU) 2016/679.',
        a: sidecarSide('aaa:art-1', 'aaa'),
        b: sidecarSide('bbb:art-1', 'bbb'),
      },
    });
    const v5 = buildV5FromAudit(v4, sidecar, poolWith());
    const c = v5.cases.find((x) => x.caseId === 'aaa:art-1__bbb:art-1')!;
    expect(c.relation).toBe('INTERPRETS');
    expect(c.direction).toBe('b-to-a');
    expect(c.evidence?.sentence).toBe('Beleg-Satz A im Sinne von Artikel 1 der Verordnung (EU) 2016/679.');
    expect(c.evidence?.slots).toMatchObject({ operator: 'im Sinne' });
    expect(c.evidence?.auditPath).toBe('P0 ✓ · P1 ✓ · P2 ✓');
  });

  it('demotes a v4-INTERPRETS to null when the audit verdict is none-usage, dropping direction/evidence and noting it', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'ccc:art-2__ddd:art-2': { autoVerdict: 'none-usage' },
    });
    const v5 = buildV5FromAudit(v4, sidecar, poolWith());
    const c = v5.cases.find((x) => x.caseId === 'ccc:art-2__ddd:art-2')!;
    expect(c.relation).toBeNull();
    expect(c.direction).toBeUndefined();
    expect(c.evidence).toBeUndefined();
    expect(c.notes).toContain('adjudiziert rp-3');
    expect(c.notes).toContain('THE-519: v4-INTERPRETS degradiert (none-usage)');
  });

  it('builds a brand-new INTERPRETS case (not in v4) from the provisions pool', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'ggg:art-4__hhh:art-4': {
        autoVerdict: 'interprets',
        direction: 'a-to-b',
        citingSentence: 'Beleg-Satz G.',
        a: sidecarSide('ggg:art-4', 'ggg'),
        b: sidecarSide('hhh:art-4', 'hhh'),
      },
    });
    const pool = poolWith(['ggg:art-4', 'ggg'], ['hhh:art-4', 'hhh']);
    const v5 = buildV5FromAudit(v4, sidecar, pool);
    const c = v5.cases.find((x) => x.caseId === 'ggg:art-4__hhh:art-4');
    expect(c).toBeDefined();
    expect(c!.relation).toBe('INTERPRETS');
    expect(c!.direction).toBe('a-to-b');
    expect(c!.a.regulationKey).toBe('ggg:art-4');
    expect(c!.b.regulationKey).toBe('hhh:art-4');
    expect(c!.a.fullText.length).toBeGreaterThanOrEqual(50);
    expect(c!.evidence?.sentence).toBe('Beleg-Satz G.');
  });

  it('does NOT admit a new non-INTERPRETS pool candidate (policy-A)', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'iii:art-5__jjj:art-5': { autoVerdict: 'policy-A' },
    });
    const v5 = buildV5FromAudit(v4, sidecar, poolWith(['iii:art-5', 'iii'], ['jjj:art-5', 'jjj']));
    expect(v5.cases.some((x) => x.caseId === 'iii:art-5__jjj:art-5')).toBe(false);
  });

  it('leaves a v4 case that is absent from the sidecar untouched', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({ 'aaa:art-1__bbb:art-1': { autoVerdict: 'interprets', direction: 'a-to-b', citingSentence: 'x'.repeat(3) } });
    const v5 = buildV5FromAudit(v4, sidecar, poolWith());
    const c = v5.cases.find((x) => x.caseId === 'eee:art-3__fff:art-3')!;
    expect(c.relation).toBe('CONCRETIZES');
    expect(c.direction).toBe('a-to-b');
    // The v4 none/pair-artifact case also stays null.
    const k = v5.cases.find((x) => x.caseId === 'kkk:art-6__lll:art-6')!;
    expect(k.relation).toBeNull();
  });

  it('adopts languageTwinOf and excludes twins from the canonical INTERPRETS count', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'ggg:art-4__hhh:art-4': {
        autoVerdict: 'interprets',
        direction: 'a-to-b',
        citingSentence: 'Beleg-Satz G.',
        a: sidecarSide('ggg:art-4', 'ggg'),
        b: sidecarSide('hhh:art-4', 'hhh'),
      },
      'mmm:art-7__nnn:art-7': {
        autoVerdict: 'interprets',
        direction: 'a-to-b',
        citingSentence: 'Beleg-Satz M.',
        languageTwinOf: 'ggg:art-4__hhh:art-4',
        a: sidecarSide('mmm:art-7', 'mmm'),
        b: sidecarSide('nnn:art-7', 'nnn'),
      },
    });
    const pool = poolWith(['ggg:art-4', 'ggg'], ['hhh:art-4', 'hhh'], ['mmm:art-7', 'mmm'], ['nnn:art-7', 'nnn']);
    const v5 = buildV5FromAudit(v4, sidecar, pool);
    const twin = v5.cases.find((x) => x.caseId === 'mmm:art-7__nnn:art-7')!;
    expect(twin.languageTwinOf).toBe('ggg:art-4__hhh:art-4');

    const interpretsTotal = v5.cases.filter((c) => c.relation === 'INTERPRETS').length;
    const canonical = v5.cases.filter((c) => c.relation === 'INTERPRETS' && !c.languageTwinOf).length;
    // aaa (from v4, unchanged INTERPRETS with old direction — still INTERPRETS) is NOT in this sidecar,
    // so it keeps its v4 label; ggg + mmm are the two new ones. Canonical drops the twin.
    expect(interpretsTotal).toBe(canonical + 1);
  });

  it('throws when an INTERPRETS verdict has no citingSentence (no evidence-less INTERPRETS may be created)', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'aaa:art-1__bbb:art-1': { autoVerdict: 'interprets', direction: 'a-to-b' /* no citingSentence */ },
    });
    expect(() => buildV5FromAudit(v4, sidecar, poolWith())).toThrow(/citingSentence/);
  });

  it('preserves v4 order, appends new cases in caseId-sorted order, and parses against the golden schema', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'aaa:art-1__bbb:art-1': { autoVerdict: 'interprets', direction: 'b-to-a', citingSentence: 'Beleg A.' },
      'ccc:art-2__ddd:art-2': { autoVerdict: 'none-usage' },
      'mmm:art-7__nnn:art-7': {
        autoVerdict: 'interprets', direction: 'a-to-b', citingSentence: 'Beleg M.',
        a: sidecarSide('mmm:art-7', 'mmm'), b: sidecarSide('nnn:art-7', 'nnn'),
      },
      'ggg:art-4__hhh:art-4': {
        autoVerdict: 'interprets', direction: 'a-to-b', citingSentence: 'Beleg G.',
        a: sidecarSide('ggg:art-4', 'ggg'), b: sidecarSide('hhh:art-4', 'hhh'),
      },
    });
    const pool = poolWith(['ggg:art-4', 'ggg'], ['hhh:art-4', 'hhh'], ['mmm:art-7', 'mmm'], ['nnn:art-7', 'nnn']);
    const v5 = buildV5FromAudit(v4, sidecar, pool);

    // v4 order preserved for the first four, new cases appended sorted (ggg < mmm).
    expect(v5.cases.slice(0, 4).map((c) => c.caseId)).toEqual([
      'aaa:art-1__bbb:art-1', 'ccc:art-2__ddd:art-2', 'eee:art-3__fff:art-3', 'kkk:art-6__lll:art-6',
    ]);
    expect(v5.cases.slice(4).map((c) => c.caseId)).toEqual(['ggg:art-4__hhh:art-4', 'mmm:art-7__nnn:art-7']);

    expect(v5.version).toBe('relations.v5');
    expect(v5.frozen).toBe(false);
    expect(v5.ontologyVersion).toBe('1.6.0');
    expect(v5.rubricRef).toBe('../RUBRIC.md');

    const parsed = RelationsGoldenSetSchema.safeParse(v5);
    expect(parsed.success).toBe(true);
  });

  it('throws a clear error when a new INTERPRETS case references a provision missing from the pool', () => {
    const v4 = makeV4();
    const sidecar = makeSidecar({
      'ggg:art-4__hhh:art-4': {
        autoVerdict: 'interprets', direction: 'a-to-b', citingSentence: 'Beleg G.',
        a: sidecarSide('ggg:art-4', 'ggg'), b: sidecarSide('hhh:art-4', 'hhh'),
      },
    });
    // Pool missing hhh.
    expect(() => buildV5FromAudit(v4, sidecar, poolWith(['ggg:art-4', 'ggg']))).toThrow(/hhh:art-4/);
  });
});
