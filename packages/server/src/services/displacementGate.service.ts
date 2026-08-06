/**
 * displacementGate.service — Verdrängung (lex specialis) als mechanisches
 * Paar-Gate (THE-563, Slice 1 von UC-REQTRACE-001).
 *
 * ── DIE REGEL ──
 *
 * Verdrängung ist eine ONTOLOGIE-KANTE mit Adressatenklasse und Beleg-Zitat
 * (`NORM_ONTOLOGY.displacements`, Daten — kein if im Code). Sie greift
 * MECHANISCH, bevor irgendein Modell befragt wird: ein verdrängtes Paar
 * erreicht den Richter nie (Lauf-4-Negativ-Kontrolle).
 *
 * ── DIE PAAR-SEMANTIK, GEMESSEN ──
 *
 * Geprüft wird mit der Adressatenklasse der VORRANGIGEN Seite, nicht der
 * verdrängten. Die Frage lautet „gibt es einen Adressaten, für den beide
 * gelten?" — und ein Finanzunternehmen ist zugleich wesentliche Einrichtung.
 * Fragte man mit `essential_important_entity`, fände man die Kante nicht,
 * obwohl sie existiert. Diese Semantik stammt wörtlich aus der Eval-Logik,
 * die Lauf 4 getragen hat (1077 ausgeschlossene Paare); der Eval konsumiert
 * seit THE-563 DIESEN Service — ein Codepfad, Eval = Produktion (Muster
 * obligationAction.service).
 *
 * Einzelnorm-Schwester: `legal-profile.ts` in shared beantwortet „gilt Norm X
 * für Rolle Y?" (THE-548). Dieses Gate beantwortet die PAAR-Frage der
 * Harmonisierung: „dürfen diese zwei Pflichten überhaupt zusammen beurteilt
 * werden?"
 *
 * Linear: THE-563 · Grundlage: THE-544-Befund (10/16 Kandidaten rechtlich
 * gegenstandslos ohne dieses Gate) · Kante: `dora-prevails-nis2` (Art. 1
 * Abs. 2 DORA; Art. 4 NIS2 + ErwG 28).
 */
import { findDisplacement, normalizeCorpusSource } from '@thearchitect/shared';

/** Eine Seite des Paars: Rechtsakt + Adressatenklasse der Pflicht. */
export interface DisplacementParty {
  /**
   * Rechtsakt — als Familie (`nis2`) ODER als Sprachfassung (`nis2-de`).
   * Gerechnet wird auf der Familie, ausgewiesen wird, was hereinkam.
   */
  source: string;
  addresseeClass: string;
}

export interface DisplacementVerdict {
  /** Rechtsakt, dessen Pflicht aus dem Paar fällt. */
  displaced: string;
  /** Rechtsakt, der vorgeht (lex specialis). */
  prevailing: string;
  /** Adressatenklasse, über die die Kante greift. */
  addresseeClass: string;
  scope: string;
  citations: readonly string[];
}

/**
 * Schließen sich die beiden Pflichten für einen gemeinsamen Adressaten aus?
 * `null` = keine Kante greift, das Paar bleibt beurteilbar. REIN, symmetrisch:
 * das Ergebnis hängt an der Kante, nicht an der Argument-Reihenfolge.
 *
 * ── DIE KANTE GILT FÜR DAS GESETZ, NICHT FÜR DIE SCHREIBWEISE (THE-600) ──
 *
 * Verglichen wird auf der Werk-FAMILIE. Der Korpus-Pfad (seit THE-570 der
 * Hauptpfad) liefert Sprachfassungen als Schlüssel-Stamm — `nis2-de`,
 * `dora-de` —, die Ontologie-Kanten stehen auf `nis2`/`dora`. Ein exakter
 * Vergleich war deshalb für drei von vier Stamm-Kombinationen stumm, und ein
 * rechtlich gegenstandsloses DORA×NIS2-Paar erreichte den Richter. Gemessen,
 * nicht vermutet.
 *
 * Das VERDIKT trägt weiterhin die Sprachfassung, wie sie hereinkam: die
 * Familie ist die Rechenachse, die Fassung die Auskunft. Wer im Audit liest
 * „nis2 fällt", muss wissen, welches Werk tatsächlich im Paar stand.
 */
export function evaluateDisplacement(
  a: DisplacementParty,
  b: DisplacementParty,
): DisplacementVerdict | null {
  const famA = normalizeCorpusSource(a.source);
  const famB = normalizeCorpusSource(b.source);
  // Zwei Fassungen desselben Gesetzes sind ein Gesetz — es verdrängt sich nicht.
  if (famA === famB) return null;
  for (const [x, xFam, y, yFam] of [
    [a, famA, b, famB],
    [b, famB, a, famA],
  ] as const) {
    const hit = findDisplacement(xFam, y.addresseeClass);
    if (hit && hit.prevailing.source === yFam) {
      return {
        displaced: x.source,
        prevailing: y.source,
        addresseeClass: y.addresseeClass,
        scope: hit.scope,
        citations: hit.citations,
      };
    }
  }
  return null;
}
