/**
 * typedProvision.service — liest den Adressaten einer Pflicht aus der
 * TYPISIERTEN PROVISION statt ihn aus dem Pflichttext raten zu lassen
 * (THE-540 Achse 1).
 *
 * ── WARUM ──
 *
 * Die Slot-Zerlegung füllt den Adressaten nur bei 48 % der Pflichten. Die
 * Ursache ist strukturell: der Adressat steht meist im Geltungsbereichs-Artikel,
 * nicht in der einzelnen Pflicht. Ihn dort zu raten, wo er nicht steht, kann
 * nicht besser werden. Der Korpus trägt ihn dagegen zu 77 % (1263/1640,
 * gemessen 2026-08-01) — mechanisch Entscheidbares gehört nicht ans LLM.
 *
 * ── DIE HAUSREGEL ──
 *
 * Konsumiert wird, was NICHT `rejected` ist UND dessen Label zum AKTUELLEN
 * Textstand gehört (`typing.versionHash === doc.versionHash`). Das ist exakt
 * die Regel aus `scopeGuarantee.service.ts` — und sie verlangt bewusst KEIN
 * `confirmed`: am Korpus stehen 1640 `suggested` und 0 `confirmed`, ein
 * confirmed-Tor wäre ein leeres Tor.
 *
 * Die Stale-Prüfung ist kein Detail: Bei einer Novelle aktualisiert die
 * Crawl-Route den Text in place. Ein Label auf altem `versionHash` beschreibt
 * dann eine Fassung, die es nicht mehr gibt.
 *
 * ── WAS DIESER DIENST NICHT TUT ──
 *
 * Er überschreibt den LLM-Wert NICHT — und das hat sich ausgezahlt. Die
 * Gegenprobe ergab, dass beide Wege gar nicht dasselbe messen: die Zerlegung
 * lieferte überwiegend den EMPFÄNGER („Aufsichtsbehörde" bei DSGVO Art. 33),
 * die Typisierung den VERPFLICHTETEN (`controller`). Übereinstimmung: rund
 * 4 von 20 Provisions.
 *
 * Konsequenz war der Slot-Split, nicht die Abschaltung eines Weges: der
 * Verpflichtete kommt aus der Typisierung, die Gegenpartei bleibt als
 * `empfaenger` in der Zerlegung. Hätte der Join den Wert einfach
 * überschrieben, wäre der wertvollere der beiden verloren gegangen — bei
 * Meldeketten ist der Empfänger die Abweichung, die zählt.
 *
 * `obligationKind` bleibt bewusst ungenutzt: die Achse liegt mit zuletzt
 * macro-F1 0,579 unter ihrer Freigabe-Schwelle von 0,75 (THE-540 Achse 2,
 * gesperrt). Die Daten sind da, sie sind nur nicht gut genug.
 *
 * Linear: THE-540 · Vorgeschichte: THE-543, THE-438
 */
import { SLOT_UNSTATED } from '@thearchitect/shared';

/** Ausschnitt eines Korpus-Dokuments, den dieser Dienst braucht. */
export interface TypedProvisionDoc {
  regulationKey: string;
  versionHash: string;
  typing?: {
    partyRole?: string | null;
    obligationKind?: string | null;
    status: 'suggested' | 'confirmed' | 'rejected';
    versionHash: string;
    ontologyVersion: string;
  };
}

/** Korpus-Zugriff, injiziert — im Test ein Stub, in Produktion `getRegulationsByKeys`. */
export type FetchProvisions = (keys: string[]) => Promise<TypedProvisionDoc[]>;

/**
 * Hausregel für konsumierbare Typisierung. Identisch zu
 * `scopeGuarantee.service.ts`: `rejected` raus, Textstand muss stimmen.
 */
export function isConsumableTyping(d: TypedProvisionDoc): boolean {
  if (!d.typing) return false;
  if (d.typing.status === 'rejected') return false;
  if (d.typing.versionHash !== d.versionHash) return false;
  return true;
}

/**
 * Löst Regulation-Keys zu getypten Adressaten auf.
 *
 * Ein nicht auflösbarer Key fehlt in der Map — er wird NICHT auf einen
 * Ersatzwert gesetzt. Die Lücke bleibt damit sichtbar statt sich als Wert zu
 * tarnen.
 *
 * Fällt der Korpus aus (Server B nicht erreichbar), gibt es eine leere Map und
 * keinen Wurf: die Zerlegung muss weiterlaufen und auf den LLM-Wert
 * zurückfallen. Ein Infrastruktur-Ausfall darf keine Pflicht verlieren.
 */
export async function resolveTypedAddressees(
  regulationKeys: string[],
  fetch: FetchProvisions,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const keys = [...new Set(regulationKeys.filter(Boolean))];
  if (keys.length === 0) return out;

  let docs: TypedProvisionDoc[];
  try {
    docs = await fetch(keys);
  } catch {
    return out;
  }

  for (const d of docs) {
    if (!isConsumableTyping(d)) continue;
    const role = d.typing?.partyRole;
    if (!role) continue;
    out.set(d.regulationKey, role);
  }
  return out;
}

const isFilled = (v: string | null | undefined): boolean =>
  Boolean(v) && String(v).trim() !== '' && String(v).trim() !== SLOT_UNSTATED;

export interface PartyCoverage {
  total: number;
  /** Verpflichteter — aus der typisierten Provision. */
  adressatFilled: number;
  /** Gegenpartei — aus der Zerlegung. */
  empfaengerFilled: number;
  /** Pflichten, bei denen beide Parteien bekannt sind. */
  bothFilled: number;
}

/**
 * Abdeckung der beiden Parteien-Slots.
 *
 * Ersetzt die frühere `compareAddressees`, die beide Wege GEGENEINANDER gemessen
 * hat. Diese Gegenprobe hat ihre Frage beantwortet — und zwar mit einem
 * Befund, der die Frage selbst hinfällig macht: Die Zerlegung lieferte
 * überwiegend den EMPFÄNGER, die Typisierung den VERPFLICHTETEN (rund 4 von 20
 * Provisions stimmten überein, THE-540). Seit dem Slot-Split tragen beide
 * bewusst verschiedene Inhalte.
 *
 * Sie weiter zu vergleichen wäre ein Kategorienfehler: eine Abweichung zwischen
 * „controller" und „Aufsichtsbehörde" ist kein Fehler, sondern die richtige
 * Antwort auf zwei verschiedene Fragen. Gemessen wird deshalb nur noch die
 * Abdeckung je Slot.
 */
export function partyCoverage(
  rows: Array<{ adressat: string | null | undefined; empfaenger: string | null | undefined }>,
): PartyCoverage {
  return {
    total: rows.length,
    adressatFilled: rows.filter((r) => isFilled(r.adressat)).length,
    empfaengerFilled: rows.filter((r) => isFilled(r.empfaenger)).length,
    bothFilled: rows.filter((r) => isFilled(r.adressat) && isFilled(r.empfaenger)).length,
  };
}
