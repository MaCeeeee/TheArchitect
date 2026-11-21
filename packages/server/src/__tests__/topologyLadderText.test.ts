/**
 * UC-METH-001 — the texts of the ladder are written in ASD-STE100 (Simplified Technical English).
 *
 * Guard: every sentence the report can show uses only words of the checked list
 * (shared/src/constants/ste100-words.constants.ts), stays within the sentence length, and uses
 * none of the terms the plain texts replaced. A new text with an unchecked word fails here and
 * names the word and the sentence. The mathematical wording lives in `math` and is not checked.
 * What the guard itself must find is tested in ste100Guard.test.ts.
 * Run: cd packages/server && npx jest src/__tests__/topologyLadderText.test.ts
 */
import type { LadderReport } from '@thearchitect/shared';
import { ste100Findings } from '@thearchitect/shared/src/constants/ste100-guard';
import type { Ste100Kind } from '@thearchitect/shared/src/constants/ste100-guard';
import { STE100_TECHNICAL_NOUNS, STE100_WORDS_IN_USE } from '@thearchitect/shared/src/constants/ste100-words.constants';
import type { ModelElement, ModelRelationship } from '../services/topology/contextComplex';
import { assessLadder, LadderInput } from '../services/topology/ladder';

const NOW = new Date('2026-11-20T12:00:00Z');
type Model = { elements: ModelElement[]; relationships: ModelRelationship[] };

const group = (id: string, name = id.toUpperCase()): ModelElement => ({ id, name, type: 'grouping' });
const obj = (id: string, name = id): ModelElement => ({ id, name, type: 'business_object' });
const has = (groupId: string, member: string): ModelRelationship =>
  ({ id: `${groupId}-has-${member}`, sourceId: groupId, targetId: member, type: 'composition' });
const factor = (id: string, from: string, to: string, value: number, quantity?: string): ModelRelationship =>
  ({ id, sourceId: from, targetId: to, type: 'association', translationFactor: value, translationQuantity: quantity });
const serving = (id: string, from: string, to: string): ModelRelationship => ({ id, sourceId: from, targetId: to, type: 'serving' });

const g = (i: number) => `g${String(i).padStart(4, '0')}`;
/** n groups that all have the same members. */
function sharing(groups: number, members = 1): Model {
  const memberIds = Array.from({ length: members }, (_, m) => `m${m}`);
  const elements = [...Array.from({ length: groups }, (_, i) => group(g(i), `Group ${i}`)), ...memberIds.map((id) => obj(id))];
  const relationships: ModelRelationship[] = [];
  for (let i = 0; i < groups; i++) for (const m of memberIds) relationships.push(has(g(i), m));
  return { elements, relationships };
}
/** One conversion factor between every pair of the first `size` groups. */
function mesh(size: number, quantity?: string): ModelRelationship[] {
  const out: ModelRelationship[] = [];
  for (let a = 0; a < size; a++) for (let b = a + 1; b < size; b++) out.push(factor(`f${a}-${b}-${quantity ?? ''}`, g(a), g(b), 1, quantity));
  return out;
}
/** `count` conversion factors of one quantity between the same two groups. */
const parallel = (count: number, quantity: string, from = 0, to = 1): ModelRelationship[] =>
  Array.from({ length: count }, (_, copy) => factor(`p-${quantity}-${copy}`, g(from), g(to), 1, quantity));
const withFactors = (model: Model, factors: ModelRelationship[]): Model =>
  ({ elements: model.elements, relationships: [...model.relationships, ...factors] });

// three groups with one member of their own each
const three = [group('te', 'TE'), group('prod', 'Produktion'), group('log', 'Logistik')];
const ownMembers = [obj('bom'), obj('order'), obj('delivery')];
const ownMembership = [has('te', 'bom'), has('prod', 'order'), has('log', 'delivery')];
const separate: Model = { elements: [...three, ...ownMembers], relationships: ownMembership };
const closedPath = (last: number) => [factor('t1', 'te', 'prod', 1), factor('t2', 'prod', 'log', 10), factor('t3', 'te', 'log', last)];

