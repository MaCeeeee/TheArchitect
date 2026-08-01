/**
 * Tests für den Join der getypten Provision (THE-540 Achse 1).
 *
 * Der Korpus-Zugriff ist INJIZIERT — kein Netz, keine Server-B-Verbindung im Test.
 *
 * Die Hausregel stammt aus `scopeGuarantee.service.ts` und ist NICHT
 * „nur confirmed": am Korpus stehen 1640 `suggested` und 0 `confirmed`. Konsumiert
 * wird alles, was nicht `rejected` ist UND dessen Label zum aktuellen Textstand
 * gehört (`versionHash`-Gleichheit).
 */
import {
  isConsumableTyping,
  resolveTypedAddressees,
  partyCoverage,
  type TypedProvisionDoc,
} from '../services/typedProvision.service';

const doc = (over: Partial<TypedProvisionDoc> = {}): TypedProvisionDoc => ({
  regulationKey: 'dsgvo:art-33',
  versionHash: 'h1',
  typing: {
    partyRole: 'controller',
    obligationKind: 'obligation',
    status: 'suggested',
    versionHash: 'h1',
    ontologyVersion: '1.7.0',
  },
  ...over,
});

describe('isConsumableTyping — die Hausregel (THE-540)', () => {
  it('accepts a suggested label on the current text version', () => {
    // 0 confirmed bei 1640 suggested — "nur confirmed" waere ein leeres Tor.
    expect(isConsumableTyping(doc())).toBe(true);
  });

  it('accepts a confirmed label', () => {
    expect(isConsumableTyping(doc({ typing: { ...doc().typing!, status: 'confirmed' } }))).toBe(true);
  });

  it('REJECTS a rejected label', () => {
    expect(isConsumableTyping(doc({ typing: { ...doc().typing!, status: 'rejected' } }))).toBe(false);
  });

  it('REJECTS a label that describes an older text version', () => {
    // Novelle: der Text wurde aktualisiert, das Label beschreibt den alten Stand.
    expect(isConsumableTyping(doc({ versionHash: 'h2' }))).toBe(false);
  });

  it('rejects a document without typing at all', () => {
    expect(isConsumableTyping(doc({ typing: undefined }))).toBe(false);
  });
});

describe('resolveTypedAddressees (THE-540)', () => {
  it('maps regulation keys to the typed party role', async () => {
    const m = await resolveTypedAddressees(['dsgvo:art-33'], async () => [doc()]);
    expect(m.get('dsgvo:art-33')).toBe('controller');
  });

  it('omits provisions whose typing is not consumable — no silent guess', async () => {
    const m = await resolveTypedAddressees(['dsgvo:art-33'], async () => [doc({ versionHash: 'h2' })]);
    expect(m.has('dsgvo:art-33')).toBe(false);
  });

  it('omits provisions typed on other axes but without a party role', async () => {
    const stripped = doc();
    stripped.typing = { ...stripped.typing!, partyRole: null };
    const m = await resolveTypedAddressees(['dsgvo:art-33'], async () => [stripped]);
    expect(m.has('dsgvo:art-33')).toBe(false);
  });

  it('returns an empty map when the corpus is unreachable instead of throwing', async () => {
    // Der Korpus liegt auf Server B. Faellt er aus, muss die Zerlegung
    // weiterlaufen und auf den LLM-Wert zurueckfallen — ein Ausfall darf keine
    // Pflicht verlieren.
    const m = await resolveTypedAddressees(['dsgvo:art-33'], async () => {
      throw new Error('corpus down');
    });
    expect(m.size).toBe(0);
  });

  it('does not call the corpus at all for an empty key list', async () => {
    let called = false;
    await resolveTypedAddressees([], async () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
  });

  it('deduplicates keys before querying', async () => {
    let asked: string[] = [];
    await resolveTypedAddressees(['a', 'a', 'b'], async (keys) => {
      asked = keys;
      return [];
    });
    expect(asked.sort()).toEqual(['a', 'b']);
  });
});

describe('partyCoverage — Abdeckung je Partei (THE-540)', () => {
  it('counts both party slots separately', () => {
    const r = partyCoverage([
      { adressat: 'controller', empfaenger: 'Aufsichtsbehörde' },
      { adressat: 'controller', empfaenger: '—' },
      { adressat: null, empfaenger: 'betroffene Person' },
      { adressat: null, empfaenger: '—' },
    ]);
    expect(r).toEqual({ total: 4, adressatFilled: 2, empfaengerFilled: 2, bothFilled: 1 });
  });

  it('does NOT compare the two slots against each other', () => {
    // Seit dem Split tragen sie bewusst Verschiedenes: "controller" (wer ist
    // verpflichtet) und "Aufsichtsbehoerde" (an wen). Eine Abweichung ist die
    // richtige Antwort auf zwei Fragen, kein Fehler — deshalb gibt es hier
    // keinen Uebereinstimmungs-Wert mehr.
    const r = partyCoverage([{ adressat: 'controller', empfaenger: 'Aufsichtsbehörde' }]);
    expect(Object.keys(r)).toEqual(['total', 'adressatFilled', 'empfaengerFilled', 'bothFilled']);
  });

  it('treats the unstated marker as empty, not as a value', () => {
    expect(partyCoverage([{ adressat: null, empfaenger: '—' }]).empfaengerFilled).toBe(0);
  });

  it('handles an empty sample without dividing by zero', () => {
    expect(partyCoverage([])).toEqual({ total: 0, adressatFilled: 0, empfaengerFilled: 0, bothFilled: 0 });
  });
});
