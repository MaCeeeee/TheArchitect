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
  compareAddressees,
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

describe('compareAddressees — die Gegenprobe (THE-540)', () => {
  it('counts coverage of both paths and their overlap', () => {
    const r = compareAddressees([
      { fromLlm: 'Verantwortlicher', fromTyping: 'controller' },
      { fromLlm: '—', fromTyping: 'controller' },
      { fromLlm: 'Einrichtung', fromTyping: null },
      { fromLlm: '—', fromTyping: null },
    ]);
    expect(r).toMatchObject({ total: 4, llmFilled: 2, typedFilled: 2, bothFilled: 1, eitherFilled: 3 });
  });

  it('reports the gain of the join over the LLM path alone', () => {
    // Die Zahl, an der das Ticket haengt: hebt der Join die Abdeckung wirklich?
    const r = compareAddressees([
      { fromLlm: '—', fromTyping: 'controller' },
      { fromLlm: '—', fromTyping: 'processor' },
      { fromLlm: 'Verantwortlicher', fromTyping: null },
    ]);
    expect(r.llmFilled).toBe(1);
    expect(r.eitherFilled).toBe(3);
    expect(r.gainOverLlm).toBe(2);
  });

  it('treats the unstated marker as empty, not as a value', () => {
    const r = compareAddressees([{ fromLlm: '—', fromTyping: null }]);
    expect(r.llmFilled).toBe(0);
  });

  it('handles an empty sample without dividing by zero', () => {
    expect(compareAddressees([])).toMatchObject({ total: 0, llmFilled: 0, gainOverLlm: 0 });
  });
});
