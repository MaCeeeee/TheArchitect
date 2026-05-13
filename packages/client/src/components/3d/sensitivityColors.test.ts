/**
 * REQ-DATA-008 — sensitivityColors helper unit tests
 *
 * The helper feeds NodeObject3D's color-selection chain and the property
 * panel legend. It must:
 *   1. Only fire for data-* types
 *   2. Return null when no sensitivity is set
 *   3. Map the 4 known values to their Tailwind-equivalent hex
 *   4. Ignore unknown sensitivity values (defensive)
 */

import { describe, test, expect } from 'vitest';
import {
  getSensitivityColor,
  getSensitivityLabel,
  SENSITIVITY_HEX,
} from './sensitivityColors';

const dataObj = (sensitivity?: unknown) => ({
  type: 'data_object',
  metadata: sensitivity === undefined ? {} : { sensitivity },
});

describe('getSensitivityColor', () => {
  test('returns null for non-data types regardless of metadata', () => {
    expect(getSensitivityColor({ type: 'business_capability', metadata: { sensitivity: 'PII' } })).toBeNull();
    expect(getSensitivityColor({ type: 'process', metadata: { sensitivity: 'confidential' } })).toBeNull();
    expect(getSensitivityColor({ type: 'stakeholder', metadata: { sensitivity: 'PII' } })).toBeNull();
  });

  test('returns null when data-type element has no sensitivity metadata', () => {
    expect(getSensitivityColor(dataObj())).toBeNull();
    expect(getSensitivityColor({ type: 'data_object' })).toBeNull();
    expect(getSensitivityColor({ type: 'data_entity', metadata: {} })).toBeNull();
  });

  test('maps all 4 sensitivity levels to the correct hex', () => {
    expect(getSensitivityColor(dataObj('PII'))).toBe(SENSITIVITY_HEX.PII);
    expect(getSensitivityColor(dataObj('confidential'))).toBe(SENSITIVITY_HEX.confidential);
    expect(getSensitivityColor(dataObj('internal'))).toBe(SENSITIVITY_HEX.internal);
    expect(getSensitivityColor(dataObj('public'))).toBe(SENSITIVITY_HEX.public);
  });

  test('PII is red (most-visible / highest concern)', () => {
    expect(getSensitivityColor(dataObj('PII'))).toBe('#ef4444');
  });

  test('public is green (least concern)', () => {
    expect(getSensitivityColor(dataObj('public'))).toBe('#22c55e');
  });

  test('applies to all three data-* types', () => {
    expect(getSensitivityColor({ type: 'data_object', metadata: { sensitivity: 'PII' } })).toBe('#ef4444');
    expect(getSensitivityColor({ type: 'data_entity', metadata: { sensitivity: 'PII' } })).toBe('#ef4444');
    expect(getSensitivityColor({ type: 'data_model', metadata: { sensitivity: 'PII' } })).toBe('#ef4444');
  });

  test('returns null for unknown sensitivity values (defensive)', () => {
    expect(getSensitivityColor(dataObj('top_secret'))).toBeNull();
    expect(getSensitivityColor(dataObj(''))).toBeNull();
    expect(getSensitivityColor(dataObj(42))).toBeNull(); // non-string
    expect(getSensitivityColor(dataObj(null))).toBeNull();
  });
});

describe('getSensitivityLabel', () => {
  test('returns human-readable labels for known values', () => {
    expect(getSensitivityLabel('PII')).toBe('PII (Personal)');
    expect(getSensitivityLabel('confidential')).toBe('Confidential');
    expect(getSensitivityLabel('internal')).toBe('Internal');
    expect(getSensitivityLabel('public')).toBe('Public');
  });

  test('echoes unknown values verbatim (no crash)', () => {
    expect(getSensitivityLabel('exotic')).toBe('exotic');
    expect(getSensitivityLabel('')).toBe('');
  });
});
