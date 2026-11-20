/**
 * REQ-METH-001.3 — from model to complex of contexts: members, overlaps, translations, faces.
 * Run: cd packages/server && npx jest src/__tests__/topologyContextComplex.test.ts
 */
import { buildContextStructure, ModelElement, ModelRelationship } from '../services/topology/contextComplex';

const ctx = (id: string, type = 'grouping'): ModelElement => ({ id, name: id.toUpperCase(), type });
const obj = (id: string): ModelElement => ({ id, name: id, type: 'business_object' });
const has = (context: string, member: string, type = 'composition'): ModelRelationship =>
  ({ id: `${context}∋${member}`, sourceId: context, targetId: member, type });
const tr = (from: string, to: string, factor: number, quantity?: string): ModelRelationship =>
  ({ id: `${from}>${to}${quantity ? `:${quantity}` : ''}`, sourceId: from, targetId: to, type: 'association', translationFactor: factor, translationQuantity: quantity });

describe('buildContextStructure', () => {
  test('contexts are grouping and location elements; members come from composition and aggregation', () => {
    const s = buildContextStructure(
      [ctx('te'), ctx('prod', 'location'), obj('bom'), obj('order'), { id: 'app', name: 'App', type: 'application_component' }],
      [has('te', 'bom'), has('prod', 'order', 'aggregation'), { id: 'x', sourceId: 'app', targetId: 'bom', type: 'composition' }, { id: 'y', sourceId: 'te', targetId: 'order', type: 'serving' }],
    );
    expect(s.contexts.map((c) => c.id)).toEqual(['prod', 'te']);
    expect([...s.members.get('te')!]).toEqual(['bom']);
    expect([...s.members.get('prod')!]).toEqual(['order']);
    expect(s.contextsWithMembers).toBe(2);
    expect(s.overlappingPairs).toEqual([]);
  });

  test('shared members give overlaps; a member shared by three contexts gives a triple overlap', () => {
    const s = buildContextStructure(
      [ctx('a'), ctx('b'), ctx('c'), ctx('d'), obj('m'), obj('n')],
      [has('a', 'm'), has('b', 'm'), has('c', 'm'), has('c', 'n'), has('d', 'n')],
    );
    expect(s.overlappingPairs).toEqual([['a', 'b'], ['a', 'c'], ['b', 'c'], ['c', 'd']]);
    expect(s.tripleOverlaps).toEqual([['a', 'b', 'c']]);
    expect(s.overlapsWithoutTranslation).toHaveLength(4);
  });

  test('translations become oriented edges with log(factor); unusable ones are listed, not used', () => {
    const s = buildContextStructure(
      [ctx('a'), ctx('b'), ctx('empty'), obj('m'), obj('n')],
      [
        has('a', 'm'),
        has('b', 'n'),
        tr('a', 'b', 10),
        { ...tr('a', 'm', 2), id: 'to-member' },
        { ...tr('b', 'a', 0), id: 'zero' },
        { ...tr('a', 'b', -1), id: 'negative' },
        { ...tr('a', 'empty', 3), id: 'context-without-members' },
        { id: 'membership', sourceId: 'a', targetId: 'b', type: 'aggregation', translationFactor: 2 },
      ],
    );
    expect(s.translations.map((t) => t.id)).toEqual(['a>b']);
    expect(s.invalidTranslations.sort()).toEqual(['context-without-members', 'membership', 'negative', 'to-member', 'zero']);
    expect(s.quantities).toHaveLength(1);
    expect(s.quantities[0].quantity).toBe('default');
    expect(s.quantities[0].complex.edges).toEqual([{ id: 'a>b', source: 'a', target: 'b' }]);
    expect(s.quantities[0].cochain.get('a>b')).toBeCloseTo(Math.log(10), 12);
  });

  test('a triangle of translations is a face only where the three contexts share a member', () => {
    const elements = [ctx('a'), ctx('b'), ctx('c'), obj('ma'), obj('mb'), obj('mc'), obj('m')];
    const own = [has('a', 'ma'), has('b', 'mb'), has('c', 'mc')];
    const translations = [tr('a', 'b', 1), tr('b', 'c', 10), tr('a', 'c', 12)];
    const withoutOverlap = buildContextStructure(elements, [...own, ...translations]);
    expect(withoutOverlap.quantities[0].complex.faces).toHaveLength(0);
    const withOverlap = buildContextStructure(elements, [...own, ...translations, has('a', 'm'), has('b', 'm'), has('c', 'm')]);
    expect(withOverlap.quantities[0].complex.faces).toHaveLength(1);
    expect(withOverlap.quantities[0].complex.faces[0].boundary).toEqual([
      { edgeId: 'a>b', sign: 1 },
      { edgeId: 'b>c', sign: 1 },
      { edgeId: 'a>c', sign: -1 },
    ]);
    expect(withOverlap.overlapsWithoutTranslation).toHaveLength(0);
  });

  test('each quantity gets its own complex', () => {
    const s = buildContextStructure(
      [ctx('a'), ctx('b'), obj('ma'), obj('mb')],
      [has('a', 'ma'), has('b', 'mb'), tr('a', 'b', 10, 'pieces'), tr('a', 'b', 1.1, 'currency')],
    );
    expect(s.quantities.map((q) => q.quantity)).toEqual(['currency', 'pieces']);
    expect(s.quantities.every((q) => q.complex.edges.length === 1)).toBe(true);
  });
});

