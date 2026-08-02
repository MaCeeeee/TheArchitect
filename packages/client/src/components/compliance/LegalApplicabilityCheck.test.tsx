// @vitest-environment jsdom
/**
 * THE-548/555 — LegalApplicabilityCheck: vier Zustände, Zitat, ehrliche Lücken.
 *
 * Die Kern-Prüfungen entsprechen den Server-Garantien: verdrängt trägt sein
 * Zitat, unbestimmt ist nie „gilt nicht", Korpus-Ausfall ist ein eigener
 * Zustand, und ein magerer Beleg (1–2 Normsätze) wird markiert statt versteckt.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/api')>();
  return {
    ...original,
    normsAPI: { ...original.normsAPI, legalApplicability: vi.fn() },
    projectAPI: { ...original.projectAPI, get: vi.fn(), update: vi.fn() },
  };
});
import { normsAPI, projectAPI } from '../../services/api';
import LegalApplicabilityCheck from './LegalApplicabilityCheck';

const laMock = normsAPI.legalApplicability as ReturnType<typeof vi.fn>;
const projMock = projectAPI.get as ReturnType<typeof vi.fn>;

function mount() {
  return render(
    <MemoryRouter initialEntries={['/projects/p1/compliance']}>
      <Routes>
        <Route path="/projects/:projectId/compliance" element={<LegalApplicabilityCheck />} />
      </Routes>
    </MemoryRouter>,
  );
}

const BASE = {
  profilePresent: true,
  corpus: 'ok',
  disclaimer: 'Assessment based on suggested corpus typing … not legal advice.',
  laws: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  projMock.mockResolvedValue({ data: { legalProfile: { addresseeClasses: ['controller'] } } });
});

describe('LegalApplicabilityCheck', () => {
  test('renders the four states with their evidence', async () => {
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [
            { law: 'dora', expression: 'dora', state: 'applicable', reason: 'Binds …', matchedRoles: ['financial_entity'], provisionsBinding: 26, provisionsTyped: 56, provisionsTotal: 63 },
            { law: 'nis2', expression: 'nis2', state: 'displaced', reason: 'Displaced …', prevailingSource: 'dora', citations: ['DORA Art. 1 Abs. 2'], provisionsTyped: 35, provisionsTotal: 46 },
            { law: 'mdr', expression: 'mdr-de', state: 'not_applicable', reason: 'None …', missingRoles: ['manufacturer'], provisionsTyped: 101, provisionsTotal: 123 },
            { law: 'lksg', expression: 'lksg', state: 'undetermined', reason: 'No consumable typing …', provisionsTyped: 0, provisionsTotal: 24 },
          ],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText('dora')).toBeInTheDocument());
    expect(screen.getByText(/binds 26\/56 typed provisions/i)).toBeInTheDocument();
    expect(screen.getByText(/— by DORA/)).toBeInTheDocument();
    expect(screen.getByText('Not applicable')).toBeInTheDocument();
    expect(screen.getByText('Undetermined')).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });

  test('marks thin evidence — one typed provision must not look like solid ground', async () => {
    laMock.mockResolvedValue({
      data: {
        data: {
          ...BASE,
          laws: [{ law: 'emoney', expression: 'emoney-de', state: 'applicable', reason: 'Binds …', provisionsBinding: 1, provisionsTyped: 15, provisionsTotal: 24 }],
        },
      },
    });
    mount();
    await waitFor(() => expect(screen.getByText(/thin evidence/i)).toBeInTheDocument());
  });

  test('missing profile: says undetermined is NOT "does not apply"', async () => {
    laMock.mockResolvedValue({ data: { data: { ...BASE, profilePresent: false } } });
    projMock.mockResolvedValue({ data: { legalProfile: undefined } });
    mount();
    await waitFor(() =>
      expect(screen.getByText(/Unknown is not/)).toBeInTheDocument(),
    );
  });

  test('corpus outage is its own state, not an empty "nothing applies"', async () => {
    laMock.mockResolvedValue({ data: { data: { ...BASE, corpus: 'unavailable' } } });
    mount();
    await waitFor(() => expect(screen.getByText(/corpus is currently unavailable/i)).toBeInTheDocument());
    expect(screen.getByText(/not.*“no law applies”/i)).toBeInTheDocument();
  });
});
