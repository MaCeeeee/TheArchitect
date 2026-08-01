/**
 * Slot-Zerlegung einer Pflicht (THE-438 Slice 1).
 *
 * WARUM VIER SLOTS UND NICHT EIN TEXT: Harmonisierung lebt auf genau EINEM
 * davon — der `handlung`. `adressat` und `bedingung` sind die
 * ABWEICHUNGSTRÄGER: sie werden ausgewiesen, nie eingeebnet. Würde man sie
 * wegmitteln, entstünde genau der Compliance-Fehler, den die Negativ-Kontrolle
 * des Evals verhindern soll — zwei Meldepflichten mit verschiedenen Behörden
 * und Fristen sind NICHT dieselbe Pflicht.
 *
 * ── WAS DIE SLOTS TATSÄCHLICH TRAGEN (gemessen, 219 Pflichten, THE-542) ──
 *
 *   handlung   219/219 = 100 %, 216 verschiedene Formulierungen
 *   bedingung  205/219 =  94 %, 191 verschiedene — der tragende Abweichungsträger
 *              (82 % der gesetzesübergreifenden Paare zeigen hier ein Delta)
 *   adressat   105/219 =  48 % — trägt NUR DIE HÄLFTE. Der Adressat steht meist
 *              im Geltungsbereichs-Artikel, nicht in der Pflicht. Abhilfe:
 *              aus `partyRole` der typisierten Provision joinen (THE-540).
 *   modalitaet 219/219 = 100 %, aber nur 2 Werte belegt (pflicht 210,
 *              erlaubnis 9, verbot 0).
 *
 * `modalitaet` ist deshalb KEIN Filter — eine Achse, auf der 96 % der Fälle
 * denselben Wert tragen, trennt nichts (Prävalenz-Paradox in Slot-Form). Sie
 * ist ein WÄCHTER: sie fängt den Fall, dass ein Verbot als Gebot behandelt
 * wird. Das ist der Compliance-Fehler in die gefährliche Richtung — ein
 * übersehenes Gebot lässt eine Lücke, ein übersehenes Verbot erlaubt etwas
 * Untersagtes.
 *
 * Die 0 Verbote sind NICHT der Prompt: an echten Verbotsnormen (DSGVO Art. 9
 * Abs. 1, Art. 22 Abs. 1, KI-VO Art. 5) liefert die Zerlegung 3/3 `verbot`.
 * Sie sind der Korpus-Zuschnitt — die 16 zerlegten DSGVO-Artikel sind der
 * Sicherheits- und Melde-Kern, Art. 9 und Art. 22 waren nie im Scope.
 *
 * BEWUSSTE MODELLIERUNG, keine Fehlklassifikation: Bedingte Erlaubnisnormen
 * werden operativ gelesen. DSGVO Art. 6 („die Verarbeitung ist rechtmäßig,
 * wenn …") kommt als `pflicht` heraus, weil die umzusetzende Handlung
 * „Rechtsgrundlage bestimmen und dokumentieren" ist. Für ein
 * Umsetzungswerkzeug ist das richtig — es heißt aber, dass `erlaubnis`
 * systematisch untererfasst ist. Ausnahme- und Verhältnismäßigkeitsnormen
 * (Art. 9 Abs. 2, Art. 49, DORA Art. 4) werden korrekt als `erlaubnis`
 * erkannt (4/5 in der Kontrolle).
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
