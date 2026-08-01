/**
 * Tests für die Auswertung des Drei-Arme-Kontrollversuchs
 * (THE-438 Slice 1, Task 6, REQ-REQHARM-001.2b).
 *
 * Hier steckt die Lehre des 2026-08-01 als Code: Am selben Tag ergaben drei
 * aufeinander folgende Messungen „0 Treffer" — mit einem Richter, dessen Rubrik
 * die gesuchte Antwort ausschloss und der über Gesetzes-Etiketten statt über
 * Text urteilte. Ein Instrument, das nie „ja" sagt, sieht aus wie ein sauberes
 * Instrument mit klarem Negativ-Befund. Deshalb ist die POSITIV-KONTROLLE hier
 * VORBEDINGUNG: fällt sie durch, wird Arm T gar nicht erst berichtet.
 */
import {
  cohensKappa,
  pairwiseKappa,
  tierFor,
  armRates,
  buildActionReport,
  meetsCoherenceGate,
  POSITIVE_CONTROL_MIN,
  COHERENCE_GATE,
} from '../evals/actionMetrics';

describe('cohensKappa (THE-438)', () => {
  it('reports perfect agreement as 1', () => {
    expect(cohensKappa([true, false, true, false], [true, false, true, false])).toBeCloseTo(1, 6);
  });

  it('reports total disagreement as negative', () => {
    expect(cohensKappa([true, false, true, false], [false, true, false, true])).toBeLessThan(0);
  });

  it('returns null when a rater is constant (prevalence trap)', () => {
    // Vergibt ein Prüfer über alle Fälle nur eine Klasse, faellt Kappa
    // rechnerisch auf 0 — auch bei 100 % Rohuebereinstimmung. Das ist KEIN
    // Uneinigkeits-Befund und darf nicht als solcher berichtet werden.
    expect(cohensKappa([true, true, true], [true, true, true])).toBeNull();
    expect(cohensKappa([true, true, true], [true, false, true])).toBeNull();
  });

  it('returns null for an empty comparison instead of NaN', () => {
    expect(cohensKappa([], [])).toBeNull();
  });

  it('throws on length mismatch rather than silently comparing a prefix', () => {
    // Ungleich lange Prueferreihen bedeuten einen Programmfehler. Stillschweigend
    // die ersten n zu vergleichen erzeugte ein plausibles, falsches Kappa —
    // genau die Fehlerklasse, gegen die dieser Slice gebaut ist.
    expect(() => cohensKappa([true, false], [true])).toThrow(/Länge/);
  });
});

describe('pairwiseKappa (THE-438)', () => {
  it('compares every pair of houses and skips cases a house did not answer', () => {
    const res = pairwiseKappa({
      haiku: [true, false, true, false],
      opus: [true, false, false, false],
      kimi: [true, false, true, null],
    });
    expect(res.map((r) => `${r.a}↔${r.b}`)).toEqual(['haiku↔opus', 'haiku↔kimi', 'opus↔kimi']);
    const hk = res.find((r) => r.b === 'kimi' && r.a === 'haiku');
    expect(hk?.n).toBe(3); // der null-Fall zaehlt nicht mit
  });

  it('carries a null kappa through instead of pretending to a number', () => {
    const res = pairwiseKappa({ a: [true, true], b: [true, true] });
    expect(res[0].kappa).toBeNull();
    expect(res[0].agreement).toBeCloseTo(1, 6);
  });
});

describe('tierFor (THE-438)', () => {
  it('assigns A only on unanimity, B on majority, C otherwise', () => {
    expect(tierFor([true, true, true])).toBe('A');
    expect(tierFor([true, true, false])).toBe('B');
    expect(tierFor([true, false, false])).toBe('C');
    expect(tierFor([false, false, false])).toBe('C');
  });

  it('ignores null votes when forming the majority instead of counting them as no', () => {
    // Ein ausgefallenes Haus ist keine Gegenstimme. 2 von 2 gueltigen = einstimmig.
    expect(tierFor([true, true, null])).toBe('A');
    expect(tierFor([true, false, null])).toBe('C'); // 1 von 2 ist keine Mehrheit
  });

  it('falls back to C when every house failed', () => {
    expect(tierFor([null, null, null])).toBe('C');
    expect(tierFor([])).toBe('C');
  });
});

