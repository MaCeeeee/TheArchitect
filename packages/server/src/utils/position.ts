// Guard for element world coordinates (THE-491, prevention follow-up to THE-490).
//
// A bad 3D drag / import / edit can otherwise persist an absurd position3D — the
// THE-490 element sat at (-366, 13, -1682) while the model core was within ±40 —
// which wrecks every consumer that averages or bounds positions (camera framing,
// fitToScreen, exports, bbox math). This is the write-path backstop; the v2
// framing (THE-488) is independently outlier-robust.

/**
 * Absolute bound for a world coordinate. Deliberately generous: the layer grid
 * keeps real layouts within ~±300 even for very large single layers, so ±1000
 * never clips a legitimate model — it only stops garbage (screen-pixel-scale
 * drags, unit bugs, non-finite values) from persisting a catastrophic position.
 */
export const POSITION_BOUND = 1000;

/** Clamp one coordinate into [-POSITION_BOUND, POSITION_BOUND]; non-finite → 0. */
export function clampCoord(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-POSITION_BOUND, Math.min(POSITION_BOUND, v));
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/** Clamp all three coordinates of a world position (see clampCoord). */
export function clampPosition3D(p: Position3D): Position3D {
  return { x: clampCoord(p.x), y: clampCoord(p.y), z: clampCoord(p.z) };
}
