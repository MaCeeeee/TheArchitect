// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useJourneyStore, type PhaseInfo } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import type { StationKey } from './stations';
import StationRail from './StationRail';
import { useGroupModeStore } from '../../stores/groupModeStore';

type JourneyState = ReturnType<typeof useJourneyStore.getState>;

function LocationDisplay() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

const phase = (p: number, isDone: boolean, nextAction: PhaseInfo['nextAction'] = null): PhaseInfo => ({
  phase: p as PhaseInfo['phase'],
  admLabel: `P${p}`,
  name: `Phase ${p}`,
  description: '',
  isDone,
  progress: { current: 0, target: 1, label: '' },
  nextAction,
});

const seedStore = (overrides: Partial<JourneyState> = {}) => {
  useJourneyStore.setState({
    // Freeze recompute so seeded state survives the mount effect.
    recompute: vi.fn(),
    currentPhase: 2,
    phases: [
      phase(1, true),
      phase(2, false, { label: 'Add Connections', route: '__connection_mode__' }),
      phase(3, false), phase(4, false), phase(5, false), phase(6, false),
    ],
    ...overrides,
  } as Partial<JourneyState>);
};

beforeEach(() => {
  seedStore();
  useArchitectureStore.setState({ elements: [] as never });
});

const renderRail = (station = 'model') =>
  render(
    <MemoryRouter initialEntries={[`/v2/project/p1/${station}`]}>
      <Routes>
        <Route path="/v2/project/:projectId/:station?" element={<><StationRail projectId="p1" station={station as StationKey} /><LocationDisplay /></>} />
      </Routes>
    </MemoryRouter>,
  );

describe('StationRail (ADR-0005 AC-3)', () => {
  test('renders all six stations with plain labels and ADM badges', () => {
    renderRail();
    for (const label of ['Vision', 'Model', 'Explore', 'Plan', 'Govern', 'Track']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText('Phases B-D')).toBeInTheDocument();
  });

  test('free jumping: every station is clickable, even undone ones (no lock)', () => {
    renderRail('model');
    fireEvent.click(screen.getByRole('button', { name: /Track/ }));
    expect(screen.getByTestId('loc')).toHaveTextContent('/v2/project/p1/track');
  });

  test('current station is marked', () => {
    renderRail('model');
    expect(screen.getByRole('button', { name: /Model/ })).toHaveAttribute('aria-current', 'page');
  });

  test('surfaces the current station\'s actions when the world is non-empty', () => {
    useArchitectureStore.setState({ elements: [{ id: 'a' }] as never });
    renderRail('model'); // phase 2, nextAction 'Add Connections'
    expect(screen.getByRole('group', { name: /station actions/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Connections/i })).toBeInTheDocument();
  });

  test('renders no actions on an empty world (the empty-world CTA owns that state)', () => {
    // beforeEach already set elements to []
    renderRail('model');
    expect(screen.queryByRole('group', { name: /station actions/i })).toBeNull();
  });

  test('done stations expose a non-color complete signal for screen readers', () => {
    renderRail('model');
    expect(screen.getByRole('button', { name: /Vision.*complete/ })).toBeInTheDocument();
  });
});

describe('StationRail — group mode (UC-METH-002)', () => {
  beforeEach(() => {
    seedStore();
    useArchitectureStore.setState({ elements: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}` })) as never });
    useGroupModeStore.getState().reset();
  });

  test('station actions without the mode', () => {
    renderRail('model');
    expect(screen.getByRole('group', { name: 'Station actions' })).toBeInTheDocument();
  });

  test('group mode of this project → the rail shows the group mode instead of the station actions', () => {
    useGroupModeStore.getState().start('p1');
    renderRail('model');
    expect(screen.getByText('Select the elements of the group.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Station actions' })).not.toBeInTheDocument();
  });

  test('group mode of another project → station actions as before', () => {
    useGroupModeStore.getState().start('p2');
    renderRail('model');
    expect(screen.getByRole('group', { name: 'Station actions' })).toBeInTheDocument();
  });
});
