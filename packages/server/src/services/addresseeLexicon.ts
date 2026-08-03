/**
 * addresseeLexicon — Freitext-Verpflichteter → Ontologie-Adressatenklasse
 * (THE-569, Slice B von REQ-REQTRACE-001.5).
 *
 * ── WARUM EIN LEXIKON, WARUM KONSERVATIV ──
 *
 * Die Kette liefert `verpflichteter` als Freitext („wesentliche Einrichtung");
 * das Verdrängungs-Gate und die Adressaten-Kompatibilität arbeiten auf den
 * Ontologie-Rollen. Im Eval kam die Klasse aus dem handkuratierten Fixture —
 * das gibt es im Produkt nicht.
 *
 * Gemappt wird NUR, was eindeutig einer Rolle entspricht. `null` heißt: die
 * Anforderung nimmt nicht an der Paar-Bildung teil und wird als
 * `unmappedAddressee` gezählt — ehrlich statt falsch gepaart. Eine falsche
 * Klasse wäre die gefährliche Richtung: sie öffnet das Verdrängungs-Gate für
 * Paare, die es ausschließen müsste (DORA×NIS2!).
 *
 * Bewusst NICHT gemappt: „Anbieter" (mehrdeutig: provider · ecs_provider ·
 * trust_service_provider), „das Unternehmen" (zu generisch). Erweiterung =
 * eine Datenzeile, kein Umbau (Muster IMPLEMENTATION_LEXICON). Der saubere
 * Weg — Korpus-`partyRole` je Provision (THE-540) — folgt mit dem
 * Korpus-Anschluss der Kette.
 */
import type { PartyRoleId } from '@thearchitect/shared';

const LEXICON: ReadonlyArray<[RegExp, PartyRoleId]> = [
  [/wesentliche[nr]?\s+(und\s+wichtige[nr]?\s+)?einrichtung(en)?|wichtige[nr]?\s+einrichtung(en)?/i, 'essential_important_entity'],
  [/finanzunternehmen/i, 'financial_entity'],
  [/auftragsverarbeiter/i, 'processor'],
  [/verantwortliche[nr]?\b/i, 'controller'],
  [/ikt-?drittdienstleister/i, 'ict_third_party_provider'],
];

export function mapVerpflichteterToPartyRole(text: string): PartyRoleId | null {
  const t = text.trim();
  if (!t) return null;
  for (const [pattern, role] of LEXICON) {
    if (pattern.test(t)) return role;
  }
  return null;
}
