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
 * Er überschreibt den LLM-Wert NICHT. Beide Wege werden nebeneinander geführt,
 * bis die Gegenprobe (`compareAddressees`) gemessen hat, ob sie übereinstimmen.
 * Erst danach darf einer abgeschaltet werden — sonst ersetzt man eine ungeprüfte
 * Quelle durch eine andere ungeprüfte.
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

export interface AddresseeComparison {
  total: number;
  /** Pflichten, für die die Zerlegung einen Adressaten lieferte. */
  llmFilled: number;
  /** Pflichten, für die der Korpus einen lieferte. */
  typedFilled: number;
  /** Pflichten, für die BEIDE lieferten — nur hier ist ein Vergleich möglich. */
  bothFilled: number;
  /** Pflichten, für die mindestens einer lieferte. */
  eitherFilled: number;
  /** Zuwachs des Joins gegenüber dem LLM-Weg allein. Die Zahl, an der das Ticket hängt. */
  gainOverLlm: number;
}

/**
 * Gegenprobe zwischen beiden Wegen.
 *
 * Bewusst KEIN Wert-Vergleich `fromLlm === fromTyping`: die Zerlegung liefert
 * Freitext („Verantwortlicher"), der Korpus eine Ontologie-Rolle
 * (`controller`). Sie sind nicht string-gleich und sollen es nicht sein. Was
 * hier gemessen wird, ist die ABDECKUNG — ob die inhaltliche Zuordnung stimmt,
 * ist eine Adjudikations-Frage und keine, die ein `===` beantwortet.
 */
export function compareAddressees(
  pairs: Array<{ fromLlm: string | null | undefined; fromTyping: string | null | undefined }>,
): AddresseeComparison {
  const llmFilled = pairs.filter((p) => isFilled(p.fromLlm)).length;
  const typedFilled = pairs.filter((p) => isFilled(p.fromTyping)).length;
  const bothFilled = pairs.filter((p) => isFilled(p.fromLlm) && isFilled(p.fromTyping)).length;
  const eitherFilled = pairs.filter((p) => isFilled(p.fromLlm) || isFilled(p.fromTyping)).length;

  return {
    total: pairs.length,
    llmFilled,
    typedFilled,
    bothFilled,
    eitherFilled,
    gainOverLlm: eitherFilled - llmFilled,
  };
}
