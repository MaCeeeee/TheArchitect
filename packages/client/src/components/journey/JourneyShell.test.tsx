// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// ── Mocks: the shell's heavy edges. The routing/persistence logic stays real. ──
// NOTE: async factory + dynamic import — the package is ESM ("type": "module"),
// so `require` does not exist at runtime inside hoisted vi.mock factories.
let sceneMounts = 0;
let sceneUnmounts = 0;
vi.mock('../3d/Scene', async () => {
  const React = await import('react');
  return {
    default: function MockScene() {
      React.useEffect(() => {
        sceneMounts++;
        return () => { sceneUnmounts++; };
      }, []);
      return <div data-testid="scene" />;
    },
  };
});

const flyToStation = vi.fn();
vi.mock('../3d/ViewModeCamera', () => ({ flyToStation: (...a: unknown[]) => flyToStation(...a) }));

vi.mock('../../hooks/useProjectData', () => ({
  useProjectData: () => ({ loading: false, error: null }),
}));

vi.mock('../ui/PropertyPanel', () => ({ default: () => <aside data-testid="property-panel" /> }));

import { useArchitectureStore } from '../../stores/architectureStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { useUIStore } from '../../stores/uiStore';
import JourneyShell from './JourneyShell';

type JourneyState = ReturnType<typeof useJourneyStore.getState>;
type ComplianceState = ReturnType<typeof useComplianceStore.getState>;

function NavProbe() {
  const navigate = useNavigate();
  const loc = useLocation();
  return (
    <>
      <div data-testid="loc">{loc.pathname}</div>
      <button data-testid="go-govern" onClick={() => navigate('/v2/project/p1/govern')}>go</button>
    </>
  );
}

const renderShell = (initial = '/v2/project/p1') =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/v2/project/:projectId/:station?"
          element={<><JourneyShell /><NavProbe /></>}
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  sceneMounts = 0;
  sceneUnmounts = 0;
  flyToStation.mockReset();
  useArchitectureStore.setState({
    elements: [{ id: 'e1', position3D: { x: 0, y: 0, z: 0 } }] as never,
    selectedElementId: null,
  });
  // Freeze the Rail's store side-effects so seeded state survives its mount effects.
  useJourneyStore.setState({ recompute: vi.fn(), phases: [], currentPhase: 1 } as Partial<JourneyState>);
  useComplianceStore.setState({ loadPipelineStatus: vi.fn() } as Partial<ComplianceState>);
  useUIStore.setState({ isPropertyPanelOpen: false });
});

describe('JourneyShell (ADR-0005)', () => {
  test('AC-5: /v2/project/p1 resolves to the model station', () => {
    renderShell('/v2/project/p1');
    expect(flyToStation).toHaveBeenCalledWith('model', expect.any(Array));
    expect(screen.getByTestId('scene')).toBeInTheDocument();
  });

  test('AC-5: station deep-link sets the camera for that station', () => {
    renderShell('/v2/project/p1/track');
    expect(flyToStation).toHaveBeenCalledWith('track', expect.any(Array));
  });

  test('AC-1: navigating between stations never remounts the Scene', () => {
    renderShell('/v2/project/p1/model');
    const mountsAfterInitial = sceneMounts;
    fireEvent.click(screen.getByTestId('go-govern'));
    expect(screen.getByTestId('loc')).toHaveTextContent('/v2/project/p1/govern');
    expect(sceneMounts).toBe(mountsAfterInitial);
    expect(sceneUnmounts).toBe(0);
    expect(flyToStation).toHaveBeenLastCalledWith('govern', expect.any(Array));
  });

  test('AC-4: PropertyPanel appears as an overlay Sheet without a route change', () => {
    renderShell('/v2/project/p1/model');
    expect(screen.queryByTestId('property-panel')).not.toBeInTheDocument();
    act(() => {
      useUIStore.setState({ isPropertyPanelOpen: true });
      useArchitectureStore.setState({ selectedElementId: 'e1' });
    });
    expect(screen.getByTestId('property-panel')).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/v2/project/p1/model');
    expect(sceneUnmounts).toBe(0);
  });

  test('THE-482 review: PropertyPanel does NOT render on a non-model station even when open + a selection exists (StationSheet collision fix)', () => {
    renderShell('/v2/project/p1/govern');
    act(() => {
      useUIStore.setState({ isPropertyPanelOpen: true });
      useArchitectureStore.setState({ selectedElementId: 'e1' });
    });
    expect(screen.queryByTestId('property-panel')).not.toBeInTheDocument();
  });

  test('THE-482 review: PropertyPanel does NOT render on the model station when open but nothing is selected (empty-panel clutter fix)', () => {
    renderShell('/v2/project/p1/model');
    act(() => {
      useUIStore.setState({ isPropertyPanelOpen: true });
    });
    expect(screen.queryByTestId('property-panel')).not.toBeInTheDocument();
  });

  test('placeholder Sheet shows for non-migrated stations, not for model', () => {
    // getByRole, not getByText(/classic/i): the header's "Back to classic UI"
    // and the sheet's body copy would make a text query ambiguous.
    const { unmount } = renderShell('/v2/project/p1/govern');
    expect(screen.getByRole('link', { name: /open in classic ui/i })).toBeInTheDocument();
    unmount(); // screen queries span document.body — unmount before the second render
    renderShell('/v2/project/p1/model');
    expect(screen.queryByRole('link', { name: /open in classic ui/i })).not.toBeInTheDocument();
  });

  test('camera does NOT refire on model edits — only on station arrival', () => {
    renderShell('/v2/project/p1/model');
    const calls = flyToStation.mock.calls.length;
    act(() => {
      useArchitectureStore.setState({
        elements: [
          { id: 'e1', position3D: { x: 0, y: 0, z: 0 } },
          { id: 'e2', position3D: { x: 5, y: 0, z: 5 } },
        ] as never,
      });
    });
    expect(flyToStation.mock.calls.length).toBe(calls);
  });

  test('invalid station param falls back to model (canonical redirect)', () => {
    renderShell('/v2/project/p1/nonsense');
    // Exact match — a substring assertion would also pass on the
    // un-redirected '/v2/project/p1/nonsense' and verify nothing.
    expect(screen.getByTestId('loc').textContent).toMatch(/^\/v2\/project\/p1$/);
  });
});
