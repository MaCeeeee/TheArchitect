// REQ-003.2 AC-4: Jeder Violation-Output ist schema-konform (CI-Gate via jest).
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
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
    expect(validate(msg)).toBe(true);
  });

  it('rejects legacy severities and missing ruleId', () => {
    expect(validate({ severity: 'error', message: 'x', resourcePath: '/elements/e/f', ruleId: 'r-1' })).toBe(false);
    expect(validate({ severity: 'high', message: 'x', resourcePath: '/elements/e/f' })).toBe(false);
  });
});
