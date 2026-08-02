/**
 * legal-profile — das Anwendbarkeitsprofil des Unternehmens (THE-548).
 *
 * ── WARUM ES DAS GIBT ──
 *
 * `findDisplacement(displacedSource, addresseeClass)` ist korrekt gebaut, am
 * Primärtext belegt — und hatte bis zu diesem Modul NULL Produktaufrufer: das
 * zweite Argument, die Adressatenklasse des KUNDEN, war nirgends gespeichert.
 * Das Modell kannte das Recht ausgezeichnet und den Kunden gar nicht. Der
 * teuerste Befund des Projekts (10 von 16 Katalog-Kandidaten durch lex
 * specialis gegenstandslos, THE-538) war dadurch nicht produktwirksam.
 *
 * ── DIE VIER ZUSTÄNDE — UND WARUM ES VIER SIND ──
 *
 *   applicable      das Gesetz bindet eine Rolle des Profils
 *   displaced       es WÜRDE binden, aber ein spezielleres schiebt es
 *                   beiseite — mit Beleg (DORA Art. 1 Abs. 2 …)
 *   not_applicable  es bindet keine Rolle des Profils
 *   undetermined    das Profil (oder die nötige Facette) fehlt
 *
 * `displaced` und `not_applicable` zu einem „gilt nicht" einzuebnen hieße,
 * einem Prüfer die Begründung schuldig zu bleiben. Und `undetermined` ist
 * keins von beiden: Nichtwissen als „gilt nicht" auszugeben wäre die
 * gefährliche Fehlerrichtung — der Nutzer hielte eine Pflicht für erledigt,
 * die nie geprüft wurde.
 *
 * ── VERDRÄNGUNG VOR MITGLIEDSCHAFT ──
 *
 * Die Verdrängung wird geprüft, BEVOR die Rollen abgeglichen werden. Für eine
 * Bank (`financial_entity`) ist die wahre Antwort auf „gilt NIS2 Art. 23?"
 * IMMER „verdrängt durch DORA" — auch wenn `essential_important_entity` nicht
 * im Profil steht. Die Alternative („du bist keine wesentliche Einrichtung")
 * wäre sachlich falsch — Kreditinstitute stehen in NIS2 Anhang I — und würde
 * genau die Sektor-Rechtsanalyse verlangen, die die lex specialis erspart.
 *
 * Alle Werteräume kommen aus `NORM_ONTOLOGY`. Ein zweiter Rollenraum wäre
 * eine Dublette mit Drift-Garantie.
 *
 * Linear: THE-548 · Rahmen: ADR-0007 · Konsument des Gates: THE-544
 */
import { NORM_ONTOLOGY } from './norm-ontology.v1';
import { findDisplacement } from './index';

/**
 * Selbstauskunft des Unternehmens. ALLE Felder optional — ein Projekt ohne
 * Profil verhält sich exakt wie vor THE-548 (additiv, Rollback = ignorieren).
 *
 * `addresseeClasses` ist bewusst eine LISTE: dieselbe Firma ist Verantwortlicher
 * für Kundendaten UND Auftragsverarbeiter für Mandantendaten — mit verschiedenen
 * Pflichtenbündeln. Ein Einzelwert wäre das falsche Modell.
 */
export interface LegalProfile {
  /** Aus NORM_ONTOLOGY.jurisdictions (EU, DE, AT, CH). */
  jurisdictions?: string[];
  /**
   * Freitext-Sektoren (z. B. NIS2 Anhang I/II). KEIN erzwungener Werteraum:
   * die Zuordnung eines Kunden zu einem Anhang-Sektor ist eine RECHTSFRAGE,
   * kein Datenfeld — sie gehört als Vorschlag mit Beleg vor den Menschen,
   * nicht als Dropdown-Zwang (RVTM Watch-Point, Asilomar #16).
   */
  sectors?: string[];
  /** Aus NORM_ONTOLOGY.partyRoles — mehrere zulässig und der Normalfall. */
  addresseeClasses?: string[];
  size?: { employees?: number; revenueEur?: number };
  /** personenbezogen, besondere Kategorien, … */
  dataKinds?: string[];
}

/** Die Norm-Seite: wen bindet dieser Rechtsakt? Quelle: typisierte Provision oder Fixture mit Zitat. */
export interface NormDescriptor {
  /** Norm-Quelle wie in der Ontologie (`dsgvo`, `nis2`, `dora`, …). */
  source: string;
  /** Adressatenklassen, die der Rechtsakt bindet. */
  addresseeClasses: string[];
}

