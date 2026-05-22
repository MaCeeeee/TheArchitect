/**
 * complianceElements.service Tests — UC-ICM-002 (THE-280)
 *
 * Verifies ArchiMate-Type → ComplianceMappingElementType normalization.
 * Critical: BSH-Demo elements (e.g. `business_capability`, `process`,
 * `application_component`) must bucket cleanly so the LLM gets a stable
 * type signal in the prompt.
 *
 * Run: cd packages/server && npx jest src/__tests__/complianceElements.service.test.ts --verbose
 */
import { normalizeElementType } from '../services/complianceElements.service';

describe('normalizeElementType (UC-ICM-002 / THE-280)', () => {
  describe('exact buckets', () => {
    const exactCases: Array<[string, string]> = [
      ['capability', 'capability'],
      ['business_capability', 'capability'],
      ['application', 'application'],
      ['application_component', 'application'],
      ['data_object', 'data_object'],
      ['process', 'business_process'],
      ['business_process', 'business_process'],
      ['business_actor', 'business_actor'],
      ['business_service', 'business_service'],
      ['application_service', 'application_service'],
      ['business_function', 'business_function'],
      ['business_object', 'business_object'],
      ['business_role', 'business_role'],
      ['technology_service', 'technology_service'],
      ['node', 'node'],
    ];

    for (const [input, expected] of exactCases) {
      it(`'${input}' → '${expected}'`, () => {
        expect(normalizeElementType(input)).toBe(expected);
      });
    }
  });

  describe('case-insensitive', () => {
    it('uppercase Capability → capability', () => {
      expect(normalizeElementType('Capability')).toBe('capability');
    });
    it('mixed-case Business_Process → business_process', () => {
      expect(normalizeElementType('Business_Process')).toBe('business_process');
    });
  });

  describe('heuristic prefix fallback', () => {
    it('unknown business_* → business_function', () => {
      expect(normalizeElementType('business_collaboration')).toBe('business_function');
    });
    it('unknown application_* → application_service', () => {
      expect(normalizeElementType('application_interaction')).toBe('application_service');
    });
    it('unknown technology_* → technology_service', () => {
      expect(normalizeElementType('technology_collaboration')).toBe('technology_service');
    });
  });

  describe('custom fallback', () => {
    it('null → custom', () => {
      expect(normalizeElementType(null)).toBe('custom');
    });
    it('undefined → custom', () => {
      expect(normalizeElementType(undefined)).toBe('custom');
    });
    it('empty string → custom', () => {
      expect(normalizeElementType('')).toBe('custom');
    });
    it('arbitrary unknown → custom', () => {
      expect(normalizeElementType('value_stream')).toBe('custom');
      expect(normalizeElementType('xyz123')).toBe('custom');
    });
  });
});