/** 32 groups with `own` members each and nothing in common; two quantities, each a full mesh. */
function meshedWithoutSameMember(own: number): Model {
  const model = sharing(32, 0);
  for (let i = 0; i < 32; i++) {
    for (let m = 0; m < own; m++) {
      model.elements.push(obj(`o${i}-${m}`));
      model.relationships.push(has(g(i), `o${i}-${m}`));
    }
  }
  return withFactors(model, [...mesh(32, 'hours'), ...mesh(32, 'pieces')]);
}

const MODELS: Record<string, Model> = {
  empty: { elements: [], relationships: [] },
  'elements only': { elements: [obj('a'), obj('b')], relationships: [] },
  'one name twice': { elements: [obj('a', 'ERP'), obj('b', ' erp '), obj('c', 'CRM')], relationships: [] },
  'three names twice': { elements: ['x', 'y', 'z'].flatMap((n) => [obj(`${n}1`, n), obj(`${n}2`, n)]), relationships: [] },
  'one relationship to nothing': { elements: [obj('a'), obj('b')], relationships: [serving('r1', 'a', 'b'), serving('r2', 'a', 'ghost')] },
  'three relationships to nothing': {
    elements: [obj('a'), obj('b')],
    relationships: [serving('r1', 'a', 'b'), serving('r2', 'a', 'ghost'), serving('r3', 'ghost', 'b'), serving('r4', 'ghost', 'ghost2')],
  },
  '1,200 names twice': { elements: Array.from({ length: 1200 }, (_, i) => [obj(`n${i}a`, `name ${i}`), obj(`n${i}b`, `name ${i}`)]).flat(), relationships: [] },
  '1,000 relationships to nothing': {
    elements: [obj('a'), obj('b')],
    relationships: [serving('r', 'a', 'b'), ...Array.from({ length: 1000 }, (_, i) => serving(`r${i}`, 'a', `ghost${i}`))],
  },
  '1,000 conversion factors that cannot be used': withFactors(separate, [
    factor('t1', 'te', 'prod', 1), ...Array.from({ length: 1000 }, (_, i) => factor(`self${i}`, 'te', 'te', 2)),
  ]),
  'groups without members': { elements: three, relationships: closedPath(12) },
  'groups, no conversion factor': separate,
  'one conversion factor that cannot be used': withFactors(separate, [factor('t1', 'te', 'prod', 1), factor('self', 'te', 'te', 2)]),
  'three conversion factors that cannot be used': withFactors(separate, [
    factor('t1', 'te', 'prod', 1), factor('self', 'te', 'te', 2), factor('nan', 'te', 'log', Number.NaN), factor('huge', 'prod', 'log', 1e13),
  ]),
  'two conversion factors, no closed path': withFactors(separate, [factor('t1', 'te', 'prod', 1), factor('t2', 'prod', 'log', 10)]),
  'closed path, agrees': withFactors(separate, closedPath(10)),
  'closed path, does not agree along the path': withFactors(separate, closedPath(12)),
  'closed path, does not agree at a member': {
    elements: [...three, obj('material')],
    relationships: [has('te', 'material'), has('prod', 'material'), has('log', 'material'), ...closedPath(12)],
  },
  'one pair of groups without a conversion factor': sharing(2),
  'three pairs of groups without a conversion factor': sharing(3),
  'more than 200 groups': sharing(201),
  'count of sets of three groups stops': sharing(60),
  'one quantity above a limit (sets of three conversion factors)': withFactors(sharing(32), mesh(32)),
  'one quantity above a limit, one examined': withFactors(sharing(4), [...parallel(501, 'bulk'), factor('a', g(1), g(2), 1, 'pieces'), factor('b', g(2), g(3), 1, 'pieces'), factor('c', g(1), g(3), 1, 'pieces')]),
  'two quantities above a limit (conversion factors)': withFactors(sharing(3), [...parallel(501, 'bulk'), ...parallel(1200, 'more bulk')]),
  'two quantities above a limit (members)': meshedWithoutSameMember(5000),
  'seven quantities above a limit (all quantities together)': withFactors(sharing(3), [
    ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].flatMap((q) => parallel(400, q)),
    factor('z1', g(0), g(1), 1, 'z'), factor('z2', g(1), g(2), 1, 'z'), factor('z3', g(0), g(2), 1, 'z'),
  ]),
};

