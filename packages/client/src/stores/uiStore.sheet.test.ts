// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';
import { SHEET_MAX } from '../components/journey/sheetPrefs';

beforeEach(() => { localStorage.clear(); });

describe('uiStore sheet prefs', () => {
  test('setSheetWidth clamps, updates state, and persists', () => {
    useUIStore.getState().setSheetWidth(500);
    expect(useUIStore.getState().sheetWidth).toBe(500);
    expect(localStorage.getItem('ta_sheet_width')).toBe('500');
    useUIStore.getState().setSheetWidth(99999);
    expect(useUIStore.getState().sheetWidth).toBe(SHEET_MAX);
  });
  test('toggleSheetDock flips and persists', () => {
    const start = useUIStore.getState().sheetDock;
    useUIStore.getState().toggleSheetDock();
    expect(useUIStore.getState().sheetDock).toBe(start === 'right' ? 'left' : 'right');
    expect(localStorage.getItem('ta_sheet_dock')).toBe(useUIStore.getState().sheetDock);
  });
});
