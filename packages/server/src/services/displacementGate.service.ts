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
import { findDisplacement } from '@thearchitect/shared';

/** Eine Seite des Paars: Rechtsakt + Adressatenklasse der Pflicht. */
export interface DisplacementParty {
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
 */
export function evaluateDisplacement(
  a: DisplacementParty,
  b: DisplacementParty,
): DisplacementVerdict | null {
  if (a.source === b.source) return null;
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const hit = findDisplacement(x.source, y.addresseeClass);
    if (hit && hit.prevailing.source === y.source) {
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
