/**
 * REQ-METH-001.3 — the ladder: rungs in order, cohomology only on top of rungs 0–4.
 * Run: cd packages/server && npx jest src/__tests__/topologyLadder.test.ts
 */
import { assessLadder, LadderInput } from '../services/topology/ladder';
import type { ModelElement, ModelRelationship } from '../services/topology/contextComplex';

const NOW = new Date('2026-11-20T12:00:00Z');
const ctx = (id: string, name: string): ModelElement => ({ id, name, type: 'grouping' });
const obj = (id: string, name = id): ModelElement => ({ id, name, type: 'business_object' });
const has = (context: string, member: string): ModelRelationship =>
  ({ id: `${context}-has-${member}`, sourceId: context, targetId: member, type: 'composition' });
const tr = (id: string, from: string, to: string, factor: number, quantity?: string): ModelRelationship =>
  ({ id, sourceId: from, targetId: to, type: 'association', translationFactor: factor, translationQuantity: quantity });

const contexts = [ctx('te', 'TE'), ctx('prod', 'Produktion'), ctx('log', 'Logistik')];
const ownMembers = [obj('bom'), obj('order'), obj('delivery')];
const ownMembership = [has('te', 'bom'), has('prod', 'order'), has('log', 'delivery')];
const landkarteTranslations = [tr('t1', 'te', 'prod', 1), tr('t2', 'prod', 'log', 10), tr('t3', 'te', 'log', 12)];

const input = (p: Partial<LadderInput>): LadderInput => ({ elements: [], relationships: [], fieldCounts: {}, ...p });
const statuses = (r: ReturnType<typeof assessLadder>) => r.rungs.map((rung) => rung.status);

describe('assessLadder — rungs', () => {
  test('empty model: rung 0 open, everything above locked, no cohomology', () => {
    const r = assessLadder('p', input({}), NOW);
    expect(statuses(r)).toEqual(['open', 'locked', 'locked', 'locked', 'locked', 'locked']);
    expect(r.highestRung).toBeNull();
    expect(r.cohomology).toEqual([]);
    expect(r.rungs[0].next).toBe('Add elements to the model.');
    expect(r.timestamp).toBe('2026-11-20T12:00:00.000Z');
  });

  test('a plain model with relationships stops at rung 1 and says what rung 2 needs', () => {
    const r = assessLadder('p', input({
      elements: [obj('a'), obj('b'), obj('c'), obj('d')],
      relationships: [
        { id: 'r1', sourceId: 'a', targetId: 'b', type: 'serving' },
        { id: 'r2', sourceId: 'b', targetId: 'c', type: 'serving' },
        { id: 'r3', sourceId: 'a', targetId: 'c', type: 'serving' },
      ],
    }), NOW);
    expect(statuses(r)).toEqual(['reached', 'reached', 'open', 'locked', 'locked', 'locked']);
    expect(r.highestRung).toBe(1);
    expect(r.rungs[1].facts).toEqual([
      { label: 'relationships', value: 3 },
      { label: 'connected components (b0)', value: 2 },
      { label: 'independent loops (b1)', value: 1 },
      { label: 'self-loops', value: 0 },
    ]);
    expect(r.rungs[2].next).toContain('grouping or location');
    expect(r.rungs[1].next).toBeNull();
  });

  test('duplicate names are a warning on rung 0, dangling relationships on rung 1', () => {
    const r = assessLadder('p', input({
      elements: [obj('a', 'ERP'), obj('b', ' erp '), obj('c', 'CRM')],
      relationships: [{ id: 'r1', sourceId: 'a', targetId: 'c', type: 'flow' }, { id: 'r2', sourceId: 'a', targetId: 'ghost', type: 'flow' }],
    }), NOW);
    expect(r.rungs[0].facts[1]).toEqual({ label: 'duplicate names', value: 1 });
    expect(r.rungs[0].warnings[0]).toContain('1 element name(s) occur more than once');
    expect(r.rungs[1].warnings[0]).toContain('1 relationship(s) point to elements that do not exist');
    expect(r.rungs[1].facts[0].value).toBe(1);
  });

  test('contexts without members do not make a cover; their translations are unusable', () => {
    const r = assessLadder('p', input({ elements: contexts, relationships: landkarteTranslations }), NOW);
    expect(statuses(r)).toEqual(['reached', 'reached', 'open', 'locked', 'locked', 'locked']);
    expect(r.cohomology).toEqual([]);
    expect(r.methods.find((m) => m.methodId === 'PA-kategorientheorie')!.status).toBe('missing_input');
  });

  test('cover without translations stops at rung 2; one translation without a loop stops at rung 3', () => {
    const cover = { elements: [...contexts, ...ownMembers], relationships: ownMembership };
    expect(assessLadder('p', input(cover), NOW).highestRung).toBe(2);
    const one = assessLadder('p', input({ ...cover, relationships: [...ownMembership, tr('t1', 'te', 'prod', 1)] }), NOW);
    expect(one.highestRung).toBe(3);
    expect(one.rungs[4].status).toBe('open');
    expect(one.rungs[4].next).toContain('close a loop');
  });
});

