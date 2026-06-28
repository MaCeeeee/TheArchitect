import { describe, test, expect } from 'vitest';
import {
  resolveElementY,
  STRATEGY_SUB_Y,
  MOTIVATION_SUB_Y,
  LAYER_Y,
} from '@thearchitect/shared/src/constants/togaf.constants';

// Strategy Value Stream View pattern (ArchiMate / Hosiaisluoma):
// value streams float above capabilities, both above the strategy plane,
// connected upward by `serving`. Same sub-stack mechanism as motivation.
describe('resolveElementY — strategy value stream view', () => {
  test('value streams float above the strategy plane', () => {
    expect(resolveElementY('strategy', 'value_stream')).toBeGreaterThan(LAYER_Y['strategy']);
  });

  test('capabilities sit below value streams but still above the plane', () => {
    const vs = resolveElementY('strategy', 'value_stream');
    const cap = resolveElementY('strategy', 'business_capability');
    expect(cap).toBeLessThan(vs);
    expect(cap).toBeGreaterThan(LAYER_Y['strategy']);
  });

  test('sub-Y values are sourced from STRATEGY_SUB_Y', () => {
    expect(resolveElementY('strategy', 'value_stream')).toBe(STRATEGY_SUB_Y['value_stream']);
    expect(resolveElementY('strategy', 'business_capability')).toBe(STRATEGY_SUB_Y['business_capability']);
  });

  test('strategy types without a sub-level fall back to the flat plane', () => {
    expect(resolveElementY('strategy', 'course_of_action')).toBe(LAYER_Y['strategy']);
  });

  test('motivation sub-stack still resolves (regression)', () => {
    expect(resolveElementY('motivation', 'stakeholder')).toBe(MOTIVATION_SUB_Y['stakeholder']);
    expect(resolveElementY('motivation', 'principle')).toBe(MOTIVATION_SUB_Y['principle']);
  });
});
