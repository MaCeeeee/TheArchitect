// REQ-003.2 AC-4: Jeder Violation-Output ist schema-konform (CI-Gate via jest).
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { VIOLATION_SEVERITIES, ENFORCEMENT_LEVELS } from '@thearchitect/shared';
import schema from '../schemas/validation-violation.schema.json';
import { toViolationMessage } from '../services/violation-format';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

describe('validation-violation.schema.json (THE-202)', () => {
  it('accepts a well-formed violation message', () => {
    const msg = toViolationMessage({
      ruleId: 'r-123e4567-e89b-42d3-a456-426614174000',
      severity: 'high',
      enforcementLevel: 'soft_mandatory',
      message: 'Element needs a description',
      elementId: 'el-1',
      field: 'description',
      docLink: '/compliance/standards/abc#3.1',
    });
    const valid = validate(msg);
    // errors asserted before the boolean so a failure prints the actual ajv error details
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('rejects legacy severities, missing ruleId, and missing enforcementLevel', () => {
    // each payload is invalid for exactly ONE reason, so the assertions stay single-fault
    expect(validate({ severity: 'error', enforcementLevel: 'advisory', message: 'x', resourcePath: '/elements/e/f', ruleId: 'r-1' })).toBe(false);
    expect(validate({ severity: 'high', enforcementLevel: 'advisory', message: 'x', resourcePath: '/elements/e/f' })).toBe(false);
    expect(validate({ ruleId: 'r-1', severity: 'high', message: 'x', resourcePath: '/elements/e/f' })).toBe(false);
  });

  it('schema enums match the shared domain constants', () => {
    expect(schema.properties.severity.enum).toEqual([...VIOLATION_SEVERITIES]);
    expect(schema.properties.enforcementLevel.enum).toEqual([...ENFORCEMENT_LEVELS]);
  });
});