describe('assessLadder — cohomology (Landkarte 7.7)', () => {
  test('separate members: every rung reached, global obstruction, the loop names all three translations', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, ...landkarteTranslations],
    }), NOW);
    expect(statuses(r)).toEqual(['reached', 'reached', 'reached', 'reached', 'reached', 'reached']);
    expect(r.highestRung).toBe(5);
    expect(r.cohomology).toHaveLength(1);
    const c = r.cohomology[0];
    expect(c.verdict).toBe('global_obstruction');
    expect(c.contextCount).toBe(3);
    expect(c.translationCount).toBe(3);
    expect(c.independentLoops).toBe(1);
    expect(c.faces).toBe(0);
    expect(c.h1Dimension).toBe(1);
    expect(c.canonicalScale).toBeNull();
    expect(r.tolerance).toBe(1e-6);
    expect(c.loopDefects).toHaveLength(1);
    expect(c.loopDefects[0].steps.map((s) => s.relationshipId).sort()).toEqual(['t1', 't2', 't3']);
    const product = c.loopDefects[0].product;
    expect(Math.max(product, 1 / product)).toBeCloseTo(1.2, 9);
    const t3 = c.loopDefects[0].steps.find((s) => s.relationshipId === 't3')!;
    expect(t3.factor).toBe(12);
    expect([t3.fromContext, t3.toContext].sort()).toEqual(['Logistik', 'TE']);
    expect(r.cohomologyMethod.id).toBe('PA-kategorientheorie');
    expect(r.rungs[5].facts[3]).toEqual({ label: 'with global obstruction', value: 1 });
  });

  test('a member shared by all three contexts turns the same data into a local defect', () => {
    const shared = obj('material');
    const r = assessLadder('p', input({
      elements: [...contexts, shared],
      relationships: [has('te', 'material'), has('prod', 'material'), has('log', 'material'), ...landkarteTranslations],
    }), NOW);
    const c = r.cohomology[0];
    expect(c.verdict).toBe('local_defect');
    expect(c.faces).toBe(1);
    expect(c.h1Dimension).toBe(0); // the only loop is filled: nothing global can remain
    expect(c.faceDefects).toHaveLength(1);
    expect(c.faceDefects[0].steps).toHaveLength(3);
    expect(r.rungs[2].facts[3]).toEqual({ label: 'triple overlaps', value: 1 });
  });

  test('corrected translation: exact, with one canonical scale per context', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, tr('t1', 'te', 'prod', 1), tr('t2', 'prod', 'log', 10), tr('t3', 'te', 'log', 10)],
    }), NOW);
    const c = r.cohomology[0];
    expect(c.verdict).toBe('exact');
    expect(c.loopDefects).toEqual([]);
    const scale = Object.fromEntries(c.canonicalScale!.map((s) => [s.contextName, Math.round(s.factor * 1e6) / 1e6]));
    expect(scale).toEqual({ TE: 1, Produktion: 1, Logistik: 10 });
    expect(c.canonicalScale!.every((s) => s.component === 1)).toBe(true);
  });

  test('the canonical scale does not depend on ids or on the direction of the declarations', () => {
    const r = assessLadder('p', input({
      elements: [ctx('z', 'TE'), ctx('m', 'Produktion'), ctx('a', 'Logistik'), obj('o1'), obj('o2'), obj('o3')],
      relationships: [
        has('z', 'o1'), has('m', 'o2'), has('a', 'o3'),
        tr('t1', 'm', 'z', 1), tr('t2', 'a', 'm', 0.1), tr('t3', 'z', 'a', 10),
      ],
    }), NOW);
    const c = r.cohomology[0];
    expect(c.verdict).toBe('exact');
    const scale = Object.fromEntries(c.canonicalScale!.map((s) => [s.contextName, Math.round(s.factor * 1e6) / 1e6]));
    expect(scale).toEqual({ TE: 1, Produktion: 1, Logistik: 10 });
  });

  test('two separate groups of contexts get their own scale, each starting at 1', () => {
    const r = assessLadder('p', input({
      elements: [ctx('a', 'A'), ctx('b', 'B'), ctx('c', 'C'), ctx('d', 'D'), obj('o1'), obj('o2'), obj('o3'), obj('o4')],
      relationships: [
        has('a', 'o1'), has('b', 'o2'), has('c', 'o3'), has('d', 'o4'),
        tr('ab', 'a', 'b', 4), tr('ba', 'b', 'a', 0.25),
        tr('cd', 'c', 'd', 0.5), tr('dc', 'd', 'c', 2),
      ],
    }), NOW);
    const c = r.cohomology[0];
    expect(c.verdict).toBe('exact');
    const byName = Object.fromEntries(c.canonicalScale!.map((s) => [s.contextName, [s.component, Math.round(s.factor * 1e6) / 1e6]]));
    expect(byName).toEqual({ A: [1, 1], B: [1, 4], C: [2, 2], D: [2, 1] });
  });

  test('rounded reciprocal factors are not a contradiction; a real difference is', () => {
    const pair = (back: number) => assessLadder('p', input({
      elements: [ctx('m', 'Metric'), ctx('i', 'Imperial'), obj('o1'), obj('o2')],
      relationships: [has('m', 'o1'), has('i', 'o2'), tr('mi', 'm', 'i', 3.28084), tr('im', 'i', 'm', back)],
    }), NOW).cohomology[0];
    expect(pair(0.3048).verdict).toBe('exact'); // 3.28084 × 0.3048 = 1.00000003
    const off = pair(0.3);
    expect(off.verdict).toBe('global_obstruction');
    expect(off.loopDefects[0].steps).toHaveLength(2);
  });

  test('a quantity whose translations close no loop is not reported as consistent', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [
        ...ownMembership,
        tr('p1', 'te', 'prod', 1, 'pieces'), tr('p2', 'prod', 'log', 10, 'pieces'), tr('p3', 'te', 'log', 10, 'pieces'),
        tr('c1', 'te', 'prod', 1.1, 'currency'),
      ],
    }), NOW);
    expect(r.cohomology.map((c) => c.quantity)).toEqual(['pieces']);
    expect(r.rungs[4].facts).toEqual([
      { label: 'loops and faces to check', value: 1 },
      { label: 'quantities without a loop', value: 1 },
      { label: 'overlaps without translation', value: 0 },
    ]);
  });

  test('translations that close no loop: rung 4 open, and the loop check is not "computable"', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, tr('t1', 'te', 'prod', 1), tr('t2', 'prod', 'log', 10)],
    }), NOW);
    expect(r.highestRung).toBe(3);
    expect(r.cohomology).toEqual([]);
    const loopCheck = r.methods.find((m) => m.methodId === 'PA-kategorientheorie')!;
    expect(loopCheck.status).toBe('missing_input');
    expect(loopCheck.oneInputAway).toBe('ladder rung 5 reached');
  });

  test('the report always carries the method applicability', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, ...landkarteTranslations],
      fieldCounts: { annualCost: 2 },
    }), NOW);
    const loopCheck = r.methods.find((m) => m.methodId === 'PA-kategorientheorie')!;
    expect(loopCheck.status).toBe('computable');
    expect(r.methods.find((m) => m.methodId === 'DA-technische-schuld')!.oneInputAway).toBe('technicalDebtRatio on at least 1 element');
  });
});

