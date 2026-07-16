// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

// Drive the journey + architecture stores the component reads.
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
// Explicit .tsx extension (THE-492): disambiguates from the sibling
// 'stationActions.ts' curation module, whose basename collides with this
// component's under case-insensitive filesystems (default macOS APFS). See
// the comment in StationActions.tsx's own import of that module.
import StationActions from './StationActions.tsx';

const seedPhases = (nextLabel: string | null) =>
  useJourneyStore.setState({
    currentPhase: 2,
    phases: ([1, 2, 3, 4, 5, 6] as const).map((p) => ({
      phase: p, admLabel: '', name: '', description: '', isDone: false,
      progress: { current: 0, target: 1, label: '' },
      nextAction: p === 2 && nextLabel ? { label: nextLabel, route: '__connection_mode__' } : null,
    })),
  });

beforeEach(() => {
  navigate.mockReset();
  useArchitectureStore.setState({ elements: [{ id: 'a' }] as never });
  seedPhases('Add Connections');
});

const renderIt = (station = 'model') =>
  render(<MemoryRouter><StationActions station={station as never} projectId="p1" /></MemoryRouter>);

describe('StationActions (THE-492)', () => {
  test('renders the station actions and executes on click', () => {
    renderIt('model');
    const primary = screen.getByRole('button', { name: /Add Connections/i });
    fireEvent.click(primary);
    expect(navigate).toHaveBeenCalledWith('/project/p1'); // sentinel resolved to classic
  });

  test('renders nothing when the world is empty (empty-world CTA owns that state)', () => {
    useArchitectureStore.setState({ elements: [] as never });
    const { container } = renderIt('model');
    expect(container).toBeEmptyDOMElement();
  });
});