export type LegalApplicabilityState = 'applicable' | 'displaced' | 'not_applicable' | 'undetermined';

export interface LegalApplicabilityAssessment {
  state: LegalApplicabilityState;
  /** Bei `displaced`: welcher Rechtsakt schiebt beiseite. */
  prevailingSource?: string;
  /** Bei `displaced`: die Belege der Kante — sie wandern bis zur Nutzeraussage. */
  citations?: readonly string[];
  /** Bei `not_applicable`: welche Rollen der Norm im Profil fehlen. */
  missingRoles?: string[];
  /** Menschlich lesbare Begründung — Englisch, wie alle UI-Strings. */
  reason: string;
}

const PARTY_ROLE_SET: ReadonlySet<string> = new Set<string>(NORM_ONTOLOGY.partyRoles.map((r) => r.id));
const JURISDICTION_SET: ReadonlySet<string> = new Set<string>(NORM_ONTOLOGY.jurisdictions.map((j) => j.id));

/**
 * Prüft die Werteräume gegen die Ontologie. Leeres Array = gültig.
 *
 * `sectors` und `dataKinds` werden NICHT geprüft — Freitext, siehe Kommentar
 * am Feld. Was hier durchginge, obwohl es die Ontologie nicht kennt, würde
 * still einen zweiten Werteraum eröffnen.
 */
export function validateLegalProfile(profile: LegalProfile): string[] {
  const errors: string[] = [];
  for (const r of profile.addresseeClasses ?? []) {
    if (!PARTY_ROLE_SET.has(r)) {
      errors.push(`Unknown party role "${r}" — not in NORM_ONTOLOGY.partyRoles`);
    }
  }
  for (const j of profile.jurisdictions ?? []) {
    if (!JURISDICTION_SET.has(j)) {
      errors.push(`Unknown jurisdiction "${j}" — not in NORM_ONTOLOGY.jurisdictions`);
    }
  }
  return errors;
}

/**
 * DER Produktaufrufer von `findDisplacement` — die Funktion, die den Befund
 * von THE-538 produktwirksam macht.
 *
 * Reihenfolge (begründet im Modulkopf):
 *   1. kein Profil / keine Rollen-Facette  → undetermined
 *   2. Verdrängungs-Kante für eine Profilrolle → displaced (mit Beleg)
 *   3. keine Rolle der Norm im Profil      → not_applicable (mit Fehlliste)
 *   4. sonst                               → applicable
 */
export function assessNormApplicability(
  profile: LegalProfile | null | undefined,
  norm: NormDescriptor,
): LegalApplicabilityAssessment {
  const roles = profile?.addresseeClasses;
  if (!roles || roles.length === 0) {
    return {
      state: 'undetermined',
      reason:
        'No legal profile (or no addressee classes) recorded for this project — applicability cannot be assessed. Unknown is not "does not apply".',
    };
  }

  // 2. Verdrängung — VOR der Mitgliedschaftsfrage (lex specialis macht sie gegenstandslos).
  for (const role of roles) {
    const edge = findDisplacement(norm.source, role);
    if (edge) {
      return {
        state: 'displaced',
        prevailingSource: edge.prevailing.source,
        citations: edge.citations,
        reason: `Displaced by ${edge.prevailing.source} for addressee class "${role}" (${edge.scope}).`,
      };
    }
  }

  // 3. Ist die NORM-Seite überhaupt bekannt? Eine leere Rollenliste heißt
  //    „keine konsumierbare Typisierung", nicht „bindet niemanden" — die
  //    Abwesenheit von Wissen als not_applicable auszugeben wäre dieselbe
  //    Verwechslung wie beim fehlenden Profil, nur auf der anderen Seite.
  //    (THE-555; die Verdrängung steht bewusst DAVOR: sie hängt an der
  //    Norm-QUELLE und ist ohne Norm-Rollen entscheidbar.)
  if (norm.addresseeClasses.length === 0) {
    return {
      state: 'undetermined',
      reason:
        'No consumable typing for this norm — its addressee classes are unknown. Unknown is not "binds nobody".',
    };
  }

  // 4. Bindet die Norm eine Rolle des Profils?
  const matches = norm.addresseeClasses.filter((r) => roles.includes(r));
  if (matches.length === 0) {
    return {
      state: 'not_applicable',
      missingRoles: [...norm.addresseeClasses],
      reason: `None of the norm's addressee classes (${norm.addresseeClasses.join(', ')}) appear in the project's legal profile.`,
    };
  }

  return {
    state: 'applicable',
    reason: `Binds the project in role(s): ${matches.join(', ')}.`,
  };
}
