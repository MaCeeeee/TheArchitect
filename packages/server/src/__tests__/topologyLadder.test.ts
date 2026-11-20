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
      { label: 'parts that are not connected', value: 2 },
      { label: 'closed paths', value: 1 },
      { label: 'relationships that connect an element to the same element', value: 0 },
    ]);
    expect(r.rungs[2].next).toContain('Grouping element');
    expect(r.rungs[1].next).toBeNull();
  });

  test('duplicate names are a warning on rung 0, dangling relationships on rung 1', () => {
    const r = assessLadder('p', input({
      elements: [obj('a', 'ERP'), obj('b', ' erp '), obj('c', 'CRM')],
      relationships: [{ id: 'r1', sourceId: 'a', targetId: 'c', type: 'flow' }, { id: 'r2', sourceId: 'a', targetId: 'ghost', type: 'flow' }],
    }), NOW);
    expect(r.rungs[0].facts[1]).toEqual({ label: 'names used more than one time', value: 1 });
    expect(r.rungs[0].warnings[0]).toContain('1 name is on more than one element');
    expect(r.rungs[1].warnings[0]).toContain('1 relationship connects to an element that is not in the model');
    expect(r.rungs[1].facts[0].value).toBe(1);
  });

  test('duplicate names counts the names that occur more than once, not the elements that carry them', () => {
    const r = assessLadder('p', input({ elements: [obj('a', 'Same'), obj('b', 'Same'), obj('c', ' same'), obj('d', 'Other')] }), NOW);
    expect(r.rungs[0].facts[1]).toEqual({ label: 'names used more than one time', value: 1 });
    expect(r.rungs[0].warnings).toEqual(['1 name is on more than one element. Give each element a different name.']);
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
    expect(one.rungs[4].next).toContain('two different paths connect the same two groups');
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
    const product = c.loopDefects[0].product!;
    expect(Math.max(product, 1 / product)).toBeCloseTo(1.2, 9);
    const t3 = c.loopDefects[0].steps.find((s) => s.relationshipId === 't3')!;
    expect(t3.factor).toBe(12);
    expect([t3.fromContext, t3.toContext].sort()).toEqual(['Logistik', 'TE']);
    expect(r.cohomologyMethod.id).toBe('PA-kategorientheorie');
    expect(r.rungs[5].facts[3]).toEqual({ label: 'quantities that do not agree along a closed path', value: 1 });
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
    expect(r.rungs[2].facts[3]).toEqual({ label: 'sets of three groups with the same member', value: 1 });
  });

  test('corrected translation: exact, with one canonical scale per context', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, tr('t1', 'te', 'prod', 1), tr('t2', 'prod', 'log', 10), tr('t3', 'te', 'log', 10)],
    }), NOW);
    const c = r.cohomology[0];
    expect(c.verdict).toBe('exact');
    expect(c.loopDefects).toEqual([]);
    const scale = Object.fromEntries(c.canonicalScale!.map((s) => [s.contextName, Math.round(s.factor! * 1e6) / 1e6]));
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
    const scale = Object.fromEntries(c.canonicalScale!.map((s) => [s.contextName, Math.round(s.factor! * 1e6) / 1e6]));
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
    const byName = Object.fromEntries(c.canonicalScale!.map((s) => [s.contextName, [s.component, Math.round(s.factor! * 1e6) / 1e6]]));
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
      { label: 'closed paths to examine', value: 1 },
      { label: 'quantities without a closed path', value: 1 },
      { label: 'pairs of groups without a conversion factor', value: 0 },
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
    r.cohomology[0].canonicalScale!.map((s) => ({ contextName: s.contextName, factor: Math.round(s.factor! * 1e6) / 1e6, component: s.component }));
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
    expect(r.rungs[0].facts[1]).toEqual({ label: 'names used more than one time', value: 3 });
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
    expect(r.rungs[0].facts[1]).toEqual({ label: 'names used more than one time', value: 0 }); // no name is not a name that occurs twice
    expect(r.rungs[0].warnings).toEqual([]);
  });

  test('factors outside 1e-12 … 1e12 are unusable; the product of two factors at the bound is still a number', () => {
    const pair = (there: number, back: number) => assessLadder('p', input({
      elements: [ctx('a', 'A'), ctx('b', 'B'), obj('o1'), obj('o2')],
      relationships: [has('a', 'o1'), has('b', 'o2'), tr('ab', 'a', 'b', there), tr('ba', 'b', 'a', back)],
    }), NOW);
    const huge = pair(1e308, 1e308);
    expect(huge.rungs[3].facts).toEqual([
      { label: 'conversion factors', value: 0 },
      { label: 'quantities', value: 0 },
      { label: 'conversion factors that the check cannot use', value: 2 },
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

  // 27 steps of 1e12: 27 × log(1e12) = 746, above log(Number.MAX_VALUE) = 709.8
  const longIds = Array.from({ length: 27 }, (_, i) => `k${String(i).padStart(2, '0')}`);
  const longModel = (translations: ModelRelationship[]) => assessLadder('p', input({
    elements: [...longIds.map((id) => ctx(id, id.toUpperCase())), ...longIds.map((id) => obj(`m-${id}`))],
    relationships: [...longIds.map((id) => has(id, `m-${id}`)), ...translations],
  }), NOW);

  test.each([1e12, 1e-12])('a ring of 27 translations ×%s: the product leaves the range of a double and is reported as null', (factor) => {
    const r = longModel(longIds.map((id, i) => tr(`t${i}`, id, longIds[(i + 1) % 27], factor)));
    const c = r.cohomology[0];
    expect(c.verdict).toBe('global_obstruction');
    expect([c.loopDefectCount, c.faceDefectCount]).toEqual([1, 0]);
    expect(c.loopDefects).toHaveLength(1);
    expect(c.loopDefects[0].steps).toHaveLength(27);
    expect(c.loopDefects[0].product).toBeNull(); // neither Infinity nor 0
    expect(allNumbers(r).filter((n) => !Number.isFinite(n))).toEqual([]);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r); // the report arrives as it was sent
  });

  test('a consistent chain of 27 translations ×1e12: exact, and the one scale outside the range of a double is null', () => {
    const chain = longIds.slice(1).map((id, i) => tr(`t${i}`, longIds[i], id, 1e12));
    // the first translation declared twice closes a loop, so the quantity is classified
    const r = longModel([...chain, tr('again', longIds[0], longIds[1], 1e12)]);
    const c = r.cohomology[0];
    expect(c.verdict).toBe('exact');
    const scale = c.canonicalScale!;
    expect(scale.map((s) => s.contextName)).toEqual(longIds.map((id) => id.toUpperCase()));
    expect(scale[0].factor).toBe(1);
    expect(scale[25].factor).toBeCloseTo(1e300, -290); // 25 steps still fit
    expect(scale.map((s) => s.factor).filter((f) => f === null)).toHaveLength(1);
    expect(scale[26].factor).toBeNull(); // 1e312 does not
    expect(allNumbers(r).filter((n) => !Number.isFinite(n))).toEqual([]);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
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

describe('assessLadder — what a reported loop says', () => {
  type Defect = ReturnType<typeof assessLadder>['cohomology'][number]['loopDefects'][number];
  const stepProduct = (d: Defect) => d.steps.reduce((p, s) => (s.direction === 'forward' ? p * s.factor : p / s.factor), 1);

  test('the Landkarte loop is reported in the direction it is walked: ×1 · ×10 · ÷12 = 10/12', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, ...landkarteTranslations],
    }), NOW);
    const [loop] = r.cohomology[0].loopDefects;
    expect(loop.steps).toEqual([
      { relationshipId: 't1', fromContext: 'TE', toContext: 'Produktion', factor: 1, direction: 'forward' },
      { relationshipId: 't2', fromContext: 'Produktion', toContext: 'Logistik', factor: 10, direction: 'forward' },
      { relationshipId: 't3', fromContext: 'Logistik', toContext: 'TE', factor: 12, direction: 'reverse' },
    ]);
    expect(loop.product).toBeCloseTo(10 / 12, 9);
  });

  test('property: every reported loop chains head to tail and its product is the product of its steps', () => {
    // small deterministic generator (LCG), so a failure can be reproduced
    let seed = 20261120;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const factors = [0.25, 0.5, 1, 1, 2, 3, 10];
    let checked = 0;
    for (let model = 0; model < 60; model++) {
      const n = 3 + next(4);
      const ids = Array.from({ length: n }, (_, i) => `k${next(1000)}-${i}`);
      const name = new Map(ids.map((id, i) => [id, `Context ${i}`]));
      const elements = [...ids.map((id) => ctx(id, name.get(id)!)), ...ids.map((id) => obj(`own-${id}`)), obj('shared')];
      const membership = [...ids.map((id) => has(id, `own-${id}`)), ...ids.filter(() => next(2) === 0).map((id) => has(id, 'shared'))];
      const translations: ModelRelationship[] = [];
      for (let e = 0; e < n + 2 + next(4); e++) {
        const from = ids[next(n)];
        const to = ids[next(n)];
        if (from !== to) translations.push(tr(`e${next(1000)}-${e}`, from, to, factors[next(factors.length)]));
      }
      const relation = new Map(translations.map((t) => [t.id, t]));
      const r = assessLadder('p', input({ elements, relationships: [...membership, ...translations] }), NOW);
      for (const c of r.cohomology) {
        for (const defect of [...c.loopDefects, ...c.faceDefects]) {
          defect.steps.forEach((step, i) => {
            const rel = relation.get(step.relationshipId)!;
            const [from, to] = step.direction === 'forward' ? [rel.sourceId, rel.targetId] : [rel.targetId, rel.sourceId];
            expect([step.fromContext, step.toContext, step.factor]).toEqual([name.get(from), name.get(to), rel.translationFactor]);
            expect(step.toContext).toBe(defect.steps[(i + 1) % defect.steps.length].fromContext);
          });
          expect(defect.product! / stepProduct(defect)).toBeCloseTo(1, 9);
          expect(Math.abs(Math.log(defect.product!))).toBeGreaterThan(r.tolerance);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  test('pairwise overlaps without a common member: an inconsistent triangle is a global obstruction, not a local defect', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, obj('te-prod'), obj('prod-log'), obj('te-log')],
      relationships: [
        has('te', 'te-prod'), has('prod', 'te-prod'), has('prod', 'prod-log'), has('log', 'prod-log'), has('te', 'te-log'), has('log', 'te-log'),
        ...landkarteTranslations,
      ],
    }), NOW);
    expect(r.rungs[2].facts.slice(2)).toEqual([
      { label: 'pairs of groups with the same member', value: 3 },
      { label: 'sets of three groups with the same member', value: 0 },
    ]);
    const c = r.cohomology[0];
    expect([c.verdict, c.faces, c.h1Dimension]).toEqual(['global_obstruction', 0, 1]);
    expect(c.faceDefects).toEqual([]);
  });

  test('of two triple overlaps only the defective one is reported, with its own contexts', () => {
    const five = ['a', 'b', 'c', 'd', 'e'];
    const r = assessLadder('p', input({
      elements: [...five.map((id) => ctx(id, id.toUpperCase())), obj('m1'), obj('m2')],
      relationships: [
        has('a', 'm1'), has('b', 'm1'), has('c', 'm1'),
        has('c', 'm2'), has('d', 'm2'), has('e', 'm2'),
        tr('ab', 'a', 'b', 1), tr('bc', 'b', 'c', 1), tr('ac', 'a', 'c', 1),
        tr('cd', 'c', 'd', 1), tr('de', 'd', 'e', 1), tr('ce', 'c', 'e', 2),
      ],
    }), NOW);
    const c = r.cohomology[0];
    expect([c.verdict, c.faces]).toEqual(['local_defect', 2]);
    expect(c.faceDefects).toHaveLength(1);
    expect(c.faceDefects[0].steps.map((s) => s.relationshipId)).toEqual(['cd', 'de', 'ce']);
    expect(c.faceDefects[0].steps.map((s) => s.fromContext)).toEqual(['C', 'D', 'E']);
    expect(c.faceDefects[0].product).toBeCloseTo(0.5, 9);
  });

  test('a translation from a context to itself is counted as unusable and closes no loop', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, tr('t1', 'te', 'prod', 1), tr('self', 'te', 'te', 2)],
    }), NOW);
    expect(r.rungs[3].facts[2]).toEqual({ label: 'conversion factors that the check cannot use', value: 1 });
    expect(r.rungs[4].status).toBe('open');
    expect(r.cohomology).toEqual([]);
  });

  test('the warning about unusable translations names every reason', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers],
      relationships: [...ownMembership, tr('t1', 'te', 'prod', 1), tr('self', 'te', 'te', 2), tr('nan', 'te', 'log', Number.NaN), tr('huge', 'prod', 'log', 1e13)],
    }), NOW);
    expect(r.rungs[3].warnings).toEqual([
      '3 relationships have a conversion factor that the check cannot use. A conversion factor must be between two different groups that have members. It cannot be on a Composition relationship or an Aggregation relationship. It must be a number between 1e-12 and 1e12.',
    ]);
  });

  test('tolerance: a loop product of 1 + 5e-7 closes, 1 + 5e-6 does not', () => {
    const pair = (back: number) => assessLadder('p', input({
      elements: [ctx('a', 'A'), ctx('b', 'B'), obj('o1'), obj('o2')],
      relationships: [has('a', 'o1'), has('b', 'o2'), tr('ab', 'a', 'b', 1), tr('ba', 'b', 'a', back)],
    }), NOW).cohomology[0];
    expect(pair(1 + 5e-7).verdict).toBe('exact');
    expect(pair(1 - 5e-7).verdict).toBe('exact');
    expect(pair(1 + 5e-6).verdict).toBe('global_obstruction');
    expect(pair(1 - 5e-6).verdict).toBe('global_obstruction');
  });

  test('duplicate ids do not throw; the first element and the first relationship win', () => {
    const r = assessLadder('p', input({
      elements: [...contexts, ...ownMembers, { id: 'log', name: 'Shadow', type: 'business_object' }, obj('bom', 'Shadow BOM')],
      relationships: [
        ...ownMembership,
        tr('t1', 'te', 'prod', 1), tr('t2', 'prod', 'log', 10), tr('t3', 'te', 'log', 10),
        tr('t3', 'te', 'log', 12), // same id again, contradicting: must be ignored
        has('te', 'bom'),
      ],
    }), NOW);
    expect(r.rungs[0].facts).toEqual([{ label: 'elements', value: 6 }, { label: 'names used more than one time', value: 0 }]);
    expect(r.rungs[1].facts[0]).toEqual({ label: 'relationships', value: 6 });
    expect(r.rungs[2].facts[0]).toEqual({ label: 'groups', value: 3 }); // 'log' is still the context Logistik
    const c = r.cohomology[0];
    expect(c.verdict).toBe('exact');
    expect(c.canonicalScale!.map((s) => s.contextName)).toEqual(['Produktion', 'TE', 'Logistik']);
  });
});