describe('buildContextStructure — semantics that must not drift', () => {
  test('three contexts that overlap pairwise through three different members are no triple overlap', () => {
    const s = buildContextStructure(
      [ctx('a'), ctx('b'), ctx('c'), obj('ab'), obj('bc'), obj('ac')],
      [
        has('a', 'ab'), has('b', 'ab'), has('b', 'bc'), has('c', 'bc'), has('a', 'ac'), has('c', 'ac'),
        tr('a', 'b', 1), tr('b', 'c', 10), tr('a', 'c', 12),
      ],
    );
    expect(s.overlappingPairs).toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']]);
    expect(s.tripleOverlaps).toEqual([]);
    expect(s.quantities[0].complex.faces).toEqual([]);
  });

  test('a translation from a context to itself is unusable', () => {
    const s = buildContextStructure(
      [ctx('a'), ctx('b'), obj('m'), obj('n')],
      [has('a', 'm'), has('b', 'n'), tr('a', 'a', 2), tr('a', 'b', 10)],
    );
    expect(s.translations.map((t) => t.id)).toEqual(['a>b']);
    expect(s.invalidTranslations).toEqual(['a>a']);
    expect(s.quantities[0].complex.edges).toEqual([{ id: 'a>b', source: 'a', target: 'b' }]);
  });

  test('a factor that is not finite or outside 1e-12 … 1e12 is unusable; the bounds themselves are usable', () => {
    const withFactor = (id: string, factor: number): ModelRelationship => ({ ...tr('a', 'b', factor), id });
    const s = buildContextStructure(
      [ctx('a'), ctx('b'), obj('m'), obj('n')],
      [
        has('a', 'm'), has('b', 'n'),
        withFactor('nan', Number.NaN), withFactor('infinite', Number.POSITIVE_INFINITY),
        withFactor('too-large', 1.0001e12), withFactor('too-small', 0.9999e-12),
        withFactor('largest', 1e12), withFactor('smallest', 1e-12),
      ],
    );
    expect(s.translations.map((t) => t.id)).toEqual(['largest', 'smallest']);
    expect(s.invalidTranslations).toEqual(['infinite', 'nan', 'too-large', 'too-small']);
  });

  test('the quantity is trimmed and lower case; a missing or blank quantity is the default quantity', () => {
    const named = (id: string, quantity: string | null | undefined): ModelRelationship => ({ ...tr('a', 'b', 2), id, translationQuantity: quantity });
    const s = buildContextStructure(
      [ctx('a'), ctx('b'), obj('m'), obj('n')],
      [
        has('a', 'm'), has('b', 'n'),
        named('p1', ' pieces '), named('p2', 'pieces'), named('p3', 'Pieces'),
        named('d1', undefined), named('d2', null), named('d3', ''), named('d4', '   '), named('d5', 'default'),
      ],
    );
    expect(s.quantities.map((q) => [q.quantity, q.complex.edges.map((e) => e.id)])).toEqual([
      ['default', ['d1', 'd2', 'd3', 'd4', 'd5']],
      ['pieces', ['p1', 'p2', 'p3']],
    ]);
  });
});
