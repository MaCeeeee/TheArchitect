/**
 * Tests für das Drei-Tore-Tripel (THE-557, Slice 1 von UC-ATTEST-001).
 *
 * DIE REGEL, DIE ALLES TRÄGT: `covered` darf eine Maschine ableiten (mit
 * ausgewiesenem Grund) — `enforced` und `attested` setzt NUR ein Mensch.
 * „Ein Mensch, nicht das LLM, macht grün" (WFCOMP-Präzedenz, THE-356).
 */
import {
  emptyGates,
  deriveCovered,
  applyHumanGate,
  HUMAN_ONLY_GATES,
} from '../services/requirementGates.service';

describe('emptyGates — Bestands-done erbt keine Tiefe', () => {
  it('starts every gate at unknown', () => {
    const g = emptyGates();
    expect(g.covered.state).toBe('unknown');
    expect(g.enforced.state).toBe('unknown');
    expect(g.attested.state).toBe('unknown');
  });
});

describe('deriveCovered — mechanisch, mit ausgewiesenem Grund', () => {
  it('is yes/system when linked elements exist, and names how many', () => {
    const d = deriveCovered(['el-1', 'el-2']);
    expect(d.state).toBe('yes');
    expect(d.setBy).toBe('system');
    expect(d.reason).toMatch(/2 linked element/);
    expect(d.setAt).toBeTruthy();
  });

  it('is no/system when nothing is linked — absence is a finding, not unknown', () => {
    const d = deriveCovered([]);
    expect(d.state).toBe('no');
    expect(d.reason).toMatch(/no linked element/i);
  });
});

describe('applyHumanGate — der Notar-Akt', () => {
  const user = '507f1f77bcf86cd799439011';

  it('sets enforced with who/when/why', () => {
    const g = applyHumanGate(emptyGates(), 'enforced', 'yes', user, 'Quartals-Review 2026-Q3, alle Fälle geprüft');
    expect(g.enforced).toMatchObject({ state: 'yes', setBy: user });
    expect(g.enforced.setAt).toBeTruthy();
    // die anderen Tore bleiben unangetastet
    expect(g.covered.state).toBe('unknown');
    expect(g.attested.state).toBe('unknown');
  });

  it('REFUSES covered — the machine gate is not a human decision', () => {
    expect(() => applyHumanGate(emptyGates(), 'covered' as never, 'yes', user, 'x')).toThrow(/covered/);
  });

  it('REFUSES an empty reason — Begründung ist Pflicht, kein Formularfeld', () => {
    expect(() => applyHumanGate(emptyGates(), 'attested', 'yes', user, '   ')).toThrow(/reason/i);
  });

  it('allows an explicit NO — „geprüft und nicht wirksam" ist ein Befund', () => {
    const g = applyHumanGate(emptyGates(), 'enforced', 'no', user, 'Stichprobe: 2 von 5 Fällen laufen am Prozess vorbei');
    expect(g.enforced.state).toBe('no');
  });

  it('does not mutate the input — pure', () => {
    const before = emptyGates();
    applyHumanGate(before, 'attested', 'yes', user, 'Evidenz X liegt vor');
    expect(before.attested.state).toBe('unknown');
  });
});

describe('HUMAN_ONLY_GATES', () => {
  it('names exactly enforced and attested', () => {
    expect([...HUMAN_ONLY_GATES].sort()).toEqual(['attested', 'enforced']);
  });
});