describe('assessLadder — the same model always gives the same report', () => {
  // five contexts, one wrong factor: t5 says c3 → c4 ×6 where t1 says ×2
  const five = ['c0', 'c1', 'c2', 'c3', 'c4'];
  const fiveElements = [...five.map((id) => ctx(id, id.toUpperCase())), ...five.map((id) => obj(`m-${id}`))];
  const fiveMembership = five.map((id) => has(id, `m-${id}`));
  const fiveTranslations = [
    tr('t0', 'c4', 'c0', 1), tr('t1', 'c3', 'c4', 2), tr('t2', 'c3', 'c1', 2), tr('t3', 'c3', 'c2', 1), tr('t4', 'c0', 'c1', 1),
    tr('t5', 'c3', 'c4', 6), tr('t6', 'c4', 'c2', 0.5), tr('t7', 'c1', 'c2', 0.5), tr('t8', 'c4', 'c0', 1),
  ];
  const assessIn = (translations: ModelRelationship[]) =>
    assessLadder('p', input({ elements: fiveElements, relationships: [...fiveMembership, ...translations] }), NOW).cohomology;

  test('the order in which the relationships arrive does not change the cohomology', () => {
    const byId = assessIn(fiveTranslations);
    const reversed = assessIn([...fiveTranslations].reverse());
    const mixed = assessIn([5, 2, 8, 0, 7, 3, 1, 6, 4].map((i) => fiveTranslations[i]));
    expect(byId[0].verdict).toBe('global_obstruction');
    expect(reversed).toEqual(byId);
    expect(mixed).toEqual(byId);
  });

  const shown = (r: ReturnType<typeof assessLadder>) =>
    r.cohomology[0].canonicalScale!.map((s) => ({ contextName: s.contextName, factor: Math.round(s.factor * 1e6) / 1e6, component: s.component }));
  // ids as [TE, Produktion, Logistik]; the names and the translations stay the same
  const landkarteExact = ([te, prod, log]: string[]) => assessLadder('p', input({
    elements: [ctx(te, 'TE'), ctx(prod, 'Produktion'), ctx(log, 'Logistik'), obj('o1'), obj('o2'), obj('o3')],
    relationships: [has(te, 'o1'), has(prod, 'o2'), has(log, 'o3'), tr('t1', te, prod, 1), tr('t2', prod, log, 10), tr('t3', te, log, 10)],
  }), NOW);

  test('the canonical scale is listed by factor, then name — whatever the ids are', () => {
    const expected = [
      { contextName: 'Produktion', factor: 1, component: 1 },
      { contextName: 'TE', factor: 1, component: 1 },
      { contextName: 'Logistik', factor: 10, component: 1 },
    ];
    expect(shown(landkarteExact(['te', 'prod', 'log']))).toEqual(expected);
    expect(shown(landkarteExact(['a', 'b', 'c']))).toEqual(expected);
    expect(shown(landkarteExact(['7f3e', '02aa', 'c91d']))).toEqual(expected);
  });

  test('equal scales stay in name order when the factors differ only by rounding (0.1 × 10)', () => {
    // log(0.1) + log(10) is 4.4e-16, not 0: the raw factors of TE and Produktion differ in the last digit
    const reversed = ([te, prod, log]: string[]) => assessLadder('p', input({
      elements: [ctx(te, 'TE'), ctx(prod, 'Produktion'), ctx(log, 'Logistik'), obj('o1'), obj('o2'), obj('o3')],
      relationships: [has(te, 'o1'), has(prod, 'o2'), has(log, 'o3'), tr('t1', prod, te, 1), tr('t2', log, prod, 0.1), tr('t3', te, log, 10)],
    }), NOW);
    const expected = [
      { contextName: 'Produktion', factor: 1, component: 1 },
      { contextName: 'TE', factor: 1, component: 1 },
      { contextName: 'Logistik', factor: 10, component: 1 },
    ];
    for (const ids of [['te', 'prod', 'log'], ['a', 'b', 'c'], ['b', 'c', 'a'], ['c', 'a', 'b'], ['z', 'm', 'a'], ['b', 'a', 'c']]) {
      expect(shown(reversed(ids))).toEqual(expected);
    }
  });

  test('groups of contexts are numbered by their smallest name, not by their ids', () => {
    const groups = ([a, b, c, d]: string[]) => assessLadder('p', input({
      elements: [ctx(a, 'A'), ctx(b, 'B'), ctx(c, 'C'), ctx(d, 'D'), obj('o1'), obj('o2'), obj('o3'), obj('o4')],
      relationships: [
        has(a, 'o1'), has(b, 'o2'), has(c, 'o3'), has(d, 'o4'),
        tr('ab', a, b, 4), tr('ba', b, a, 0.25), tr('cd', c, d, 0.5), tr('dc', d, c, 2),
      ],
    }), NOW);
    const expected = [
      { contextName: 'A', factor: 1, component: 1 },
      { contextName: 'B', factor: 4, component: 1 },
      { contextName: 'D', factor: 1, component: 2 },
      { contextName: 'C', factor: 2, component: 2 },
    ];
    expect(shown(groups(['a', 'b', 'c', 'd']))).toEqual(expected);
    expect(shown(groups(['z', 'y', 'x', 'w']))).toEqual(expected);
  });

  test('two contexts with the same name and scale are listed by id', () => {
    const r = assessLadder('p', input({
      elements: [ctx('k2', 'Werk'), ctx('k1', 'Werk'), ctx('k0', 'Zentrale'), obj('o1'), obj('o2'), obj('o3')],
      relationships: [has('k2', 'o1'), has('k1', 'o2'), has('k0', 'o3'), tr('t1', 'k0', 'k1', 1), tr('t2', 'k0', 'k2', 1), tr('t3', 'k2', 'k1', 1)],
    }), NOW);
    expect(r.cohomology[0].canonicalScale!.map((s) => s.contextId)).toEqual(['k1', 'k2', 'k0']);
  });
});

