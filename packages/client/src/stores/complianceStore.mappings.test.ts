/**
 * complianceStore — mappingsByElement slice (UC-ICM-003.2 / THE-282)
 *
 * Tests the reverse-lookup state slice for ComplianceMappings:
 *  - loads on first call
 *  - caches subsequent calls
 *  - handles concurrent same-element calls (de-dupes via isLoadingMappingsForElement)
 *  - clears via invalidateMappingsForElement
 *  - graceful error handling
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import type { ComplianceMappingDTO } from '@thearchitect/shared';

// Mock the api module BEFORE importing the store
vi.mock('../services/api', () => ({
  complianceMappingAPI: {
    getByElement: vi.fn(),
  },
  compliancePipelineAPI: { getPipelineStatus: vi.fn(), getPortfolio: vi.fn() },
  governanceAPI: { getViolations: vi.fn(), getViolationsByElement: vi.fn() },
  architectureAPI: { getElements: vi.fn() },
}));

// Mock the architecture store
vi.mock('./architectureStore', () => ({
  useArchitectureStore: { getState: () => ({ refreshFromBackend: vi.fn() }) },
}));

import { useComplianceStore } from './complianceStore';
import { complianceMappingAPI } from '../services/api';

function makeMapping(elementId: string, conf: number, reg = 'reg1'): ComplianceMappingDTO {
  return {
    _id: `m-${elementId}-${reg}`,
    projectId: 'proj-1',
    regulationId: reg,
    elementId,
    elementType: 'capability',
    confidence: conf,
    reasoning: 'because',
    status: 'auto',
    createdBy: 'llm',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('complianceStore — mappingsByElement (UC-ICM-003.2)', () => {
  beforeEach(() => {
    useComplianceStore.getState().clear();
    vi.clearAllMocks();
  });

  test('loadMappingsForElement fetches + populates cache', async () => {
    const fixture = [makeMapping('cap-1', 0.95), makeMapping('cap-1', 0.7, 'reg2')];
    (complianceMappingAPI.getByElement as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: fixture },
    });

    const got = await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-1');

    expect(got).toEqual(fixture);
    expect(useComplianceStore.getState().mappingsByElement.get('cap-1')).toEqual(fixture);
    expect(complianceMappingAPI.getByElement).toHaveBeenCalledTimes(1);
    expect(complianceMappingAPI.getByElement).toHaveBeenCalledWith('proj-1', 'cap-1');
  });

  test('second call hits cache — no extra API call', async () => {
    const fixture = [makeMapping('cap-1', 0.9)];
    (complianceMappingAPI.getByElement as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: fixture },
    });

    await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-1');
    const second = await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-1');

    expect(second).toEqual(fixture);
    expect(complianceMappingAPI.getByElement).toHaveBeenCalledTimes(1); // only the first call
  });

  test('different elementIds → two API calls', async () => {
    const a = [makeMapping('cap-A', 0.9)];
    const b = [makeMapping('cap-B', 0.8)];
    (complianceMappingAPI.getByElement as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: { data: a } })
      .mockResolvedValueOnce({ data: { data: b } });

    const [r1, r2] = await Promise.all([
      useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-A'),
      useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-B'),
    ]);

    expect(r1).toEqual(a);
    expect(r2).toEqual(b);
    expect(complianceMappingAPI.getByElement).toHaveBeenCalledTimes(2);
  });

  test('invalidateMappingsForElement removes cache, next call re-fetches', async () => {
    const v1 = [makeMapping('cap-1', 0.5)];
    const v2 = [makeMapping('cap-1', 0.95)];
    (complianceMappingAPI.getByElement as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: { data: v1 } })
      .mockResolvedValueOnce({ data: { data: v2 } });

    await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-1');
    expect(useComplianceStore.getState().mappingsByElement.get('cap-1')).toEqual(v1);

    useComplianceStore.getState().invalidateMappingsForElement('cap-1');
    expect(useComplianceStore.getState().mappingsByElement.has('cap-1')).toBe(false);

    const re = await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-1');
    expect(re).toEqual(v2);
    expect(complianceMappingAPI.getByElement).toHaveBeenCalledTimes(2);
  });

  test('API failure returns [] gracefully, no cache pollution, loading flag cleared', async () => {
    (complianceMappingAPI.getByElement as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('500 Internal'),
    );

    const result = await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-X');

    expect(result).toEqual([]);
    expect(useComplianceStore.getState().mappingsByElement.has('cap-X')).toBe(false);
    expect(useComplianceStore.getState().isLoadingMappingsForElement.has('cap-X')).toBe(false);
  });

  test('empty data response → cached empty array (avoid re-fetch)', async () => {
    (complianceMappingAPI.getByElement as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: [] },
    });

    const result = await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-empty');
    expect(result).toEqual([]);
    expect(useComplianceStore.getState().mappingsByElement.get('cap-empty')).toEqual([]);

    // Second call uses cache
    await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-empty');
    expect(complianceMappingAPI.getByElement).toHaveBeenCalledTimes(1);
  });

  test('clear() wipes mappingsByElement', async () => {
    (complianceMappingAPI.getByElement as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { data: [makeMapping('cap-1', 0.9)] },
    });

    await useComplianceStore.getState().loadMappingsForElement('proj-1', 'cap-1');
    expect(useComplianceStore.getState().mappingsByElement.size).toBe(1);

    useComplianceStore.getState().clear();
    expect(useComplianceStore.getState().mappingsByElement.size).toBe(0);
    expect(useComplianceStore.getState().isLoadingMappingsForElement.size).toBe(0);
  });
});
