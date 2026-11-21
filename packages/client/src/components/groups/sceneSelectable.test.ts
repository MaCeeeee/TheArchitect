/**
 * UC-METH-002 — the group mode can select only where the scene shows the element boxes
 * (not in the plateau view, the v2 track re-form or the activity view; same conditions as Scene.tsx).
 * Run: cd packages/client && npx vitest run src/components/groups/sceneSelectable.test.ts
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../stores/uiStore';
import { useRoadmapStore } from '../../stores/roadmapStore';
import { useActivityViewStore } from '../../stores/activityViewStore';
import { groupModeAvailableInScene } from './sceneSelectable';

beforeEach(() => {
  useUIStore.setState({ viewMode: '3d', journeyStation: null });
  useRoadmapStore.setState({ isPlateauViewActive: false, plateauSnapshots: [] });
  useActivityViewStore.setState({ isActive: false });
});

describe('groupModeAvailableInScene', () => {
  test('the normal 3D scene → available', () => {
    expect(groupModeAvailableInScene()).toBe(true);
  });
  test('plateau view → not available', () => {
    useRoadmapStore.setState({ isPlateauViewActive: true });
    expect(groupModeAvailableInScene()).toBe(false);
  });
  test('v2 track re-form (station track with plateaus) → not available; station track without plateaus → available', () => {
    useUIStore.setState({ journeyStation: 'track' });
    expect(groupModeAvailableInScene()).toBe(true);
    useRoadmapStore.setState({ plateauSnapshots: [{}] as never });
    expect(groupModeAvailableInScene()).toBe(false);
  });
  test('activity view → not available', () => {
    useActivityViewStore.setState({ isActive: true });
    expect(groupModeAvailableInScene()).toBe(false);
  });
  test('not 3D: the scene shows the elements → available', () => {
    useUIStore.setState({ viewMode: 'layer' });
    useRoadmapStore.setState({ isPlateauViewActive: true });
    expect(groupModeAvailableInScene()).toBe(true);
  });
});
