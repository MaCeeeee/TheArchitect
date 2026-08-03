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
  // NIS2-Rueckverweis-Form: "die betroffenen Einrichtungen" referenziert die
  // zuvor genannten wesentlichen/wichtigen Einrichtungen (Art. 23-Wortlaut).
  // "Einrichtung" ist NIS2-Vokabular — DSGVO sagt Verantwortlicher, DORA
  // Finanzunternehmen; die Zuordnung ist daher nicht mehrdeutig.
  [/betroffene[n]?\s+einrichtung(en)?/i, 'essential_important_entity'],
  [/finanzunternehmen/i, 'financial_entity'],
  [/auftragsverarbeiter/i, 'processor'],
  [/verantwortliche[nr]?\b/i, 'controller'],
  [/ikt-?drittdienstleister/i, 'ict_third_party_provider'],
];

/**
 * Freitext-Verpflichteter → Rolle, oder `null`.
 *
 * ── WARUM ALLE REGELN GEPRÜFT WERDEN, NICHT NUR BIS ZUM ERSTEN TREFFER ──
 *
 * Nennt ein Text ZWEI verschiedene Rollen, ist er mehrdeutig — genau wie
 * „Anbieter", das aus demselben Grund verworfen wird. Der frühere Ausstieg
 * beim ersten Treffer machte daraus eine Entscheidung, die nicht der Text
 * traf, sondern die ZEILENREIHENFOLGE dieser Liste: „Unternehmen als
 * Verantwortlicher oder Auftragsverarbeiter" wurde `processor`, weil die
 * Auftragsverarbeiter-Regel eine Zeile höher steht (gemessen THE-588,
 * docs/evals/scf-gold-produktpfad.md).
 *
 * Gezählt werden deshalb die getroffenen ROLLEN, nicht die Regeln:
 *
 *   0 Rollen  → null (unbekannt)
 *   1 Rolle   → diese Rolle — auch wenn mehrere Regeln sie trafen
 *               („wesentliche und wichtige Einrichtungen" ist eine Rolle)
 *   ≥2 Rollen → null (mehrdeutig)
 *
 * Bewusst wird NICHT nach „oder" gesucht. Die Zählung fängt auch „/", „bzw.",
 * „sowie" und die bloße Aufzählung — jede Schreibweise, die eine
 * Konnektor-Liste übersehen würde.
 *
 * Die gefährliche Richtung bleibt damit geschlossen: Ein Text, der DORA- und
 * NIS2-Vokabular mischt, bekommt keine Rolle und läuft nicht am
 * Verdrängungs-Gate vorbei.
 */
export function mapVerpflichteterToPartyRole(text: string): PartyRoleId | null {
  const t = text.trim();
  if (!t) return null;
  const roles = new Set<PartyRoleId>();
  for (const [pattern, role] of LEXICON) {
    if (pattern.test(t)) roles.add(role);
  }
  return roles.size === 1 ? [...roles][0] : null;
}
