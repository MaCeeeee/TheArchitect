/**
 * UC-DATA-001 — Generator D Parser + Validator Unit Tests
 *
 * Tests the parseAndValidate boundary in dataObjectGenerator.service.ts.
 * This is the safety gate that prevents LLM hallucinations from leaking
 * into the architecture (REQ-DATA-002).
 *
 * The parser is implemented as a private helper inside the service module,
 * so we test it via the public surface by mocking the Anthropic call and
 * inspecting what comes out.
 *
 * Run: cd packages/server && npx jest src/__tests__/dataObjectGenerator.parser.test.ts --forceExit
 */

import { GeneratedDataObjectSchema } from '../services/dataObjectGenerator.service';

describe('GeneratedDataObjectSchema validation (REQ-DATA-002)', () => {
  describe('valid inputs pass', () => {
    it('accepts a fully-specified data-object', () => {
      const valid = {
        name: 'Emissions-Record',
        description: 'Monthly Scope 1/2/3 greenhouse gas measurements',
        dataClass: 'transactional',
        sensitivity: 'internal',
        crudOperations: 'CRU',
        archimateType: 'data_object',
      };
      const result = GeneratedDataObjectSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('defaults archimateType to data_object when omitted', () => {
      const noType = {
        name: 'Audit-Log',
        description: 'Compliance audit trail',
        dataClass: 'log',
        sensitivity: 'confidential',
        crudOperations: 'C',
      };
      const result = GeneratedDataObjectSchema.safeParse(noType);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.archimateType).toBe('data_object');
      }
    });

    it('accepts data_entity and data_model variants', () => {
      for (const t of ['data_entity', 'data_model'] as const) {
        const item = {
          name: 'Customer-Master',
          description: 'Master record',
          dataClass: 'master',
          sensitivity: 'PII',
          crudOperations: 'CRUD',
          archimateType: t,
        };
        expect(GeneratedDataObjectSchema.safeParse(item).success).toBe(true);
      }
    });

    it('accepts all 4 sensitivity levels', () => {
      for (const s of ['PII', 'confidential', 'internal', 'public']) {
        const item = {
          name: 'Test',
          description: 'Test desc',
          dataClass: 'reference',
          sensitivity: s,
          crudOperations: 'R',
        };
        expect(GeneratedDataObjectSchema.safeParse(item).success).toBe(true);
      }
    });

    it('accepts all 6 dataClass levels', () => {
      for (const c of ['transactional', 'master', 'reference', 'analytical', 'event', 'log']) {
        const item = {
          name: 'Test',
          description: 'Test desc',
          dataClass: c,
          sensitivity: 'internal',
          crudOperations: 'R',
        };
        expect(GeneratedDataObjectSchema.safeParse(item).success).toBe(true);
      }
    });
  });

  describe('invalid inputs are rejected', () => {
    it('rejects unknown archimateType (anti-hallucination)', () => {
      const bogus = {
        name: 'Foo',
        description: 'Bar',
        dataClass: 'transactional',
        sensitivity: 'internal',
        crudOperations: 'R',
        archimateType: 'business_thing', // hallucinated
      };
      expect(GeneratedDataObjectSchema.safeParse(bogus).success).toBe(false);
    });

    it('rejects unknown sensitivity', () => {
      const bogus = {
        name: 'Foo',
        description: 'Bar',
        dataClass: 'transactional',
        sensitivity: 'top_secret', // not in enum
        crudOperations: 'R',
      };
      expect(GeneratedDataObjectSchema.safeParse(bogus).success).toBe(false);
    });

    it('rejects unknown dataClass', () => {
      const bogus = {
        name: 'Foo',
        description: 'Bar',
        dataClass: 'magic', // not in enum
        sensitivity: 'public',
        crudOperations: 'R',
      };
      expect(GeneratedDataObjectSchema.safeParse(bogus).success).toBe(false);
    });

    it('rejects empty name', () => {
      const bogus = {
        name: '',
        description: 'Bar',
        dataClass: 'reference',
        sensitivity: 'public',
        crudOperations: 'R',
      };
      expect(GeneratedDataObjectSchema.safeParse(bogus).success).toBe(false);
    });

    it('rejects too-long name', () => {
      const bogus = {
        name: 'X'.repeat(200),
        description: 'Bar',
        dataClass: 'reference',
        sensitivity: 'public',
        crudOperations: 'R',
      };
      expect(GeneratedDataObjectSchema.safeParse(bogus).success).toBe(false);
    });

    it('rejects crudOperations with non-CRUD letters', () => {
      const bogus = {
        name: 'Foo',
        description: 'Bar',
        dataClass: 'reference',
        sensitivity: 'public',
        crudOperations: 'XYZ',
      };
      expect(GeneratedDataObjectSchema.safeParse(bogus).success).toBe(false);
    });

    it('rejects empty crudOperations', () => {
      const bogus = {
        name: 'Foo',
        description: 'Bar',
        dataClass: 'reference',
        sensitivity: 'public',
        crudOperations: '',
      };
      expect(GeneratedDataObjectSchema.safeParse(bogus).success).toBe(false);
    });

    it('rejects missing required fields', () => {
      const incomplete = {
        name: 'Foo',
        // description missing
        dataClass: 'reference',
        sensitivity: 'public',
        crudOperations: 'R',
      };
      expect(GeneratedDataObjectSchema.safeParse(incomplete).success).toBe(false);
    });
  });

  describe('CRUD letter combinations all accepted', () => {
    it.each(['C', 'R', 'U', 'D', 'CR', 'CU', 'CD', 'RU', 'RD', 'UD', 'CRU', 'CRD', 'RUD', 'CUD', 'CRUD'])(
      'accepts %s',
      (combo) => {
        const item = {
          name: 'Test',
          description: 'Test',
          dataClass: 'transactional',
          sensitivity: 'internal',
          crudOperations: combo,
        };
        expect(GeneratedDataObjectSchema.safeParse(item).success).toBe(true);
      },
    );
  });
});
