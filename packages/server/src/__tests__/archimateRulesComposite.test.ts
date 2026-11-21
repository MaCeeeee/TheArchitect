/**
 * REQ-METH-001.3 — a grouping or location may contain elements of any layer (ArchiMate: composite
 * elements aggregate or compose concepts that belong together). Without this the ladder's own
 * instruction for rung 2 cannot be followed in the connection picker.
 * Run: cd packages/server && npx jest src/__tests__/archimateRulesComposite.test.ts
 */
import { CONTEXT_ELEMENT_TYPES, getDefaultRelationship, getValidRelationships } from '@thearchitect/shared';

describe('composite elements across layers', () => {
  test('a grouping can compose and aggregate application and technology elements', () => {
    expect(getValidRelationships('grouping', 'application_component')).toEqual(expect.arrayContaining(['composition', 'aggregation']));
    expect(getValidRelationships('grouping', 'node')).toEqual(expect.arrayContaining(['composition', 'aggregation']));
    expect(getValidRelationships('grouping', 'data_object')).toEqual(expect.arrayContaining(['composition', 'aggregation']));
  });

  test('a location can aggregate elements of other layers', () => {
    expect(getValidRelationships('location', 'application_component')).toEqual(expect.arrayContaining(['aggregation']));
    expect(getValidRelationships('location', 'business_actor')).toEqual(expect.arrayContaining(['aggregation']));
  });

  test('the exception holds for every element whose aspect is composite — a product as well', () => {
    expect(getValidRelationships('product', 'application_component')).toEqual(expect.arrayContaining(['composition', 'aggregation']));
    expect(getValidRelationships('product', 'node')).toEqual(expect.arrayContaining(['composition', 'aggregation']));
  });

  test('the exception only keeps what the base rules list: a grouping cannot compose or aggregate a goal', () => {
    // Recorded as the function answers today. Motivation targets have rules of their own, which the
    // exception does not touch — a context of goals cannot be modelled the way rung 2 asks for.
    expect(getValidRelationships('grouping', 'goal')).toEqual(['realization', 'influence', 'association']);
  });

  test('same-layer membership is unchanged', () => {
    expect(getValidRelationships('grouping', 'business_object')).toEqual(expect.arrayContaining(['composition', 'aggregation']));
  });

  test('two contexts can be joined by an association (the carrier of a translation)', () => {
    expect(getValidRelationships('grouping', 'grouping')).toContain('association');
    expect(getValidRelationships('grouping', 'location')).toContain('association');
  });

  test('regression: non-composite elements still cannot compose across layers', () => {
    expect(getValidRelationships('application_component', 'node')).not.toContain('composition');
    expect(getValidRelationships('business_actor', 'application_component')).not.toContain('aggregation');
    expect(getValidRelationships('application_component', 'grouping')).not.toContain('composition');
  });
});

/**
 * The ladder's step 2 says: "connect each Grouping element to its members with a Composition
 * relationship". The connection picker preselects getDefaultRelationship, so that default must be
 * the relationship the step names — otherwise the step cannot be followed without knowing ArchiMate.
 */
describe('default relationship from a group to its member', () => {
  test('the groups are grouping and location', () => {
    expect([...CONTEXT_ELEMENT_TYPES]).toEqual(['grouping', 'location']);
  });

  test('a grouping or a location composes an element that is not a group', () => {
    expect(getDefaultRelationship('grouping', 'application_component')).toBe('composition');
    expect(getDefaultRelationship('grouping', 'business_object')).toBe('composition');
    expect(getDefaultRelationship('grouping', 'node')).toBe('composition');
    expect(getDefaultRelationship('grouping', 'data_object')).toBe('composition');
    expect(getDefaultRelationship('location', 'node')).toBe('composition');
    expect(getDefaultRelationship('location', 'application_component')).toBe('composition');
    expect(getDefaultRelationship('location', 'business_actor')).toBe('composition');
  });

  test('where a group cannot compose the target, the default stays what it was', () => {
    expect(getValidRelationships('grouping', 'goal')).not.toContain('composition');
    expect(getDefaultRelationship('grouping', 'goal')).toBe('realization');
    expect(getDefaultRelationship('location', 'goal')).toBe('realization');
  });

  test('between two groups the default is unchanged — never composition or aggregation, which would make one group a member of the other', () => {
    expect(getDefaultRelationship('grouping', 'grouping')).toBe('specialization');
    expect(getDefaultRelationship('location', 'location')).toBe('specialization');
    expect(getDefaultRelationship('grouping', 'location')).toBe('association');
    expect(getDefaultRelationship('location', 'grouping')).toBe('association');
    for (const source of CONTEXT_ELEMENT_TYPES) {
      for (const target of CONTEXT_ELEMENT_TYPES) {
        expect(['composition', 'aggregation']).not.toContain(getDefaultRelationship(source as never, target as never));
      }
    }
  });

  test('the direction matters: an element joined to a group keeps its default', () => {
    expect(getDefaultRelationship('application_component', 'grouping')).toBe('realization');
  });

  test('no other pair changes: the defaults as they were before', () => {
    expect(getDefaultRelationship('application_component', 'node')).toBe('serving');
    expect(getDefaultRelationship('business_actor', 'process')).toBe('assignment');
    // 'business_process' is not an element type of this model (the type is 'process'): an unknown type falls back to association
    expect(getDefaultRelationship('business_actor', 'business_process' as never)).toBe('association');
    expect(getDefaultRelationship('goal', 'requirement')).toBe('influence');
    expect(getDefaultRelationship('product', 'application_component')).toBe('realization');
  });
});
