// @vitest-environment jsdom
/**
 * THE-810: While the connection type picker is open it owns the keyboard.
 * The spy stands in for the scene handlers (Toolbar, ProjectView, ViewModeCamera):
 * a keydown listener on window in the BUBBLE phase.
 */
import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import {
  getValidRelationships,
  getDefaultRelationship,
} from '@thearchitect/shared/src/constants/archimate-rules';
import ConnectionTypePicker from './ConnectionTypePicker';

// application_component -> application_component offers several types;
// the default (specialization) is not the last one, so ArrowDown has somewhere to go.
const SRC = { id: 'src', name: 'Source App', type: 'application_component', layer: 'application', togafDomain: 'application', position3D: { x: 0, y: 0, z: 0 } };
const TGT = { id: 'tgt', name: 'Target App', type: 'application_component', layer: 'application', togafDomain: 'application', position3D: { x: 2, y: 0, z: 0 } };

const KEYS = ['Escape', 'ArrowDown', 'Backspace', 'Delete', 'c'] as const;

let sceneSpy: Mock<(e: KeyboardEvent) => void>;

function openPicker() {
  useUIStore.setState({
    isConnectionMode: true,
    connectionSourceId: 'src',
    connectionTargetId: 'tgt',
    showConnectionPicker: true,
    connectionPickerPosition: { x: 100, y: 100 },
    activeViewpoint: null,
    focusedLayer: 'application',
  });
}

function closedPicker() {
  useUIStore.setState({
    isConnectionMode: true,
    connectionSourceId: 'src',
    connectionTargetId: null,
    showConnectionPicker: false,
    connectionPickerPosition: null,
    activeViewpoint: null,
    focusedLayer: 'application',
  });
}

beforeEach(() => {
  // projectId null → addConnection does not call the server
  // cast: the test elements carry only the fields the picker reads
  useArchitectureStore.setState({ projectId: null, elements: [SRC, TGT] as never, connections: [], selectedElementId: null, selectedElementIds: new Set<string>() });
  sceneSpy = vi.fn<(e: KeyboardEvent) => void>();
  window.addEventListener('keydown', sceneSpy); // bubble phase, like the scene handlers
});

afterEach(() => {
  window.removeEventListener('keydown', sceneSpy);
  cleanup();
});

describe('ConnectionTypePicker — owns the keyboard while open (THE-810)', () => {
  test.each(KEYS)('open picker: %s does not reach a bubble listener on window', (key) => {
    openPicker();
    render(<ConnectionTypePicker />);
    fireEvent.keyDown(document.body, { key });
    expect(sceneSpy).not.toHaveBeenCalled();
  });

  test('closed picker: the same keys DO reach the bubble listener (negative control)', () => {
    closedPicker();
    render(<ConnectionTypePicker />);
    for (const key of KEYS) fireEvent.keyDown(document.body, { key });
    expect(sceneSpy).toHaveBeenCalledTimes(KEYS.length);
  });

  test('Escape closes the picker; a later Backspace reaches the scene (listener removed)', () => {
    openPicker();
    render(<ConnectionTypePicker />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sceneSpy).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Backspace' });
    expect(sceneSpy).toHaveBeenCalledTimes(1);
  });

  describe('with scene stand-ins', () => {
    // Stand-in for the real scene handlers (Toolbar, ProjectView, ViewModeCamera), minus their side effects.
    const standIn = (e: KeyboardEvent): void => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        useArchitectureStore.setState((s) => ({ elements: s.elements.filter((el) => el.id !== s.selectedElementId) }));
      } else if (e.key === 'Escape') {
        useUIStore.getState().exitConnectionMode();
      } else if (e.key === 'ArrowDown') {
        useUIStore.setState({ focusedLayer: 'technology' });
      }
    };
    beforeEach(() => window.addEventListener('keydown', standIn));
    afterEach(() => window.removeEventListener('keydown', standIn));

    test('Escape closes only the picker; connection mode stays on', () => {
      openPicker();
      render(<ConnectionTypePicker />);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      const ui = useUIStore.getState();
      expect(ui.showConnectionPicker).toBe(false);
      expect(ui.isConnectionMode).toBe(true);
      expect(ui.connectionSourceId).toBeNull();
    });

    test('ArrowDown changes only the type; Enter then creates the next type, layer unchanged', () => {
      const valid = getValidRelationships('application_component', 'application_component');
      const idx = valid.indexOf(getDefaultRelationship('application_component', 'application_component'));
      expect(idx, 'precondition: default must not be the last valid type').toBeLessThan(valid.length - 1);

      openPicker();
      render(<ConnectionTypePicker />);
      fireEvent.keyDown(document.body, { key: 'ArrowDown' });
      fireEvent.keyDown(document.body, { key: 'Enter' });

      const conns = useArchitectureStore.getState().connections;
      expect(conns).toHaveLength(1);
      expect(conns[0].type).toBe(valid[idx + 1]);
      expect(useUIStore.getState().focusedLayer).toBe('application');
    });

    test('Backspace with the picker open leaves both elements in place', () => {
      useArchitectureStore.setState({ selectedElementId: 'src' });
      openPicker();
      render(<ConnectionTypePicker />);
      fireEvent.keyDown(document.body, { key: 'Backspace' });
      expect(useArchitectureStore.getState().elements.map((e) => e.id)).toEqual(['src', 'tgt']);
      expect(useUIStore.getState().showConnectionPicker).toBe(true);
    });
  });
});
