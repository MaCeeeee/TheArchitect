// Sheet width/dock persistence — mirrors uiStore's existing manual-localStorage
// convention (ta_favorite_types, ta_show_all_sections), NOT zustand persist().
export type DockSide = 'left' | 'right';

export const SHEET_MIN = 300;
export const SHEET_MAX = 640;
export const SHEET_DEFAULT_WIDTH = 420;
const KEY_W = 'ta_sheet_width';
const KEY_DOCK = 'ta_sheet_dock';

export function clampSheetWidth(w: number): number {
  if (Number.isNaN(w)) return SHEET_DEFAULT_WIDTH;
  return Math.min(SHEET_MAX, Math.max(SHEET_MIN, Math.round(w)));
}

export function loadSheetWidth(): number {
  try {
    const raw = localStorage.getItem(KEY_W);
    if (raw == null) return SHEET_DEFAULT_WIDTH;
    const n = Number(raw);
    return Number.isFinite(n) ? clampSheetWidth(n) : SHEET_DEFAULT_WIDTH;
  } catch { return SHEET_DEFAULT_WIDTH; }
}

export function saveSheetWidth(w: number): number {
  const c = clampSheetWidth(w);
  try { localStorage.setItem(KEY_W, String(c)); } catch { /* ignore */ }
  return c;
}

export function loadSheetDock(): DockSide {
  try { return localStorage.getItem(KEY_DOCK) === 'left' ? 'left' : 'right'; }
  catch { return 'right'; }
}

export function saveSheetDock(d: DockSide): DockSide {
  try { localStorage.setItem(KEY_DOCK, d); } catch { /* ignore */ }
  return d;
}
