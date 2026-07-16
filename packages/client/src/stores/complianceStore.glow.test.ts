import { describe, test, expect } from 'vitest';
import { useComplianceStore } from './complianceStore';

describe('setShowComplianceGlow (THE-487)', () => {
  test('sets the flag idempotently', () => {
    useComplianceStore.getState().setShowComplianceGlow(true);
    expect(useComplianceStore.getState().showComplianceGlow).toBe(true);
    useComplianceStore.getState().setShowComplianceGlow(false);
    expect(useComplianceStore.getState().showComplianceGlow).toBe(false);
  });
});
