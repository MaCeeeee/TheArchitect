/**
 * REQ-METH-001.3 — a grouping or location may contain elements of any layer (ArchiMate: composite
 * elements aggregate or compose concepts that belong together). Without this the ladder's own
 * instruction for rung 2 cannot be followed in the connection picker.
 * Run: cd packages/server && npx jest src/__tests__/archimateRulesComposite.test.ts
 */
import { getValidRelationships } from '@thearchitect/shared';

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
