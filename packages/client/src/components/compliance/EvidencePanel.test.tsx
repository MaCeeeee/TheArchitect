// @vitest-environment jsdom
/**
 * THE-576 — die Fläche für das dritte Tor.
 *
 * Gemessen in der Abnahme (THE-571): `POST …/evidence` hatte NULL Aufrufer im
 * Client. Man konnte attestieren, aber nicht belegen — genau die Behauptung
 * ohne Deckung, gegen die die Trust-Spine gebaut wurde.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../services/api', () => ({
  requirementsAPI: { listEvidence: vi.fn(), addEvidence: vi.fn() },
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import { requirementsAPI } from '../../services/api';
import toast from 'react-hot-toast';
import EvidencePanel from './EvidencePanel';

const listEvidence = vi.mocked(requirementsAPI.listEvidence);
const addEvidence = vi.mocked(requirementsAPI.addEvidence);

const evidence = (over: Record<string, unknown> = {}) => ({
  _id: 'e1',
  kind: 'Meldung',
  ref: 'https://register.example/incident/42',
  sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  collectedAt: '2026-08-01T10:00:00Z',
  collectedBy: 'u1',
  ...over,
});

function mount(over: Partial<React.ComponentProps<typeof EvidencePanel>> = {}) {
  return render(
    <EvidencePanel projectId="p1" requirementId="r1" attested={false} {...over} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listEvidence.mockResolvedValue({ data: { success: true, data: [], fresh: 0 } } as never);
});

describe('EvidencePanel — anhängen und lesen ohne Schnittstellen-Aufruf', () => {
  test('lists existing evidence with its fingerprint', async () => {
    listEvidence.mockResolvedValue({ data: { success: true, data: [evidence()], fresh: 1 } } as never);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }));

    expect(await screen.findByText('Meldung')).toBeInTheDocument();
    expect(screen.getByText(/register\.example/)).toBeInTheDocument();
    // Der Fingerabdruck ist das, was dauerhaft festgehalten wird — er gehört sichtbar.
    expect(screen.getByTestId('evidence-hash').textContent).toMatch(/^e3b0c442/);
  });

  test('a stale item looks different and says it no longer counts', async () => {
    listEvidence.mockResolvedValue({
      data: { success: true, data: [evidence({ stale: true })], fresh: 0 },
    } as never);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }));

    // Alterung kommt aus dem Drift-Lauf. Gelöscht wird nie — aber sie zählt nicht.
    expect(await screen.findByTestId('evidence-stale')).toBeInTheDocument();
    expect(screen.getByTestId('evidence-stale').textContent).toMatch(/stale|no longer counts/i);
  });

  test('says plainly that the file is NOT uploaded — only its fingerprint', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }));
    // Wer eine Datei auswählt, muss wissen, dass sie bleibt, wo sie ist.
    expect(await screen.findByTestId('no-upload-notice')).toBeInTheDocument();
    expect(screen.getByTestId('no-upload-notice').textContent).toMatch(/not uploaded|never leaves/i);
  });

  test('surfaces the SERVER reason when a ref carries credential material', async () => {
    // Die Regel bleibt server-seitig — sie hier zu duplizieren wäre der zweite
    // Katalog am API-Rand, vor dem der Modell-Kopf warnt.
    addEvidence.mockRejectedValue({
      response: { data: { error: 'ref must not carry credential material (token, password, api key)' } },
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }));
    fireEvent.change(await screen.findByLabelText(/kind/i), { target: { value: 'Meldung' } });
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: 'https://x.example/a?token=abc' } });

    const file = new File(['content'], 'meldung.pdf');
    fireEvent.change(screen.getByTestId('evidence-file'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('evidence-computed-hash')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /attach evidence/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/credential material/i);
  });

  test('cannot submit without a file — the fingerprint is never invented', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }));
    fireEvent.change(await screen.findByLabelText(/kind/i), { target: { value: 'Meldung' } });
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: 'https://register.example/x' } });

    // Ohne Datei kein Hash — und ohne Hash kein Absenden.
    expect(screen.getByRole('button', { name: /attach evidence/i })).toBeDisabled();
    expect(addEvidence).not.toHaveBeenCalled();
  });

  test('sends kind, ref and the locally computed hash — and nothing else', async () => {
    addEvidence.mockResolvedValue({ data: { success: true, data: evidence() } } as never);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /evidence/i }));
    fireEvent.change(await screen.findByLabelText(/kind/i), { target: { value: 'Bericht' } });
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: 'https://register.example/r/7' } });
    fireEvent.change(screen.getByTestId('evidence-file'), { target: { files: [new File(['abc'], 'r.pdf')] } });

    await waitFor(() => expect(screen.getByTestId('evidence-computed-hash')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /attach evidence/i }));

    await waitFor(() => expect(addEvidence).toHaveBeenCalled());
    const body = addEvidence.mock.calls[0][2];
    expect(body).toEqual({
      kind: 'Bericht',
      ref: 'https://register.example/r/7',
      // SHA-256 von "abc" — belegt, dass wirklich der DATEIINHALT gehasht wurde.
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
  });
});

// ─── REQ-576.3: die Negativ-Kontrolle ────────────────────────────────────
describe('THE-576 — ein Attest ohne Nachweis bleibt sichtbar unbelegt', () => {
  test('flags an attested requirement that has NO fresh evidence', async () => {
    listEvidence.mockResolvedValue({ data: { success: true, data: [], fresh: 0 } } as never);
    mount({ attested: true });

    // Die Fläche darf das Attest nicht implizit belegen.
    expect(await screen.findByTestId('attested-unproven')).toBeInTheDocument();
  });

  test('distinguishes "none collected" from "all stale" — two different statements', async () => {
    listEvidence.mockResolvedValue({
      data: { success: true, data: [evidence({ stale: true })], fresh: 0 },
    } as never);
    mount({ attested: true });

    const warning = await screen.findByTestId('attested-unproven');
    expect(warning.textContent).toMatch(/stale|outdated/i);
    expect(warning.textContent).not.toMatch(/none collected/i);
  });

  test('an attested requirement WITH fresh evidence carries no warning', async () => {
    listEvidence.mockResolvedValue({ data: { success: true, data: [evidence()], fresh: 1 } } as never);
    mount({ attested: true });

    await waitFor(() => expect(screen.getByRole('button', { name: /evidence/i })).toBeInTheDocument());
    expect(screen.queryByTestId('attested-unproven')).not.toBeInTheDocument();
  });
});
