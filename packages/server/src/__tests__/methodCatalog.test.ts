/**
 * REQ-METH-001.1 — method catalog invariants.
 * Run: cd packages/server && npx jest src/__tests__/methodCatalog.test.ts
 */
import { METHOD_CATALOG, getMethod, toMethodRef } from '@thearchitect/shared';

describe('REQ-METH-001.1 method catalog', () => {
  test('IDs are unique and follow <BOOK>-<anchor>', () => {
    const ids = METHOD_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^(PA|DA|OE|GC)-[a-z0-9-]+$/));
  });

  test('every method has all required fields, a rung and at least one input', () => {
    METHOD_CATALOG.forEach((m) => {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.question.length).toBeGreaterThan(0);
      expect(m.formula.length).toBeGreaterThan(0);
      expect(m.limits.length).toBeGreaterThan(0);
      expect(m.bookNumber).toBeGreaterThan(0);
      expect(m.inputs.length).toBeGreaterThan(0);
      expect([0, 1, 2, 3, 4, 5]).toContain(m.rung);
    });
  });

  test('contains the structural methods and the loop check on rung 5', () => {
    const ids = METHOD_CATALOG.map((m) => m.id);
    ['PA-kanaele', 'PA-zyklomatik', 'PA-betweenness', 'DA-kanonisch', 'DA-instabilitaet', 'DA-propagation', 'DA-metcalfe']
      .forEach((id) => expect(ids).toContain(id));
    expect(getMethod('PA-kategorientheorie')?.rung).toBe(5);
    expect(getMethod('PA-kategorientheorie')?.computedBy).toBe('ladder');
    expect(getMethod('PA-umlauf')?.rung).toBe(1);
    expect(getMethod('PA-umlauf')?.computedBy).toBe('ladder');
  });

  test('field inputs only name plain property identifiers (safe for Cypher)', () => {
    METHOD_CATALOG.flatMap((m) => m.inputs).forEach((input) => {
      if (input.kind === 'field') expect(input.field).toMatch(/^[a-zA-Z]+$/);
    });
  });

  test('getMethod / toMethodRef', () => {
    expect(getMethod('DA-kanonisch')?.bookNumber).toBe(17);
    expect(getMethod('nope')).toBeUndefined();
    const ref = toMethodRef('PA-kategorientheorie');
    expect(ref.id).toBe('PA-kategorientheorie');
    expect(ref.formula).toBe('F(g ∘ f) = F(g) ∘ F(f)');
    expect(ref.limits).toContain('invertible');
    expect(() => toMethodRef('nope')).toThrow('Unknown method');
  });
});
