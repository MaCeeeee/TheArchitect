// loadProjectFacts + evaluateSignals mocken — pure Profil-Logik isoliert testen.
const mockFacts = jest.fn();
const mockSignals = jest.fn();
jest.mock('../services/regulationApplicability.service', () => ({
  loadProjectFacts: (...a: unknown[]) => mockFacts(...a),
  evaluateSignals: (...a: unknown[]) => mockSignals(...a),
}));

import { buildUseCaseProfile, PROFILE_CHAR_BUDGET } from '../services/useCaseProfile.service';

const facts = (elements: unknown[], projectFields: unknown[] = []) => ({ projectId: 'p1', elements, projectFields });

describe('buildUseCaseProfile', () => {
  // WICHTIG: echte ApplicabilitySignalResult-Shape ist { id,label,description,detected,evidence,matchCount }
  // (applicability.types.ts) — NICHT `triggered`. Mock muss `detected` verwenden, sonst maskiert der Test einen Bug.
  const signal = (id: string, detected: boolean) => ({ id, label: id, description: '', detected, evidence: [], matchCount: detected ? 1 : 0 });

  it('ist deterministisch: 2× bauen ⇒ identisch, Signal-Hints + Marker im Text', async () => {
    mockFacts.mockResolvedValue(facts([
      { id: 'b', name: 'Billing', type: 'application-component', layer: 'application', description: 'invoices', fromWizard: false },
      { id: 'a', name: 'Auth', type: 'application-component', layer: 'application', description: 'login', sensitivity: 'PII', fromWizard: true },
    ], [{ name: 'vision', value: 'sell cars' }]));
    mockSignals.mockReturnValue([signal('personal-data', true), signal('cloud-services', false)]);
    const a = await buildUseCaseProfile('p1');
    const b = await buildUseCaseProfile('p1');
    expect(a).toEqual(b);
    expect(a.signalHints).toEqual(['personal-data']); // nur detected
    expect(a.text).toContain('signals: personal-data');
    expect(a.text).toContain('PII');          // Sensitivity inline (Embedding sieht es)
    expect(a.text).toContain('AI-generated'); // Wizard-Provenienz inline
  });

  it('gruppiert Element-Zeilen je Layer (AC-1)', async () => {
    mockFacts.mockResolvedValue(facts([
      { id: 'p', name: 'Pay', type: 'business-process', layer: 'business', description: 'x', fromWizard: false },
      { id: 'a', name: 'Api', type: 'application-component', layer: 'application', description: 'y', fromWizard: false },
    ], []));
    mockSignals.mockReturnValue([]);
    const p = await buildUseCaseProfile('p1');
    expect(p.text).toMatch(/\[application\]/);
    expect(p.text).toMatch(/\[business\]/);
  });

  it('priorisiert PII/Wizard/hohe Sensitivity beim Kürzen — auch über Layer-Grenzen (AC-2)', async () => {
    // ADVERSARIAL: das PII/Wizard-Element liegt in einem alphabetisch SPÄTEREN Layer
    // (`technology`) als der Filler (`application`). Bei layer-primärer Auswahl würde
    // das Budget von den `application`-Fillern aufgebraucht und das PII-Element fiele weg.
    // Zwei-Pass (Auswahl per Priorität, Rendering per Layer) muss es trotzdem behalten.
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, name: `El${i}`, type: 'node', layer: 'application', description: 'x'.repeat(50), fromWizard: false }));
    many.push({ id: 'pii', name: 'PII Store', type: 'data-object', layer: 'technology', description: 'personal', sensitivity: 'PII', fromWizard: true } as never);
    mockFacts.mockResolvedValue(facts(many));
    mockSignals.mockReturnValue([]);
    const p = await buildUseCaseProfile('p1');
    expect(p.text).toContain('PII Store'); // priorisiertes Element überlebt die Kürzung
    expect(p.meta.truncated).toBe(true);
    expect(p.text.length).toBeLessThanOrEqual(PROFILE_CHAR_BUDGET);
  });

  it('leeres Modell ⇒ definiertes Minimal-Profil', async () => {
    mockFacts.mockResolvedValue(facts([], []));
    mockSignals.mockReturnValue([]);
    const p = await buildUseCaseProfile('p1');
    expect(p.meta.elementsTotal).toBe(0);
    expect(p.signalHints).toEqual([]);
    expect(typeof p.text).toBe('string');
  });
});
