// @vitest-environment jsdom
/**
 * ADR-0008 Phase 1 (THE-562 AC 3) — die Ketten-Sichtbarkeit im Generator:
 * Engine-Badge, Quoten-Zeile und der gemessene Fehlerrest-Satz stehen in der
 * Fläche, nicht in einer Fußnote.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  requirementsAPI: {
    generate: vi.fn(),
    confirm: vi.fn(),
    projectToModel: vi.fn(),
  },
  regulationsAPI: { create: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('../../stores/architectureStore', () => ({
  useArchitectureStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ projectId: 'p1', elements: [], setElements: () => {}, setConnections: () => {} }),
}));

import { requirementsAPI } from '../../services/api';
import RequirementsGeneratorModal from './RequirementsGeneratorModal';

const generate = vi.mocked(requirementsAPI.generate);

beforeEach(() => vi.clearAllMocks());

test('shows chain stats and the measured error-rest sentence after a chain generate', async () => {
  generate.mockResolvedValue({
    data: {
      success: true,
      data: {
        engine: 'chain',
        regulation: { source: 'nis2', paragraphNumber: 'Art. 23' },
        requirements: [
          {
            title: 'Meldung übermitteln',
            description: 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht.',
            priority: 'must',
            linkedElementIds: [],
            chain: {
              regulationKey: 'nis2:art23',
              clauseContentId: 'a3f19b2c4d5e6f70',
              clauseText: 'Die Einrichtungen übermitteln … eine Meldung.',
              stakeholderRequirement: {
                text: 'Das Unternehmen übermittelt eine Meldung an das CSIRT.',
                slots: { action: 'Meldung übermitteln', recipient: 'CSIRT', modality: 'pflicht', condition: '' },
                kind: 'requirement',
                deadline: null,
              },
              systemRequirement: {
                text: 'Das Unternehmen meldet Sicherheitsvorfälle fristgerecht.',
                schutzgut: 'Netzsysteme',
                verpflichteter: 'wesentliche Einrichtung',
                ausloeser: 'Vorfall',
                nachweis: 'Meldung',
                implementationFree: true,
              },
            },
          },
        ],
        chainStats: {
          clauses: 3,
          unreadableExtractions: 0,
          splitCount: 1,
          clausesWithoutRequirement: 1,
          implFreedomViolations: 1,
          unreadableSysReqs: 0,
        },
      },
    },
  } as never);

  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText(/paste/i), {
    target: { value: 'Die Einrichtungen übermitteln binnen 72 Stunden nach Kenntnisnahme eine Meldung an das CSIRT.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(screen.getByTestId('chain-stats')).toBeInTheDocument());
  expect(screen.getByTestId('chain-stats').textContent).toMatch(/3 clauses/);
  expect(screen.getByTestId('chain-stats').textContent).toMatch(/1 rejected \(implementation-bound\)/);
  expect(screen.getByText(/68\.8% agreement/)).toBeInTheDocument();
});

test('no chain stats box for a legacy (reqgen) response', async () => {
  generate.mockResolvedValue({
    data: { success: true, data: { regulation: {}, requirements: [] } },
  } as never);

  render(<RequirementsGeneratorModal isOpen onClose={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText(/paste/i), {
    target: { value: 'Ein ausreichend langer Absatz ohne Ketten-Engine für den Legacy-Pfad des Generators.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));

  await waitFor(() => expect(generate).toHaveBeenCalled());
  expect(screen.queryByTestId('chain-stats')).not.toBeInTheDocument();
});
