// REQ-FIX-001.1 (THE-499) — Unit-Tests der deterministischen Fix-Ableitung.
// SUT lebt in @thearchitect/shared (shared hat keinen Runner); Import aus dem
// gebauten dist — vorher `npm run build --workspace=@thearchitect/shared`.
import { describe, it, expect } from 'vitest';
import { deriveViolationFix, isAutoFixableField } from '@thearchitect/shared';

describe('deriveViolationFix (REQ-FIX-001.1)', () => {
  it('equals → "Set {field} to {expectedValue}" + edit_field action (AC-1/AC-2)', () => {
    const fix = deriveViolationFix({ operator: 'equals', field: 'status', currentValue: 'draft', expectedValue: 'approved' });
    expect(fix.applicable).toBe(true);
    expect(fix.instruction).toBe('Set status to approved');
    expect(fix.action).toEqual({ type: 'edit_field', label: 'Set status to approved', payload: { field: 'status', value: 'approved' } });
  });

  it('not_equals → "Change {field} — must not be {expectedValue}", applicable:false, keine Action (korrigiert 2026-07-17)', () => {
    const fix = deriveViolationFix({ operator: 'not_equals', field: 'tier', currentValue: 'gold', expectedValue: 'gold' });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('Change tier — must not be gold');
    expect(fix.action).toBeUndefined();
  });

  it('exists:true → "Add {field}", applicable:false, keine Action (THE-502: nicht ein-Klick-fixbar)', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'owner', currentValue: '', expectedValue: true });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('Add owner');
    expect(fix.action).toBeUndefined();
  });

  it('exists:false → "Remove {field}", applicable:false, keine Action (THE-502)', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'legacyFlag', currentValue: 'on', expectedValue: false });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('Remove legacyFlag');
    expect(fix.action).toBeUndefined();
  });

  it('gte/lte → applicable + edit_field (set = expectedValue erfüllt ≥/≤, Grenzwert inklusiv)', () => {
    const gte = deriveViolationFix({ operator: 'gte', field: 'n', currentValue: 1, expectedValue: 5 });
    expect(gte.applicable).toBe(true);
    expect(gte.instruction).toBe('Set n ≥ 5');
    expect(gte.action).toEqual({ type: 'edit_field', label: 'Set n ≥ 5', payload: { field: 'n', value: 5 } });
    const lte = deriveViolationFix({ operator: 'lte', field: 'n', currentValue: 9, expectedValue: 5 });
    expect(lte.applicable).toBe(true);
    expect(lte.action?.payload).toEqual({ field: 'n', value: 5 });
  });

  it('gt/lt → applicable:false, keine Action, Instruction bleibt (THE-502: strikt, set ≠ Ziel)', () => {
    const gt = deriveViolationFix({ operator: 'gt', field: 'n', currentValue: 1, expectedValue: 5 });
    expect(gt.applicable).toBe(false);
    expect(gt.instruction).toBe('Set n > 5');
    expect(gt.action).toBeUndefined();
    const lt = deriveViolationFix({ operator: 'lt', field: 'n', currentValue: 9, expectedValue: 5 });
    expect(lt.applicable).toBe(false);
    expect(lt.instruction).toBe('Set n < 5');
    expect(lt.action).toBeUndefined();
  });

  it('contains → "Include \'{expectedValue}\' in {field}", applicable:false, keine Action (THE-502)', () => {
    const fix = deriveViolationFix({ operator: 'contains', field: 'tags', currentValue: 'a,b', expectedValue: 'pii' });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe("Include 'pii' in tags");
    expect(fix.action).toBeUndefined();
  });

  it('regex → applicable:false + generischer Hinweis, keine action (Slice 3)', () => {
    const fix = deriveViolationFix({ operator: 'regex', field: 'code', currentValue: 'x', expectedValue: '^[A-Z]+$' });
    expect(fix.applicable).toBe(false);
    expect(fix.action).toBeUndefined();
    expect(fix.instruction).toMatch(/pattern/i);
  });

  it('fehlender operator (Legacy-Violation) → generischer "should be"-Hinweis, crasht nie (AC-3)', () => {
    const fix = deriveViolationFix({ operator: undefined, field: 'status', currentValue: 'draft', expectedValue: 'approved' });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('status should be approved');
    expect(fix.action).toBeUndefined();
  });

  it('unbekannter operator → generischer "should be"-Hinweis (default branch, AC-3)', () => {
    const fix = deriveViolationFix({ operator: 'starts_with', field: 'code', currentValue: 'x', expectedValue: 'ABC' });
    expect(fix.applicable).toBe(false);
    expect(fix.instruction).toBe('code should be ABC');
    expect(fix.action).toBeUndefined();
  });

  it('equals mit Objekt-expectedValue → JSON-stringified in instruction/payload', () => {
    const fix = deriveViolationFix({ operator: 'equals', field: 'cfg', currentValue: null, expectedValue: { a: 1 } });
    expect(fix.instruction).toBe('Set cfg to {"a":1}');
    expect(fix.action?.payload).toEqual({ field: 'cfg', value: { a: 1 } });
  });

  it('equals mit leerem expectedValue → \'\' wird als "" dargestellt', () => {
    const fix = deriveViolationFix({ operator: 'equals', field: 'label', currentValue: 'x', expectedValue: '' });
    expect(fix.instruction).toBe('Set label to ""');
  });

  it('isAutoFixableField (THE-502/AC-2): whitelistet flache Felder, schließt type/maturityLevel/layer aus', () => {
    expect(isAutoFixableField('status')).toBe(true);
    expect(isAutoFixableField('riskLevel')).toBe(true);
    expect(isAutoFixableField('description')).toBe(true);
    expect(isAutoFixableField('name')).toBe(true);
    expect(isAutoFixableField('type')).toBe(false);
    expect(isAutoFixableField('maturityLevel')).toBe(false);
    expect(isAutoFixableField('layer')).toBe(false);
  });
});
