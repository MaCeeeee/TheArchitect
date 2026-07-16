import { clampCoord, clampPosition3D, POSITION_BOUND } from '../utils/position';

describe('position clamp (THE-491)', () => {
  test('clamps coordinates beyond the bound', () => {
    expect(clampCoord(-1682)).toBe(-POSITION_BOUND); // the THE-490 case
    expect(clampCoord(50000)).toBe(POSITION_BOUND);
    expect(clampCoord(POSITION_BOUND + 1)).toBe(POSITION_BOUND);
  });

  test('non-finite coordinates collapse to 0 (never NaN/Infinity)', () => {
    expect(clampCoord(NaN)).toBe(0);
    expect(clampCoord(Infinity)).toBe(0);
    expect(clampCoord(-Infinity)).toBe(0);
  });

  test('in-range values pass through unchanged (no regression on normal layouts)', () => {
    expect(clampCoord(7.5)).toBe(7.5);
    expect(clampCoord(-40)).toBe(-40);
    expect(clampCoord(0)).toBe(0);
    expect(clampCoord(POSITION_BOUND)).toBe(POSITION_BOUND);
  });

  test('clampPosition3D bounds the THE-490 position', () => {
    // z is catastrophic → clamped; x/y within the generous bound → untouched.
    expect(clampPosition3D({ x: -366, y: 13, z: -1682 })).toEqual({ x: -366, y: 13, z: -POSITION_BOUND });
  });

  test('clampPosition3D leaves a normal in-layer position untouched', () => {
    expect(clampPosition3D({ x: 7.5, y: 13, z: 0 })).toEqual({ x: 7.5, y: 13, z: 0 });
  });
});