describe('armRates (THE-438)', () => {
  it('counts hits and returns a rate', () => {
    expect(armRates([true, false, true, true])).toEqual({ yes: 3, n: 4, rate: 0.75 });
  });

  it('returns rate 0 for an empty arm rather than NaN', () => {
    expect(armRates([])).toEqual({ yes: 0, n: 0, rate: 0 });
  });
});

describe('buildActionReport (THE-438)', () => {
  const clean = { P: Array(20).fill(true), T: [true, true, false, false], K: Array(10).fill(false) };

  it('INVALIDATES the run when the positive control fails', () => {
    const r = buildActionReport({ P: [true, false, true, true], T: [true, false, false, false], K: [false, false] });
    expect(r.valid).toBe(false);
    expect(r.tRate).toBeNull();
    expect(r.reason).toMatch(/Positiv-Kontrolle/);
  });

  it('INVALIDATES the run when no positive control was measured at all', () => {
    // Kein Arm P heisst nicht "bestanden", sondern "nie geprueft" — genau der
    // Zustand der drei Vormittags-Messungen.
    const r = buildActionReport({ P: [], T: [true], K: [false] });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/nicht gemessen|keine Positiv-Kontrolle/i);
  });

  it('fails the run when the negative control produces any false alarm', () => {
    const r = buildActionReport({ P: Array(20).fill(true), T: [true, false], K: [false, true] });
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/Negativ-Kontrolle/);
    expect(r.tRate).toBeNull();
  });

  it('reports arm T against the instrument ceiling, not in absolute terms', () => {
    const r = buildActionReport(clean);
    expect(r.valid).toBe(true);
    expect(r.tRate).toBeCloseTo(0.5, 6);
    expect(r.tRateNormalised).toBeCloseTo(0.5, 6); // pRate = 1,0
  });

  it('normalises against a ceiling below 1 so a weak instrument is visible', () => {
    const P = [...Array(19).fill(true), false]; // 0,95 — gerade noch gueltig
    const r = buildActionReport({ ...clean, P });
    expect(r.valid).toBe(true);
    expect(r.pRate).toBeCloseTo(0.95, 6);
    expect(r.tRateNormalised).toBeCloseTo(0.5 / 0.95, 6);
  });

  it('renders a report without touching the filesystem', () => {
    const md = buildActionReport(clean).markdown;
    expect(md).toContain('Positiv-Kontrolle');
    expect(md).toContain('Negativ-Kontrolle');
    expect(md).toMatch(/\| *T /);
  });

  it('hides the T figure in the rendered report of an invalid run', () => {
    // Die Zahl darf nicht zirkulieren koennen, auch nicht als Text.
    const md = buildActionReport({ P: [false], T: [true, true], K: [false] }).markdown;
    expect(md).not.toMatch(/100 %/);
    expect(md).toMatch(/ungültig/i);
  });
});

describe('coherence gate (THE-438)', () => {
  it('pins the thresholds the slice was built against', () => {
    expect(POSITIVE_CONTROL_MIN).toBe(0.95);
    expect(COHERENCE_GATE).toBe(0.8);
  });

  it('treats the measured kappas (0,308–0,697) as below the gate', () => {
    for (const k of [0.308, 0.498, 0.697]) expect(meetsCoherenceGate(k)).toBe(false);
    expect(meetsCoherenceGate(0.8)).toBe(true);
  });

  it('treats an unmeasurable kappa as NOT meeting the gate', () => {
    // null heisst "nicht bestimmbar", nicht "bestanden".
    expect(meetsCoherenceGate(null)).toBe(false);
  });
});
