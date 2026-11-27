// packages/client/src/components/3d/flyToStation.test.ts
// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';

// ViewModeCamera imports R3F/drei for its component half — neutralize for node-side testing.
vi.mock('@react-three/fiber', () => ({ useThree: () => ({}), useFrame: () => {} }));
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  PerspectiveCamera: () => null,
}));

import { flyToStation, __getFlyTargetForTests } from './ViewModeCamera';

// Fixture: two elements, centroid (5, 4, 5).
const elements = [
  { id: 'a', name: 'A', type: 'application_component', layer: 'application', position3D: { x: 0, y: 0, z: 0 } },
  { id: 'b', name: 'B', type: 'node', layer: 'technology', position3D: { x: 10, y: 8, z: 10 } },
];

describe('flyToStation (ADR-0005)', () => {
  test('frames the model center', () => {
    flyToStation('model', elements);
    const t = __getFlyTargetForTests();
    expect(t).not.toBeNull();
    // lookAt = element centroid
    expect(t!.lookAt.x).toBeCloseTo(5);
    expect(t!.lookAt.z).toBeCloseTo(5);
  });

  test('different stations produce different framings', () => {
    flyToStation('model', elements);
    const model = __getFlyTargetForTests()!.position.clone();
    flyToStation('track', elements);
    const track = __getFlyTargetForTests()!.position.clone();
    expect(model.distanceTo(track)).toBeGreaterThan(1);
  });

  test('no-op on empty world: fly target is left untouched', () => {
    flyToStation('model', elements);
    const before = __getFlyTargetForTests();
    flyToStation('track', []); // empty world → must not touch the target
    expect(__getFlyTargetForTests()).toBe(before);
  });

  // THE-488 — Sheet-offset
  test('no sheet-offset by default keeps lookAt on the centroid (back-compat)', () => {
    flyToStation('track', elements);
    const t = __getFlyTargetForTests()!;
    expect(t.lookAt.x).toBeCloseTo(5);
    expect(t.lookAt.z).toBeCloseTo(5);
  });

  test('a single outlier position does not blow up the framing (robust radius/centre)', () => {
    // One element with a broken layout position (THE-490) far from the others.
    const withOutlier = [
      ...elements,
      { id: 'x', name: 'X', type: 'node', layer: 'strategy', position3D: { x: -366, y: 13, z: -1682 } },
    ];
    flyToStation('model', withOutlier);
    const t = __getFlyTargetForTests()!;
    // Camera distance stays bounded by the core (~8), not the outlier (~1700 × distFactor).
    expect(t.position.distanceTo(t.lookAt)).toBeLessThan(60);
    // Median centre stays in the core, not dragged toward z=-1682.
    expect(t.lookAt.z).toBeGreaterThan(-50);
  });

  test('sheet-offset pans the framing toward the visible area (dock-aware)', () => {
    flyToStation('model', elements); // no offset → centred on the centroid
    const centred = __getFlyTargetForTests()!.lookAt.clone();

    flyToStation('model', elements, { sheetOffsetPx: 420, sheetDock: 'right' });
    const right = __getFlyTargetForTests()!.lookAt.clone();
    flyToStation('model', elements, { sheetOffsetPx: 420, sheetDock: 'left' });
    const left = __getFlyTargetForTests()!.lookAt.clone();

    // The offset shifts the lookAt off the centroid...
    expect(right.distanceTo(centred)).toBeGreaterThan(0.5);
    // ...and the two dock sides pan in opposite directions (mirror through it):
    // their midpoint is the un-offset centroid, equal magnitudes either way.
    expect(left.distanceTo(centred)).toBeCloseTo(right.distanceTo(centred), 3);
    const mid = right.clone().add(left).multiplyScalar(0.5);
    expect(mid.distanceTo(centred)).toBeCloseTo(0, 3);
  });

  // THE-494 — instant tempo
  test('instant option is carried on the fly target; default is animated', () => {
    flyToStation('model', elements, { instant: true });
    expect(__getFlyTargetForTests()!.instant).toBe(true);
    flyToStation('model', elements);
    expect(__getFlyTargetForTests()!.instant).toBeFalsy();
  });
});
