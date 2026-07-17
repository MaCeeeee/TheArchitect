// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStationSalience } from './useStationSalience';
import { useUIStore } from '../stores/uiStore';
import { useArchitectureStore } from '../stores/architectureStore';
import { useComplianceStore } from '../stores/complianceStore';
import { RECEDE } from '../components/journey/stationSalience';

const els = [
  { id: 'a', layer: 'motivation' }, { id: 'b', layer: 'technology' },
] as never;

beforeEach(() => {
  useArchitectureStore.setState({ elements: els, connections: [] as never, selectedElementId: null });
  useComplianceStore.setState({ violationsByElement: new Map(), mappingsByElement: new Map() });
  useUIStore.setState({ journeyStation: 'vision', salienceOverride: false });
});

describe('useStationSalience (THE-500)', () => {
  test('vision recedes lower layers', () => {
    const { result } = renderHook(() => useStationSalience());
    expect(result.current.get('a')).toBe(1);
    expect(result.current.get('b')).toBe(RECEDE);
  });
  test('override flattens salience to 1', () => {
    useUIStore.setState({ salienceOverride: true });
    const { result } = renderHook(() => useStationSalience());
    expect(result.current.get('b')).toBe(1);
  });
  test('classic (journeyStation null) → all 1', () => {
    useUIStore.setState({ journeyStation: null });
    const { result } = renderHook(() => useStationSalience());
    expect(result.current.get('b')).toBe(1);
  });
});
