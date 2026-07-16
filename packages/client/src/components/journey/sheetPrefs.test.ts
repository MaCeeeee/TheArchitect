// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { SHEET_MIN, SHEET_MAX, clampSheetWidth, loadSheetWidth, saveSheetWidth, loadSheetDock, saveSheetDock } from './sheetPrefs';

beforeEach(() => { localStorage.clear(); });

describe('sheetPrefs', () => {
  test('clamp keeps width within [MIN, MAX]', () => {
    expect(clampSheetWidth(10)).toBe(SHEET_MIN);
    expect(clampSheetWidth(99999)).toBe(SHEET_MAX);
    expect(clampSheetWidth(420)).toBe(420);
  });
  test('width persists and reloads clamped; default when absent/garbage', () => {
    expect(loadSheetWidth()).toBe(420);
    saveSheetWidth(500);
    expect(localStorage.getItem('ta_sheet_width')).toBe('500');
    expect(loadSheetWidth()).toBe(500);
    localStorage.setItem('ta_sheet_width', 'not-a-number');
    expect(loadSheetWidth()).toBe(420);
    saveSheetWidth(99999);
    expect(loadSheetWidth()).toBe(SHEET_MAX);
  });
  test('dock persists; default right; only left/right accepted', () => {
    expect(loadSheetDock()).toBe('right');
    saveSheetDock('left');
    expect(loadSheetDock()).toBe('left');
    localStorage.setItem('ta_sheet_dock', 'sideways');
    expect(loadSheetDock()).toBe('right');
  });
});