describe('assessLadder — robust against odd input', () => {
  const allNumbers = (value: unknown): number[] =>
    typeof value === 'number' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(allNumbers) : [];

  test('names that collide with Object members are counted like any other name', () => {
    const names = ['Constructor', 'constructor', 'toString', 'tostring ', '__proto__', '__proto__'];
    const r = assessLadder('p', input({ elements: names.map((name, i) => obj(`e${i}`, name)) }), NOW);
    expect(r.rungs[0].facts[1]).toEqual({ label: 'duplicate names', value: 3 });
  });

  test.each(['constructor', 'toString', '__proto__'])('two elements of type %s give numeric "available" values', (type) => {
    const r = assessLadder('p', input({
      elements: [{ id: 'a', name: 'A', type }, { id: 'b', name: 'B', type }],
      relationships: [{ id: 'r', sourceId: 'a', targetId: 'b', type }],
    }), NOW);
    const available = r.methods.flatMap((m) => m.checks.map((c) => c.available));
    expect(available.filter((n) => typeof n !== 'number')).toEqual([]);
    const anyElement = r.methods.flatMap((m) => m.checks).find((c) => c.label === 'at least 3 elements')!;
    expect(anyElement.available).toBe(2);
  });

  test('an element without a name does not break the assessment', () => {
    const nameless = [null, undefined].map((name, i) => ({ id: `n${i}`, name: name as unknown as string, type: 'business_object' }));
    const r = assessLadder('p', input({ elements: [...nameless, obj('a', 'A')] }), NOW);
    expect(r.rungs[0].facts[0]).toEqual({ label: 'elements', value: 3 });
    expect(r.rungs[0].facts[1]).toEqual({ label: 'duplicate names', value: 1 }); // both count as the empty name
  });

  test('factors outside 1e-12 … 1e12 are unusable, so no product can overflow', () => {
    const pair = (there: number, back: number) => assessLadder('p', input({
      elements: [ctx('a', 'A'), ctx('b', 'B'), obj('o1'), obj('o2')],
      relationships: [has('a', 'o1'), has('b', 'o2'), tr('ab', 'a', 'b', there), tr('ba', 'b', 'a', back)],
    }), NOW);
    const huge = pair(1e308, 1e308);
    expect(huge.rungs[3].facts).toEqual([
      { label: 'declared translations', value: 0 },
      { label: 'quantities', value: 0 },
      { label: 'unusable translations', value: 2 },
    ]);
    expect(huge.cohomology).toEqual([]);
    expect(allNumbers(huge).filter((n) => !Number.isFinite(n))).toEqual([]);
    expect(pair(1e-13, 1).rungs[3].facts[2].value).toBe(1);

    const atTheBound = pair(1e12, 1e12);
    expect(atTheBound.rungs[3].facts[2].value).toBe(0);
    expect(atTheBound.cohomology[0].loopDefects[0].product).toBeCloseTo(1e24, -14);
    expect(allNumbers(atTheBound).filter((n) => !Number.isFinite(n))).toEqual([]);
    expect(pair(1e-12, 1e12).cohomology[0].verdict).toBe('exact');
  });

  test('quantity names that differ only by case are one quantity', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, tr('p1', 'te', 'prod', 1, 'Pieces'), tr('p2', 'prod', 'log', 10, 'pieces'), tr('p3', 'te', 'log', 12, 'PIECES ')],
    }), NOW);
    expect(r.highestRung).toBe(5);
    expect(r.cohomology.map((c) => [c.quantity, c.verdict])).toEqual([['pieces', 'global_obstruction']]);
  });
});