/**
 * The names of the quantities in the models above, as a warning shows them: in quotation marks.
 * They are the only words in a text that are not words of the software, so the guard gets them
 * by name. Quotation marks alone hide nothing from it.
 */
const QUANTITY_NAMES = [
  ...new Set(Object.values(MODELS).flatMap((model) => model.relationships.map((r) => r.translationQuantity ?? 'default'))),
].map((name) => `"${name}"`);

const input = (model: Model): LadderInput => ({ ...model, fieldCounts: {} });
const REPORTS: Record<string, LadderReport> = Object.fromEntries(
  Object.entries(MODELS).map(([name, model]) => [name, assessLadder('p', input(model), NOW)]),
);
const report = (name: string): LadderReport => REPORTS[name];

interface ShownText {
  text: string;
  kind: Ste100Kind;
  where: string;
}

/**
 * Every text of every report, once: title, provides, next, warnings, fact labels and the step that
 * a method needs. The other inputs of a method are not collected: they hold the names of element
 * types and fields as the method catalogue has them.
 */
function shownTexts(): ShownText[] {
  const seen = new Map<string, ShownText>();
  const add = (text: string, kind: Ste100Kind, where: string) => {
    if (!seen.has(`${kind}|${text}`)) seen.set(`${kind}|${text}`, { text, kind, where });
  };
  for (const [name, r] of Object.entries(REPORTS)) {
    for (const rung of r.rungs) {
      const where = `${name}, step ${rung.index}`;
      add(rung.title, 'description', `${where}, title`);
      add(rung.provides, 'description', `${where}, provides`);
      if (rung.next !== null) add(rung.next, 'instruction', `${where}, next`);
      for (const warning of rung.warnings) add(warning, 'description', `${where}, warning`);
      for (const fact of rung.facts) add(fact.label, 'description', `${where}, fact label`);
    }
    for (const method of r.methods) add(method.checks[method.checks.length - 1].label, 'description', `${name}, ${method.methodId}, step label`);
  }
  return [...seen.values()];
}

