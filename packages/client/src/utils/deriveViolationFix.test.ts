// REQ-FIX-001.1 (THE-499) — Unit-Tests der deterministischen Fix-Ableitung.
// SUT lebt in @thearchitect/shared (shared hat keinen Runner); Import aus dem
// gebauten dist — vorher `npm run build --workspace=@thearchitect/shared`.
import { describe, it, expect } from 'vitest';
import { deriveViolationFix } from '@thearchitect/shared';

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

  it('exists:true mit leerem currentValue → "Add {field}" (AC-5 empty-case)', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'owner', currentValue: '', expectedValue: true });
    expect(fix.applicable).toBe(true);
    expect(fix.instruction).toBe('Add owner');
    expect(fix.action).toEqual({ type: 'edit_field', label: 'Add owner', payload: { field: 'owner', value: true } });
  });

  it('exists:false → "Remove {field}"', () => {
    const fix = deriveViolationFix({ operator: 'exists', field: 'legacyFlag', currentValue: 'on', expectedValue: false });
    expect(fix.instruction).toBe('Remove legacyFlag');
    expect(fix.action?.payload).toEqual({ field: 'legacyFlag', value: false });
  });

  it('gt/gte/lt/lte → "Set {field} {>|≥|<|≤} {expectedValue}"', () => {
    expect(deriveViolationFix({ operator: 'gt', field: 'n', currentValue: 1, expectedValue: 5 }).instruction).toBe('Set n > 5');
    expect(deriveViolationFix({ operator: 'gte', field: 'n', currentValue: 1, expectedValue: 5 }).instruction).toBe('Set n ≥ 5');
    expect(deriveViolationFix({ operator: 'lt', field: 'n', currentValue: 9, expectedValue: 5 }).instruction).toBe('Set n < 5');
    expect(deriveViolationFix({ operator: 'lte', field: 'n', currentValue: 9, expectedValue: 5 }).instruction).toBe('Set n ≤ 5');
  });

  it('contains → "Include \'{expectedValue}\' in {field}"', () => {
    const fix = deriveViolationFix({ operator: 'contains', field: 'tags', currentValue: 'a,b', expectedValue: 'pii' });
    expect(fix.instruction).toBe("Include 'pii' in tags");
    expect(fix.action?.payload).toEqual({ field: 'tags', value: 'pii' });
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
});
