/**
 * Tests für das Verdrängungs-Gate (THE-563, Slice 1 von UC-REQTRACE-001).
 *
 * DIE REGEL: Verdrängung ist eine ONTOLOGIE-KANTE mit Zitat und greift
 * MECHANISCH, bevor irgendein Modell befragt wird (Lauf-4-Negativ-Kontrolle:
 * „NIS2 Art. 23 × DORA Art. 19 durch Verdrängung ausgeschlossen, bevor ein
 * Modell befragt wurde").
 *
 * Die Paar-Semantik stammt aus der GEMESSENEN Eval-Logik
 * (measureGrouping.displacementFor): geprüft wird mit der Adressatenklasse
 * der VORRANGIGEN Seite — ein Finanzunternehmen ist zugleich wesentliche
 * Einrichtung; fragte man mit der Klasse der verdrängten Seite, fände man
 * die Kante nicht.
 */
import { evaluateDisplacement } from '../services/displacementGate.service';

const doraReq = { source: 'dora', addresseeClass: 'financial_entity' };
const nis2Req = { source: 'nis2', addresseeClass: 'essential_important_entity' };
const dsgvoReq = { source: 'dsgvo', addresseeClass: 'controller' };

describe('evaluateDisplacement — die Kante entscheidet, mit Zitat', () => {
  it('excludes the DORA×NIS2 pair for a financial entity — edge id and citations carried', () => {
    const r = evaluateDisplacement(nis2Req, doraReq);
    expect(r).not.toBeNull();
    expect(r!.displaced).toBe('nis2');
    expect(r!.prevailing).toBe('dora');
    expect(r!.addresseeClass).toBe('financial_entity');
    expect(r!.citations.join(' ')).toMatch(/Art\. 1|Art\. 4/);
  });

  it('is order-independent — the edge decides, not the argument position', () => {
    const ab = evaluateDisplacement(nis2Req, doraReq);
    const ba = evaluateDisplacement(doraReq, nis2Req);
    expect(ab).toEqual(ba);
  });

  it('returns null for pairs without a displacement edge', () => {
    expect(evaluateDisplacement(dsgvoReq, nis2Req)).toBeNull();
    expect(evaluateDisplacement(dsgvoReq, doraReq)).toBeNull();
  });

  it('returns null for same-source pairs — a law does not displace itself', () => {
    expect(evaluateDisplacement(doraReq, { source: 'dora', addresseeClass: 'financial_entity' })).toBeNull();
  });

  it('does not displace when neither side carries the addressee class of the edge', () => {
    // Zwei NIS2-fremde Adressaten: die Kante verlangt financial_entity auf der
    // vorrangigen Seite — ohne sie bleibt das Paar bestehen.
    expect(
      evaluateDisplacement(
        { source: 'nis2', addresseeClass: 'essential_important_entity' },
        { source: 'dora', addresseeClass: 'ict_provider' },
      ),
    ).toBeNull();
  });
});

/**
 * THE-600 — die Kante gilt für das GESETZ, nicht für die Schreibweise.
 *
 * Der Korpus-Pfad (seit THE-570 der Hauptpfad) liefert Werk-Stämme wie
 * `nis2-de`; die Ontologie-Kante ist auf `nis2` gestellt. Vor diesem Fix
 * verglich das Gate exakt — drei von vier Stamm-Kombinationen waren stumm,
 * und ein rechtlich gegenstandsloses Paar erreichte den Richter. Gemessen
 * am 2026-08-05 (Pre-Flight-Probe), nicht vermutet.
 */
describe('evaluateDisplacement — Werk-Stämme (THE-600)', () => {
  const doraDe = { source: 'dora-de', addresseeClass: 'financial_entity' };
  const nis2De = { source: 'nis2-de', addresseeClass: 'essential_important_entity' };

  it('fires for -de work stems — the canonical corpus path', () => {
    const r = evaluateDisplacement(nis2De, doraDe);
    expect(r).not.toBeNull();
    // Das Verdikt behält die SPRACHFASSUNG der Beteiligten — die Anzeige
    // darf nicht verlieren, welches Werk tatsächlich im Paar stand.
    expect(r!.displaced).toBe('nis2-de');
    expect(r!.prevailing).toBe('dora-de');
    expect(r!.citations.join(' ')).toMatch(/Art\. 1|Art\. 4/);
  });

  it('fires for mixed stems — both directions', () => {
    expect(evaluateDisplacement({ ...nis2De, source: 'nis2' }, doraDe)).not.toBeNull();
    expect(evaluateDisplacement(nis2De, { ...doraDe, source: 'dora' })).not.toBeNull();
  });

  it('treats two expressions of the SAME law as one law — no self-displacement, no pair', () => {
    expect(
      evaluateDisplacement({ source: 'nis2', addresseeClass: 'essential_important_entity' }, nis2De),
    ).toBeNull();
  });

  it('does not confuse a real suffix with a name that merely ends alike', () => {
    // Ein Gesetz, dessen Name auf „de" endet, ohne Sprachsuffix zu sein,
    // bleibt es selbst — normalizeCorpusSource schneidet nur `-de`/`-en`.
    expect(
      evaluateDisplacement(
        { source: 'trade', addresseeClass: 'financial_entity' },
        doraReq,
      ),
    ).toBeNull();
  });
});
