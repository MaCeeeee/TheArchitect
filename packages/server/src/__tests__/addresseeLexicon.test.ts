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

// ─── THE-588: zwei Rollen im Text sind keine Rolle ───────────────────────
//
// Gemessen (docs/evals/scf-gold-produktpfad.md): „Unternehmen als
// Verantwortlicher ODER Auftragsverarbeiter" bekam `processor` — nicht weil
// das die bessere Lesart wäre, sondern weil die Regel im Array weiter oben
// steht. Die Reihenfolge entschied, nicht der Text.
//
// Das widerspricht der Doktrin des Moduls: „Anbieter" wird gerade WEGEN
// Mehrdeutigkeit verworfen. Eine Aufzählung zweier BENANNTER Rollen ist der
// klarere Fall davon.
//
// Erkannt wird NICHT das Wort „oder" — gezählt werden die getroffenen Rollen.
// Das fängt auch „/", „bzw.", „sowie" und die bloße Aufzählung.
describe('THE-588 — mehrdeutig heißt null, egal wie die Aufzählung geschrieben ist', () => {
  it.each([
    'Unternehmen als Verantwortlicher oder Auftragsverarbeiter',
    'Verantwortlicher bzw. Auftragsverarbeiter',
    'Verantwortlicher / Auftragsverarbeiter',
    'Verantwortlicher und Auftragsverarbeiter',
    'der Verantwortliche sowie sein Auftragsverarbeiter',
  ])('refuses to pick one of two named roles: %j', (text) => {
    expect(mapVerpflichteterToPartyRole(text)).toBeNull();
  });

  it('DIE GEFÄHRLICHE RICHTUNG: a DORA×NIS2 mix must never get a role', () => {
    // Bekäme dieser Text eine Rolle, liefe das Paar am Verdrängungs-Gate
    // vorbei, das DORA und NIS2 gerade trennen soll (lex specialis,
    // gemessen am 01.08.). Das ist der Fall, für den diese Änderung existiert.
    expect(mapVerpflichteterToPartyRole('Finanzunternehmen oder wesentliche Einrichtung')).toBeNull();
    expect(mapVerpflichteterToPartyRole('wesentliche Einrichtungen und Finanzunternehmen')).toBeNull();
  });

  it('EINE Rolle, mehrfach oder in Varianten genannt, bleibt diese Rolle', () => {
    // „wesentliche und wichtige Einrichtungen" trifft zwei Zweige derselben
    // Regel — das ist keine Mehrdeutigkeit, sondern der Gesetzeswortlaut.
    expect(mapVerpflichteterToPartyRole('wesentliche und wichtige Einrichtungen')).toBe('essential_important_entity');
    expect(mapVerpflichteterToPartyRole('betroffene Einrichtungen, also wesentliche Einrichtungen')).toBe(
      'essential_important_entity',
    );
    expect(mapVerpflichteterToPartyRole('der Verantwortliche (Verantwortlicher im Sinne der DSGVO)')).toBe('controller');
  });

  it('REGRESSION: der gemessene Gold-Fall bekommt keine willkürliche Rolle mehr', () => {
    // Vorher: processor — allein wegen der Zeilenreihenfolge im Lexikon.
    expect(mapVerpflichteterToPartyRole('Unternehmen als Verantwortlicher oder Auftragsverarbeiter')).not.toBe(
      'processor',
    );
  });
});
