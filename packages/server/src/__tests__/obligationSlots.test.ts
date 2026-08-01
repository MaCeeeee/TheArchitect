/**
 * Tests für die Slot-Zerlegung einer Pflicht (THE-438 Slice 1, Task 2).
 * shared trägt keine eigenen Tests — der Testort ist der Server.
 *
 * Die vier Slots sind keine Kosmetik: Harmonisierung lebt auf GENAU EINEM davon
 * (`handlung`). `adressat` und `bedingung` sind Abweichungsträger — sie werden
 * ausgewiesen, nie eingeebnet. Würde man sie wegmitteln, entstünde der
 * Compliance-Fehler, den die Negativ-Kontrolle des Evals verhindern soll:
 * zwei Meldepflichten mit verschiedenen Behörden und Fristen sind NICHT
 * dieselbe Pflicht.
 */
import {
  ObligationSlotsSchema,
  OBLIGATION_MODALITIES,
  SLOT_UNSTATED,
  type ObligationSlots,
} from '@thearchitect/shared';

const valid: ObligationSlots = {
  handlung: 'Sicherheitsvorfall an die zuständige Behörde melden',
  empfaenger: 'die zuständige Aufsichtsbehörde',
  modalitaet: 'pflicht',
  bedingung: 'binnen 72 Stunden nach Kenntnis',
};

describe('ObligationSlots (THE-438)', () => {
  it('accepts a full decomposition', () => {
    expect(ObligationSlotsSchema.safeParse(valid).success).toBe(true);
  });

  it('requires an action — it is the slot harmonisation lives on', () => {
    expect(ObligationSlotsSchema.safeParse({ ...valid, handlung: '' }).success).toBe(false);
  });

  it('allows an unstated recipient or condition without dropping the record', () => {
    // Nicht jede Pflicht nennt beides. Ein fehlender Wert ist eine ECHTE
    // Beobachtung und darf den Datensatz nicht ungültig machen — sonst
    // verlieren wir genau die Pflichten, deren Delta wir ausweisen wollen.
    const r = ObligationSlotsSchema.safeParse({
      ...valid,
      empfaenger: SLOT_UNSTATED,
      bedingung: SLOT_UNSTATED,
    });
    expect(r.success).toBe(true);
  });

  it('still rejects a silently dropped slot — unstated must be explicit', () => {
    // '—' ist etwas anderes als "Feld fehlt". Fehlt es, war die Zerlegung
    // unvollständig und das ist ein Lauf-Fehler, keine Beobachtung.
    const { empfaenger: _drop, ...withoutRecipient } = valid;
    expect(ObligationSlotsSchema.safeParse(withoutRecipient).success).toBe(false);
  });

  it('has no addressee slot — the obliged party comes from the typed provision', () => {
    // THE-540: Der Slot hiess `adressat` und sollte den VERPFLICHTETEN tragen,
    // lieferte aber ueberwiegend den EMPFAENGER (4/20 Uebereinstimmung mit der
    // Typisierung). Umbenannt statt geloescht — der Empfaenger ist bei
    // Meldeketten die Abweichung, die zaehlt.
    expect(Object.keys(ObligationSlotsSchema.shape)).not.toContain('adressat');
    expect(Object.keys(ObligationSlotsSchema.shape)).toContain('empfaenger');
  });

  it('constrains modality to the deontic values, mirroring obligationKinds', () => {
    expect(ObligationSlotsSchema.safeParse({ ...valid, modalitaet: 'pflicht' }).success).toBe(true);
    expect(ObligationSlotsSchema.safeParse({ ...valid, modalitaet: 'vielleicht' }).success).toBe(false);
  });

  it('keeps the three deontic values aligned with the ontology triple', () => {
    expect([...OBLIGATION_MODALITIES]).toEqual(['pflicht', 'verbot', 'erlaubnis']);
  });

  it('strips nothing — the decomposition is stored verbatim', () => {
    // Die Handlungs-Formulierung ist die Eingabe der Vokabular-Ableitung.
    // Würde sie hier normalisiert, misst die Ableitung die Normalisierung.
    const wordy = { ...valid, handlung: '  Vorfall  MELDEN  ' };
    const r = ObligationSlotsSchema.safeParse(wordy);
    expect(r.success && r.data.handlung).toBe('  Vorfall  MELDEN  ');
  });
});
