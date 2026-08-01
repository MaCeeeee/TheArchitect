/**
 * Slot-Zerlegung einer Pflicht (THE-438 Slice 1).
 *
 * WARUM VIER SLOTS UND NICHT EIN TEXT: Harmonisierung lebt auf genau EINEM
 * davon — der `handlung`. `adressat` und `bedingung` sind die
 * ABWEICHUNGSTRÄGER: sie werden ausgewiesen, nie eingeebnet. Würde man sie
 * wegmitteln, entstünde genau der Compliance-Fehler, den die Negativ-Kontrolle
 * des Evals verhindern soll — zwei Meldepflichten mit verschiedenen Behörden
 * und Fristen sind NICHT dieselbe Pflicht. `modalitaet` ist Filter.
 *
 * WARUM FREITEXT STATT WERTERAUM: Zwei der vier Slots hat die Ontologie
 * bereits (`partyRole` ≙ adressat, `obligationKind` ≙ modalitaet). Trotzdem
 * werden `handlung`, `adressat` und `bedingung` hier als Freitext geführt: die
 * Zerlegung folgt dem Gesetzestext und darf nicht in einen Werteraum gezwungen
 * werden. Ein erzwungener Wert ist der Hauptfehlermodus (Schema-Blindheit) —
 * und die freie Formulierung ist die EINGABE der Vokabular-Ableitung. Würde
 * hier normalisiert, misst die Ableitung die Normalisierung statt den Korpus.
 * Nur `modalitaet` ist geschlossen, weil der deontische Dreiklang feststeht.
 *
 * Linear: THE-438 · Prämisse: THE-538
 */
import { z } from 'zod';

/**
 * Wert für einen Slot, den der Gesetzestext nicht nennt.
 *
 * Bewusst ein expliziter Wert und kein `undefined`: „nicht genannt" ist eine
 * Beobachtung über die Norm, ein fehlendes Feld dagegen eine unvollständige
 * Zerlegung — also ein Lauf-Fehler. Das Schema unterscheidet beides.
 */
export const SLOT_UNSTATED = '—';

/** Deontischer Dreiklang, deckungsgleich mit der Ontologie-Facette `obligationKinds`. */
export const OBLIGATION_MODALITIES = ['pflicht', 'verbot', 'erlaubnis'] as const;
export type ObligationModality = (typeof OBLIGATION_MODALITIES)[number];

export const ObligationSlotsSchema = z.object({
  /**
   * Die Maßnahme — einziger Slot, auf dem Harmonisierung stattfindet.
   * Verbatim gespeichert, nicht getrimmt oder normalisiert (siehe Kopf).
   */
  handlung: z.string().min(1),
  /** Wer verpflichtet ist. Abweichungsträger — `SLOT_UNSTATED`, wenn ungenannt. */
  adressat: z.string().min(1),
  modalitaet: z.enum(OBLIGATION_MODALITIES),
  /** Frist, Schwelle, Auslöser. Abweichungsträger wie `adressat`. */
  bedingung: z.string().min(1),
});

export type ObligationSlots = z.infer<typeof ObligationSlotsSchema>;