describe('the models reach every text of the ladder', () => {
  test('the six titles, explanations and next steps are those of the approved draft', () => {
    const r = report('empty');
    expect(r.rungs.map((rung) => [rung.index, rung.title, rung.provides, rung.next])).toEqual([
      [0, 'Elements', 'Each element is one item in the model.', 'Add elements to the model.'],
      [1, 'Relationships', 'A relationship connects two elements and has a direction.', 'Connect the elements with relationships.'],
      [
        2,
        'Groups',
        'A group is a Grouping element or a Location element with its members. Two groups can have the same member.',
        'Make a minimum of two groups. Add a Grouping element for each group. Then connect each Grouping element to its members with a Composition relationship.',
      ],
      [
        3,
        'Conversion factors',
        'A conversion factor is a number on a relationship between two groups. It shows how a quantity changes from one group to the other group. Example: The relationship from group A to group B has the conversion factor 10. Then 1 unit in group A is equal to 10 units in group B.',
        'Connect two groups with an Association relationship. Then give a conversion factor to the relationship. At this time, you can give the conversion factor only with the API.',
      ],
      [
        4,
        'Closed paths',
        'A closed path starts and stops at the same group. The check is possible only along a closed path.',
        'Add conversion factors until two different paths connect the same two groups. Example: A to B, B to C, and A to C.',
      ],
      [5, 'Result', 'The software multiplies the conversion factors along each closed path. The result must be 1.', 'Do steps 0 thru 4 first.'],
    ]);
  });

  test('the 20 fact labels are those of the approved draft', () => {
    expect(report('closed path, agrees').rungs.map((rung) => rung.facts.map((fact) => fact.label))).toEqual([
      ['elements', 'names used more than one time'],
      ['relationships', 'parts of the model', 'closed paths between elements', 'relationships that connect an element to the same element'],
      ['groups', 'groups with members', 'pairs of groups with the same member', 'sets of three groups with the same member'],
      ['conversion factors', 'quantities', 'conversion factors that the check cannot use'],
      ['closed paths and sets of three groups to examine', 'quantities without a closed path', 'pairs of groups without a conversion factor'],
      ['quantities examined', 'quantities that agree', 'quantities that do not agree at a member', 'quantities that do not agree along a closed path'],
    ]);
    expect(report('more than 200 groups').rungs[2].facts.map((fact) => fact.label)).toEqual(['groups']);
  });

  test('names on more than one element: singular and plural', () => {
    expect(report('one name twice').rungs[0].warnings).toEqual(['1 name is on more than one element. Give each element a different name.']);
    expect(report('three names twice').rungs[0].warnings).toEqual(['3 names are on more than one element. Give each element a different name.']);
  });

  test('relationships to elements that are not in the model: singular and plural', () => {
    expect(report('one relationship to nothing').rungs[1].warnings).toEqual([
      '1 relationship connects to an element that is not in the model. The check does not use this relationship.',
    ]);
    expect(report('three relationships to nothing').rungs[1].warnings).toEqual([
      '3 relationships connect to elements that are not in the model. The check does not use these relationships.',
    ]);
  });

  test('conversion factors that the check cannot use: singular and plural, with every condition', () => {
    const conditions =
      'A conversion factor must be between two different groups that have members. It cannot be on a Composition relationship or an Aggregation relationship. It must be a number between 1e-12 and 1e12.';
    expect(report('one conversion factor that cannot be used').rungs[3].warnings).toEqual([
      `1 relationship has a conversion factor that the check cannot use. ${conditions}`,
    ]);
    expect(report('three conversion factors that cannot be used').rungs[3].warnings).toEqual([
      `3 relationships have a conversion factor that the check cannot use. ${conditions}`,
    ]);
    expect(report('groups without members').rungs[3].warnings).toEqual([
      `3 relationships have a conversion factor that the check cannot use. ${conditions}`,
    ]);
  });

  test('pairs of groups without a conversion factor: singular and plural', () => {
    expect(report('one pair of groups without a conversion factor').rungs[4].warnings).toEqual([
      '1 pair of groups has the same member but no conversion factor.',
    ]);
    expect(report('three pairs of groups without a conversion factor').rungs[4].warnings).toEqual([
      '3 pairs of groups have the same member but no conversion factor.',
    ]);
  });

  test('every count in a warning has the same thousands separator', () => {
    expect(report('1,200 names twice').rungs[0].warnings[0]).toMatch(/^1,200 names are on more than one element\./);
    expect(report('1,000 relationships to nothing').rungs[1].warnings[0]).toMatch(/^1,000 relationships connect to elements that are not in the model\./);
    expect(report('1,000 conversion factors that cannot be used').rungs[3].warnings[0]).toMatch(/^1,000 relationships have a conversion factor that the check cannot use\./);
    // 60 groups with the same member: C(60, 2) pairs
    expect(report('count of sets of three groups stops').rungs[4].warnings).toEqual(['1,770 pairs of groups have the same member but no conversion factor.']);
  });

  test('three counts, three labels: only the result counts "closed paths" without more words', () => {
    // three groups with one member in common and a conversion factor between each two of them
    const r = report('closed path, does not agree at a member');
    expect(r.rungs[1].facts.slice(1, 3)).toEqual([
      { label: 'parts of the model', value: 1 },
      { label: 'closed paths between elements', value: 3 },
    ]);
    expect(r.rungs[4].facts[0]).toEqual({ label: 'closed paths and sets of three groups to examine', value: 2 });
    expect(r.cohomology[0].independentLoops).toBe(1); // the panel shows it as "1 closed path"
    const labels = r.rungs.flatMap((rung) => rung.facts.map((fact) => fact.label));
    expect(labels.filter((label) => label === 'closed paths' || label === 'closed paths to examine')).toEqual([]);
  });

  test('the step that a method needs is a "step of the model check"', () => {
    for (const r of Object.values(REPORTS)) {
      for (const method of r.methods) {
        expect(method.checks[method.checks.length - 1].label).toBe(`step ${method.rung} of the model check`);
      }
    }
    const loopCheck = report('two conversion factors, no closed path').methods.find((m) => m.methodId === 'PA-kategorientheorie')!;
    expect(loopCheck.oneInputAway).toBe('step 5 of the model check');
  });

  test('more than 200 groups and a count that stops', () => {
    expect(report('more than 200 groups').rungs[2].next).toBe(
      'The model has 201 groups. The check uses a maximum of 200 groups. Remove Grouping elements or Location elements until the model has a maximum of 200 groups.',
    );
    expect(report('count of sets of three groups stops').rungs[2].warnings).toEqual([
      'The model has a minimum of 10,000 sets of three groups with the same member. The software stopped at this number.',
    ]);
  });

  const limits =
    'The limits for each quantity are 500 conversion factors and 500 sets of three conversion factors. The limit for all quantities together is 1,000 conversion factors.';
  const nextWithoutTheseQuantities =
    'Decrease the number of conversion factors in the model. Or add conversion factors of a different quantity until two different paths connect the same two groups.';

  test('one quantity not included: the sentence, the limits, the quantity with its reason, and what to do', () => {
    const r = report('one quantity above a limit (sets of three conversion factors)');
    expect(r.rungs[4].warnings).toEqual([
      `The check does not include 1 quantity. ${limits} This quantity is "default" (more than 500 sets of three conversion factors).`,
    ]);
    expect(r.rungs[4].next).toBe(nextWithoutTheseQuantities);
    // the reason gives the number of conversion factors the quantity has
    expect(report('one quantity above a limit, one examined').rungs[4].warnings[0]).toBe(
      `The check does not include 1 quantity. ${limits} This quantity is "bulk" (501 conversion factors).`,
    );
  });

  test('two quantities not included: plural, both named, the same next step', () => {
    const r = report('two quantities above a limit (conversion factors)');
    expect(r.rungs[4].warnings[0]).toBe(
      `The check does not include 2 quantities. ${limits} These quantities are "bulk" (501 conversion factors) and "more bulk" (1,200 conversion factors).`,
    );
    expect(r.rungs[4].next).toBe(nextWithoutTheseQuantities);
    // the reason names the limit on the members: neither quantity is large
    expect(report('two quantities above a limit (members)').rungs[4].warnings[0]).toBe(
      `The check does not include 2 quantities. ${limits} These quantities are "hours" (more than 20,000,000 members to compare) and "pieces" (more than 20,000,000 members to compare).`,
    );
  });

  test('seven quantities not included: five named, the others counted', () => {
    const all = 'more than 1,000 conversion factors in all quantities';
    expect(report('seven quantities above a limit (all quantities together)').rungs[4].warnings[0]).toBe(
      `The check does not include 7 quantities. ${limits} These quantities are "c" (${all}), "d" (${all}), "e" (${all}), "f" (${all}), "g" (${all}), and 2 more.`,
    );
  });

  test('the three results are reached', () => {
    expect(report('closed path, agrees').cohomology.map((c) => c.verdict)).toEqual(['exact']);
    expect(report('closed path, does not agree at a member').cohomology.map((c) => c.verdict)).toEqual(['local_defect']);
    expect(report('closed path, does not agree along the path').cohomology.map((c) => c.verdict)).toEqual(['global_obstruction']);
    expect(report('two conversion factors, no closed path').rungs.map((rung) => rung.status)).toEqual(['reached', 'reached', 'reached', 'reached', 'open', 'locked']);
    expect(report('groups, no conversion factor').highestRung).toBe(2);
    expect(report('elements only').highestRung).toBe(0);
  });
});

