/**
 * Tests für das Adressaten-Lexikon (THE-569, Slice B von REQ-001.5).
 *
 * DIE REGEL: mechanisch und konservativ — gemappt wird nur, was eindeutig
 * einer Ontologie-Rolle entspricht; alles andere ist `null` und nimmt NICHT
 * an der Paar-Bildung teil (unmappedAddressee-Quote). Null statt raten:
 * eine falsche Adressatenklasse öffnet das Verdrängungs-Gate für Paare,
 * die es ausschließen müsste.
 */
import { mapVerpflichteterToPartyRole } from '../services/addresseeLexicon';
import { isPartyRole } from '@thearchitect/shared';

describe('mapVerpflichteterToPartyRole', () => {
  it.each([
    ['wesentliche Einrichtung', 'essential_important_entity'],
    ['wichtige Einrichtungen', 'essential_important_entity'],
    ['wesentliche und wichtige Einrichtungen', 'essential_important_entity'],
    ['betroffene Einrichtungen', 'essential_important_entity'],
    ['die betroffenen Einrichtungen', 'essential_important_entity'],
    ['Finanzunternehmen', 'financial_entity'],
    ['das Finanzunternehmen', 'financial_entity'],
    ['Verantwortlicher', 'controller'],
    ['der Verantwortliche', 'controller'],
    ['Auftragsverarbeiter', 'processor'],
    ['IKT-Drittdienstleister', 'ict_third_party_provider'],
  ])('maps %j → %s', (text, expected) => {
    expect(mapVerpflichteterToPartyRole(text)).toBe(expected);
  });

  it('every mapped value is a valid ontology party role', () => {
    for (const text of ['wesentliche Einrichtung', 'Finanzunternehmen', 'Verantwortlicher', 'Auftragsverarbeiter']) {
      const role = mapVerpflichteterToPartyRole(text);
      expect(role).not.toBeNull();
      expect(isPartyRole(role!)).toBe(true);
    }
  });

  it('returns null for unknown or ambiguous obligated parties — no guessing', () => {
    expect(mapVerpflichteterToPartyRole('Zahlungsdienstleister nach PSD2')).toBeNull();
    expect(mapVerpflichteterToPartyRole('Anbieter')).toBeNull(); // mehrdeutig (provider vs ecs_provider vs trust_service_provider)
    expect(mapVerpflichteterToPartyRole('')).toBeNull();
    expect(mapVerpflichteterToPartyRole('das Unternehmen')).toBeNull(); // zu generisch
  });

  it('is case-tolerant', () => {
    expect(mapVerpflichteterToPartyRole('WESENTLICHE EINRICHTUNG')).toBe('essential_important_entity');
  });
});
