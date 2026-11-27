// packages/client/src/stores/uiStore.viewMode.test.ts
// @vitest-environment jsdom
// THE-793: Die Welt kennt nur noch 3D. Weder Store noch Quelltext dürfen einen
// View-Mode (3D / 2D / Layer) wieder einführen.
import { describe, test, expect } from 'vitest';
import { useUIStore } from './uiStore';

// Quelltexte über Vite lesen statt über node:fs — das Client-tsconfig kennt
// nur `vite/client`-Typen, `node:*`-Imports würden `tsc -b` brechen.
const SOURCES = import.meta.glob(['../**/*.{ts,tsx}', '!../stores/uiStore.viewMode.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('THE-793: kein View-Mode mehr', () => {
  test('uiStore hat keinen View-Mode und keinen Layer-Fokus', () => {
    const state = useUIStore.getState() as unknown as Record<string, unknown>;
    for (const key of ['viewMode', 'setViewMode', 'focusedLayer', 'setFocusedLayer']) {
      expect(key in state, `uiStore.${key}`).toBe(false);
    }
  });

  test('kein Quelltext kennt 2D-/Layer-Modus, View-Positionen oder LayerNavigator', () => {
    // Store-bezogen formuliert: SimulationPanel hat einen eigenen, lokalen
    // `viewMode`/`setViewMode` (useState) — der ist ein anderer Begriff und bleibt.
    const forbidden = /2d-topdown|s\.setViewMode\b|setViewMode\('(3d|layer)'\)|s\.viewMode\b|\bis2DMode\b|\bisLayerMode\b|\bisLayerView\b|\buseViewPositions\b|\bcomputeViewPositions\b|\bLayerNavigator\b|\bOrthographicCamera\b/;
    const hits = Object.entries(SOURCES).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
        .filter(({ line }) => forbidden.test(line))
        .map(({ at }) => at),
    );
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50); // Glob greift wirklich
    expect(hits).toEqual([]);
  });
});