describe('every text of the ladder is Simplified Technical English', () => {
  const texts = shownTexts();

  test('the collection holds every kind of text', () => {
    const kinds = (part: string) => texts.filter((t) => t.where.endsWith(part)).length;
    expect(kinds('title')).toBe(6);
    expect(kinds('provides')).toBe(6);
    expect(kinds('fact label')).toBe(20);
    expect(kinds('step label')).toBe(3); // the methods of the catalogue need step 0, step 1 or step 5
    expect(kinds('next')).toBeGreaterThanOrEqual(8); // six steps, more than 200 groups, quantities that the check does not include
    expect(kinds('warning')).toBeGreaterThanOrEqual(15);
  });

  test.each(texts.map((t) => [`${t.where}: ${t.text.slice(0, 50)}`, t] as const))('%s', (_where, { text, kind }) => {
    // a failure names the word and the sentence it is in
    expect(ste100Findings(text, kind, QUANTITY_NAMES)).toEqual([]);
  });

  test('the names of the quantities are the only words that the guard does not examine', () => {
    expect(QUANTITY_NAMES.sort()).toEqual(
      ['"a"', '"b"', '"bulk"', '"c"', '"d"', '"default"', '"e"', '"f"', '"g"', '"h"', '"hours"', '"i"', '"more bulk"', '"pieces"', '"z"'],
    );
    const named = texts.filter((t) => QUANTITY_NAMES.some((name) => t.text.includes(name)));
    expect(named.length).toBeGreaterThanOrEqual(5);
    // without the names, each of these texts fails: quotation marks alone hide nothing
    for (const { text, kind } of named) expect(ste100Findings(text, kind)).not.toEqual([]);
  });

  test('the word lists are lower case, without duplicates, and a technical noun is not also a word', () => {
    expect(STE100_WORDS_IN_USE.filter((w) => w !== w.toLowerCase())).toEqual([]);
    expect(new Set(STE100_WORDS_IN_USE).size).toBe(STE100_WORDS_IN_USE.length);
    expect(new Set(STE100_TECHNICAL_NOUNS).size).toBe(STE100_TECHNICAL_NOUNS.length);
    expect(STE100_TECHNICAL_NOUNS.filter((noun) => STE100_WORDS_IN_USE.includes(noun.toLowerCase()))).toEqual([]);
  });
});

