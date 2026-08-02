/**
 * Tests für das Fristobjekt ⟨Dauer, Bezugspunkt, Stufe⟩ (THE-549).
 *
 * DER BEFUND DAHINTER (Primärquellenprüfung 2026-08-01): NIS2 zählt seine
 * Melde-Fristen ab Kenntnis, DORA ab der jeweils vorangegangenen Meldung.
 * `"72 Stunden ab Kenntnis"` und `"72 Stunden ab Erstmeldung"` sehen als
 * String fast gleich aus und bedeuten etwas völlig anderes — ein System, das
 * eine Frist für beide berechnet, rechnet für eine falsch.
 *
 * Der `bezugspunkt` ist die Achse, die bisher vollständig fehlte.
 *
 * ── ABBRUCHBEDINGUNG (aus dem Ticket, vorab) ──
 * Kommen über die vier Normsätze A–D weniger als DREI verschiedene
 * Bezugspunkte heraus, ist die Achse nicht extrahierbar → Ticket schließt
 * negativ. P-1 unten IST diese Messung.
 */
import {
  deriveDeadline,
  bindingDeadlines,
  deadlineToHours,
  type Deadline,
} from '@thearchitect/shared';

// ── Die Fristklauseln der vier Normsätze ─────────────────────────────────
// Formulierungen nach der Primärquellenprüfung vom 2026-08-01
// (docs/strategy/2026-08-01-the538-dora-meldepflicht.md, dort gegen EUR-Lex
// geprüft). Für den Parser zählt die Formulierungsklasse, nicht das Byte.
const CLAUSES = {
  // A — DSGVO Art. 33 Abs. 1
  dsgvo33:
    'Im Falle einer Verletzung des Schutzes personenbezogener Daten meldet der Verantwortliche unverzüglich und möglichst binnen 72 Stunden, nachdem ihm die Verletzung bekannt wurde, diese der zuständigen Aufsichtsbehörde.',
  // B — DSGVO Art. 34 Abs. 1: unverzüglich, KEINE bezifferte Frist
  dsgvo34:
    'Hat die Verletzung des Schutzes personenbezogener Daten voraussichtlich ein hohes Risiko zur Folge, so benachrichtigt der Verantwortliche die betroffene Person unverzüglich von der Verletzung.',
  // C — NIS2 Art. 23 Abs. 4: drei Stufen
  nis2Frueh:
    'Die Einrichtungen übermitteln unverzüglich, spätestens jedoch innerhalb von 24 Stunden nach Kenntnisnahme des erheblichen Sicherheitsvorfalls, eine Frühwarnung an das CSIRT oder die zuständige Behörde.',
  nis2Meldung:
    'Die Einrichtungen übermitteln unverzüglich, spätestens jedoch innerhalb von 72 Stunden nach Kenntnisnahme des erheblichen Sicherheitsvorfalls, eine Meldung mit einer Aktualisierung der Informationen der Frühwarnung.',
  nis2Abschluss:
    'Die Einrichtungen übermitteln spätestens einen Monat nach Übermittlung der Meldung des Sicherheitsvorfalls einen Abschlussbericht.',
  // D — DORA Art. 19 i. V. m. RTS (EU) 2025/301: drei Stufen
  doraErst:
    'Das Finanzunternehmen übermittelt die Erstmeldung innerhalb von 4 Stunden nach der Einstufung des Vorfalls als schwerwiegend, spätestens jedoch 24 Stunden nach Kenntnisnahme.',
  doraZwischen:
    'Das Finanzunternehmen übermittelt den Zwischenbericht innerhalb von 72 Stunden nach der Übermittlung der Erstmeldung.',
  doraAbschluss:
    'Das Finanzunternehmen übermittelt den Abschlussbericht spätestens einen Monat nach der Übermittlung des Zwischenberichts.',
};

describe('deriveDeadline — mechanisch, kein Modell (THE-549)', () => {
  it('reads duration, reference point and stage from DSGVO Art. 33', () => {
    const d = deriveDeadline(CLAUSES.dsgvo33);
    expect(d).toEqual({
      dauer: { wert: 72, einheit: 'h' },
      bezugspunkt: 'kenntnis',
      stufe: 'erst',
      quelle: CLAUSES.dsgvo33,
    });
  });

  it('AC-2: every derived object carries its source text', () => {
    for (const text of [CLAUSES.nis2Frueh, CLAUSES.doraZwischen]) {
      const d = deriveDeadline(text);
      expect(d?.quelle).toBe(text);
    }
  });

  it('N-2 / AC-3: "unverzüglich" without a number yields null — no invented value', () => {
    expect(deriveDeadline(CLAUSES.dsgvo34)).toBeNull();
  });

  it('AC-3: a duration whose clock is unstated yields null — no default reference point', () => {
    // Eine Frist, deren Uhr niemand kennt, kann man nicht rechnen. Sie doch zu
    // tragen hiesse, still falsch zu rechnen — die teuerste Fehlerrichtung.
    expect(deriveDeadline('Die Meldung ist binnen 48 Stunden zu übermitteln.')).toBeNull();
  });

  it('returns null for a clause without any deadline', () => {
    expect(deriveDeadline('Das Unternehmen dokumentiert jede Verletzung.')).toBeNull();
  });

  it('distinguishes the two 72-hour clauses — the whole point of the axis', () => {
    const nis2 = deriveDeadline(CLAUSES.nis2Meldung);
    const dora = deriveDeadline(CLAUSES.doraZwischen);
    expect(nis2?.dauer).toEqual({ wert: 72, einheit: 'h' });
    expect(dora?.dauer).toEqual({ wert: 72, einheit: 'h' });
    // Gleiche Dauer — verschiedene Uhr.
    expect(nis2?.bezugspunkt).toBe('kenntnis');
    expect(dora?.bezugspunkt).toBe('vorherige-meldung');
  });

  it('DORA initial notification counts from CLASSIFICATION, not from awareness', () => {
    const d = deriveDeadline(CLAUSES.doraErst);
    expect(d?.dauer).toEqual({ wert: 4, einheit: 'h' });
    expect(d?.bezugspunkt).toBe('einstufung');
    expect(d?.stufe).toBe('erst');
  });

  it('reads month-based deadlines', () => {
    const d = deriveDeadline(CLAUSES.nis2Abschluss);
    expect(d?.dauer).toEqual({ wert: 1, einheit: 'mon' });
    expect(d?.stufe).toBe('abschluss');
  });
});

