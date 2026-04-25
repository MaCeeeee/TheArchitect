// BPMN-Linear pyramid layout for Activity-View.
// Apex (Process) sits at Y_APEX. Activities form 1+ horizontal rows below at Y_BASE,
// with z-depth and slight y-offset for additional rows → 3D pyramid feel.

export const Y_APEX = 12;
export const Y_BASE = 8;
const SPACING_TARGET = 3.5;
const SPACING_MIN = 2.0;
const MAX_WIDTH = 30;
const MAX_PER_ROW = 12;
const ROW_DEPTH = 3.5;
const ROW_Y_OFFSET = 0.3;

export interface PyramidPosition {
  x: number;
  y: number;
  z: number;
}

export interface LayoutResult {
  positions: PyramidPosition[];
  rowsNeeded: number;
  width: number;     // x-span of widest row
  depth: number;     // z-span of all rows combined
  spacing: number;
}

export function layoutLinear(n: number): LayoutResult {
  if (n <= 0) {
    return { positions: [], rowsNeeded: 0, width: 0, depth: 0, spacing: SPACING_TARGET };
  }

  let spacing = SPACING_TARGET;
  let rowsNeeded = 1;

  if (n > MAX_PER_ROW) {
    rowsNeeded = Math.ceil(n / MAX_PER_ROW);
    spacing = Math.max(SPACING_MIN, MAX_WIDTH / Math.max(1, MAX_PER_ROW - 1));
  } else {
    const desiredW = (n - 1) * SPACING_TARGET;
    if (desiredW > MAX_WIDTH) {
      spacing = MAX_WIDTH / Math.max(1, n - 1);
    }
  }

  const positions: PyramidPosition[] = [];
  let placed = 0;
  let maxWidth = 0;

  for (let r = 0; r < rowsNeeded; r++) {
    const remaining = n - placed;
    const itemsInRow = Math.min(MAX_PER_ROW, remaining);
    const rowWidth = (itemsInRow - 1) * spacing;
    if (rowWidth > maxWidth) maxWidth = rowWidth;

    const startX = -rowWidth / 2;
    const z = (r - (rowsNeeded - 1) / 2) * ROW_DEPTH;
    const yOffset = r * ROW_Y_OFFSET;

    for (let i = 0; i < itemsInRow; i++) {
      positions.push({
        x: startX + i * spacing,
        y: Y_BASE + yOffset,
        z,
      });
    }
    placed += itemsInRow;
  }

  const depth = (rowsNeeded - 1) * ROW_DEPTH;
  return { positions, rowsNeeded, width: maxWidth, depth, spacing };
}

// Find sequential row neighbors for a given activity index (used for flow-line layout)
export function isInSameRow(indexA: number, indexB: number): boolean {
  return Math.floor(indexA / MAX_PER_ROW) === Math.floor(indexB / MAX_PER_ROW);
}

export const LAYOUT_CONSTANTS = {
  Y_APEX,
  Y_BASE,
  MAX_PER_ROW,
  SPACING_TARGET,
  SPACING_MIN,
  MAX_WIDTH,
  ROW_DEPTH,
  ROW_Y_OFFSET,
};