describe('the mathematical wording stays available in `math`', () => {
  const rungs = report('empty').rungs;

  test('every rung has a math text, the same in every report', () => {
    expect(rungs.map((rung) => rung.math)).toEqual([
      'Identity. Every thing exists exactly once — the 0-cells are well defined.',
      'Directed graph. Oriented relationships: the chain complex C₁ → C₀ with boundary ∂. connected components (b0) = parts of the model, independent loops (b1) = closed paths between elements.',
      'Cover. Contexts with members: named areas of the model. Shared members are overlaps; three contexts sharing a member form a 2-cell.',
      'Coefficients. Values in an abelian group: translation factors between contexts, (ℝ>0, ·) ≅ (ℝ, +).',
      'Gluing testable. The translations close loops or meet on triple overlaps, so the cocycle condition can be tested.',
      'Cohomology. The class of the translations in H¹: zero means one consistent scale per context exists.',
    ]);
    for (const r of Object.values(REPORTS)) {
      expect(r.rungs.map((rung) => rung.math)).toEqual(rungs.map((rung) => rung.math));
      expect(r.rungs.every((rung) => rung.math.trim() !== '')).toBe(true);
    }
  });

  test('H¹, abelian and chain complex are in math, not in the plain explanation', () => {
    expect(rungs[5].math).toContain('H¹');
    expect(rungs[5].provides).not.toContain('H¹');
    expect(rungs[3].math).toContain('abelian');
    expect(rungs[3].provides).not.toContain('abelian');
    expect(rungs[1].math).toContain('chain complex');
    expect(rungs[1].provides).not.toContain('chain complex');
  });
});