describe('P-1/P-2 — die Positiv-Kontrollen aus dem Ticket, vorab festgelegt', () => {
  const all = Object.values(CLAUSES)
    .map((text) => deriveDeadline(text))
    .filter((d): d is Deadline => d !== null);

  it('P-1: at least THREE distinct reference points across A–D — else the axis is not extractable', () => {
    const distinct = new Set(all.map((d) => d.bezugspunkt));
    // < 3 => Abbruchbedingung: Ticket schliesst negativ.
    expect(distinct.size).toBeGreaterThanOrEqual(3);
  });

  it('P-2: DORA stage 2 → vorherige-meldung; NIS2 stage 2 → kenntnis', () => {
    expect(deriveDeadline(CLAUSES.doraZwischen)?.bezugspunkt).toBe('vorherige-meldung');
    expect(deriveDeadline(CLAUSES.nis2Meldung)?.bezugspunkt).toBe('kenntnis');
  });

  it('names an honest correction: NIS2 final report does NOT count from awareness', () => {
    // Die vereinfachte Formel "NIS2 zaehlt durchgehend ab Kenntnis" stimmt fuer
    // Fruehwarnung und Meldung — der Abschlussbericht zaehlt ab Uebermittlung
    // der Meldung. Der Parser muss das ausweisen, nicht glaetten.
    expect(deriveDeadline(CLAUSES.nis2Abschluss)?.bezugspunkt).toBe('vorherige-meldung');
  });
});

describe('bindingDeadlines — AC-4/N-1: verschiedene Uhren werden NIE verrechnet', () => {
  const d = (wert: number, einheit: 'h' | 'd' | 'mon', bezugspunkt: Deadline['bezugspunkt']): Deadline => ({
    dauer: { wert, einheit },
    bezugspunkt,
    stufe: null,
    quelle: 'test',
  });

  it('N-1: 4h (ab Einstufung) and 72h (ab Kenntnis) do NOT collapse to "4h"', () => {
    const result = bindingDeadlines([d(4, 'h', 'einstufung'), d(72, 'h', 'kenntnis')]);
    // Zwei Gruppen, zwei Antworten — es gibt KEINE Funktion, die daraus eine macht.
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.bezugspunkt).sort()).toEqual(['einstufung', 'kenntnis']);
  });

  it('AC-4: within the SAME reference point the shortest duration binds', () => {
    const result = bindingDeadlines([d(72, 'h', 'kenntnis'), d(24, 'h', 'kenntnis')]);
    expect(result).toHaveLength(1);
    expect(result[0].binding.dauer).toEqual({ wert: 24, einheit: 'h' });
  });

  it('orders across units (a month is longer than 72 hours)', () => {
    const result = bindingDeadlines([d(1, 'mon', 'vorherige-meldung'), d(72, 'h', 'vorherige-meldung')]);
    expect(result[0].binding.dauer).toEqual({ wert: 72, einheit: 'h' });
  });

  it('exposes the unit conversion only for ORDERING, with documented approximation', () => {
    expect(deadlineToHours({ wert: 1, einheit: 'mon' })).toBeGreaterThan(deadlineToHours({ wert: 3, einheit: 'd' }));
    expect(deadlineToHours({ wert: 2, einheit: 'd' })).toBe(48);
  });

  it('returns [] for no deadlines — not a fabricated answer', () => {
    expect(bindingDeadlines([])).toEqual([]);
  });
});

describe('Der Satz aus dem Plan — jetzt berechenbar', () => {
  it('Bank: binding first-notification deadline is 4h from classification (DORA), and DSGVO 72h from awareness stays SEPARATE', () => {
    const bank = [deriveDeadline(CLAUSES.dsgvo33), deriveDeadline(CLAUSES.doraErst)].filter(
      (x): x is Deadline => x !== null,
    );
    const result = bindingDeadlines(bank);
    const einstufung = result.find((r) => r.bezugspunkt === 'einstufung');
    const kenntnis = result.find((r) => r.bezugspunkt === 'kenntnis');
    expect(einstufung?.binding.dauer).toEqual({ wert: 4, einheit: 'h' });
    expect(kenntnis?.binding.dauer).toEqual({ wert: 72, einheit: 'h' });
  });

  it('Energieversorger: 24h from awareness binds (NIS2 early warning beats DSGVO 72h)', () => {
    const evu = [deriveDeadline(CLAUSES.dsgvo33), deriveDeadline(CLAUSES.nis2Frueh)].filter(
      (x): x is Deadline => x !== null,
    );
    const result = bindingDeadlines(evu);
    expect(result).toHaveLength(1);
    expect(result[0].bezugspunkt).toBe('kenntnis');
    expect(result[0].binding.dauer).toEqual({ wert: 24, einheit: 'h' });
  });
});
