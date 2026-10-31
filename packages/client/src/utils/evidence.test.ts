/**
 * REQ-PROV-003.1 / REQ-PROV-003.2 (THE-737) — evidence helper unit tests.
 *
 * The helper is the only place that knows the assumption metadata keys
 * (`assumption`, `assumptionNote`, `assumptionSince`, `validationRef`,
 * `previousName`, `changedOn`). PropertyPanel and NodeObject3D both read
 * through it, so these tests pin the trust semantics:
 *   1. Only an explicit `assumption: true` is a hypothesis
 *   2. Only an explicit `assumption: false` earns "validated" — `status:
 *      current` alone is not evidence of validation
 *   3. Non-string metadata values are ignored, never stringified
 */

import { describe, test, expect } from 'vitest';
import { getEvidence, isAssumption } from './evidence';

const el = (over: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}) => ({
  status: 'current',
  metadata,
  ...over,
});

describe('isAssumption', () => {
  test('true only for metadata.assumption === true', () => {
    expect(isAssumption(el({}, { assumption: true }))).toBe(true);
    expect(isAssumption(el({}, { assumption: false }))).toBe(false);
    expect(isAssumption(el({}, { assumption: 'true' }))).toBe(false);
    expect(isAssumption(el())).toBe(false);
  });

  test('status target alone is not an assumption', () => {
    expect(isAssumption(el({ status: 'target' }))).toBe(false);
  });

  test('tolerates missing metadata', () => {
    expect(isAssumption({ status: 'current' })).toBe(false);
  });
});

describe('getEvidence — state', () => {
  test('assumption flag wins over status', () => {
    expect(getEvidence(el({ status: 'current' }, { assumption: true })).state).toBe('assumption');
  });

  test('explicit assumption:false is validated', () => {
    expect(getEvidence(el({}, { assumption: false })).state).toBe('validated');
  });

  test('status current without flag is unassessed, not validated', () => {
    expect(getEvidence(el({ status: 'current' })).state).toBe('unassessed');
  });

  test('status target without flag is planned', () => {
    expect(getEvidence(el({ status: 'target' })).state).toBe('planned');
  });
});

describe('getEvidence — traceability fields', () => {
  test('reads note, since, validationRef, previousName, changedOn', () => {
    const ev = getEvidence(el({ status: 'target' }, {
      assumption: true,
      assumptionNote: 'Buyer role unproven',
      assumptionSince: '2026-10-30',
      validationRef: 'docs/strategy/2026-10-30-annahmen-validierung.md#A4',
      previousName: 'O1 · BSH pays',
      changedOn: '2026-10-30',
    }));
    expect(ev).toMatchObject({
      note: 'Buyer role unproven',
      since: '2026-10-30',
      validationRef: 'docs/strategy/2026-10-30-annahmen-validierung.md#A4',
      previousName: 'O1 · BSH pays',
      changedOn: '2026-10-30',
    });
  });

  test('a doc-path validationRef has no href; an http(s) one does', () => {
    expect(getEvidence(el({}, { validationRef: 'docs/a.md#A1' })).validationHref).toBeUndefined();
    expect(getEvidence(el({}, { validationRef: 'https://example.com/x' })).validationHref).toBe('https://example.com/x');
    expect(getEvidence(el({}, { validationRef: 'javascript:alert(1)' })).validationHref).toBeUndefined();
  });

  test('reads top-level source, provenance and certification', () => {
    const ev = getEvidence(el({ source: 'api', provenance: 'import', certifiedAt: '2026-10-01T10:00:00Z' }));
    expect(ev).toMatchObject({ source: 'api', provenance: 'import', certifiedAt: '2026-10-01T10:00:00Z' });
  });

  test('ignores non-string and blank values', () => {
    const ev = getEvidence(el({ source: 42 }, { assumptionNote: { x: 1 }, assumptionSince: '  ', validationRef: 7 }));
    expect(ev.note).toBeUndefined();
    expect(ev.since).toBeUndefined();
    expect(ev.validationRef).toBeUndefined();
    expect(ev.source).toBeUndefined();
  });
});
