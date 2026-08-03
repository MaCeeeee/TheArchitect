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
