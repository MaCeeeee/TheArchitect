/**
 * Tests für die Paar-Bildung auf vier Achsen (THE-382, Prüfsatz-Reparatur).
 *
 * Jeder Test unten steht für einen konkreten Defekt aus `actions.v1`, den ein
 * Mensch beim Adjudizieren gefunden hat — nicht für eine ausgedachte Anforderung.
 */
import { buildStrictPairs, axisKey, toGoldenSet, type SlottedObligation } from '../evals/pairSelection';

const o = (
  law: string,
  para: string,
  title: string,
  actionId: string | null,
  partyRole: string | null,
  recipientClass: string | null,
  modality: string | null = 'pflicht',
): SlottedObligation => ({
  law,
  para,
  title,
  text: `${title} — Volltext.`,
  actionId,
  partyRole,
  recipientClass,
  modality,
});

describe('axisKey (THE-382)', () => {
  it('needs all four axes — a missing one makes the duty unpairable', () => {
    expect(axisKey(o('DSGVO', 'Art. 33', 't', 'melden', 'controller', 'aufsichtsbehoerde'))).toContain('melden');
    expect(axisKey(o('DSGVO', 'Art. 33', 't', 'melden', null, 'aufsichtsbehoerde'))).toBeNull();
    expect(axisKey(o('DSGVO', 'Art. 33', 't', 'melden', 'controller', null))).toBeNull();
    expect(axisKey(o('DSGVO', 'Art. 33', 't', null, 'controller', 'aufsichtsbehoerde'))).toBeNull();
    expect(axisKey(o('DSGVO', 'Art. 33', 't', 'melden', 'controller', 'aufsichtsbehoerde', null))).toBeNull();
  });
});

describe('buildStrictPairs (THE-382)', () => {
  it('pairs only across different legal acts', () => {
    const r = buildStrictPairs([
      o('DSGVO', 'Art. 33', 'A', 'melden', 'controller', 'behoerde'),
      o('DSGVO', 'Art. 34', 'B', 'melden', 'controller', 'behoerde'),
    ]);
    expect(r.T).toHaveLength(0);
  });

  it('refuses a pair whose DUTY-HOLDER differs — the defect the human found', () => {
    // DORA Art. 19 Behoerdenweiterleitung ist eine Pflicht der AUFSICHT. Sie
    // stand in actions.v1 gegen eine DSGVO-Unternehmenspflicht.
    const r = buildStrictPairs([
      o('DSGVO', 'Art. 33', 'Unternehmen meldet', 'melden', 'controller', 'behoerde'),
      o('DORA', 'Art. 19', 'Behörde leitet weiter', 'melden', 'supervisor', 'behoerde'),
    ]);
    expect(r.T).toHaveLength(0);
  });

  it('refuses a pair whose RECIPIENT class differs', () => {
    const r = buildStrictPairs([
      o('DSGVO', 'Art. 33', 'an die Aufsicht', 'melden', 'controller', 'aufsichtsbehoerde'),
      o('NIS2', 'Art. 23', 'an die Betroffenen', 'melden', 'controller', 'betroffene-person'),
    ]);
    expect(r.T).toHaveLength(0);
  });

  it('refuses a pair whose MODALITY differs — a duty is not a permission', () => {
    const r = buildStrictPairs([
      o('DSGVO', 'Art. 33', 'muss melden', 'melden', 'controller', 'behoerde', 'pflicht'),
      o('DORA', 'Art. 19', 'darf melden', 'melden', 'controller', 'behoerde', 'erlaubnis'),
    ]);
    expect(r.T).toHaveLength(0);
  });

  it('pairs when all four axes line up', () => {
    const r = buildStrictPairs([
      o('DSGVO', 'Art. 33', 'A', 'melden', 'controller', 'behoerde'),
      o('DORA', 'Art. 19', 'B', 'melden', 'controller', 'behoerde'),
    ]);
    expect(r.T).toHaveLength(1);
    expect(r.T[0].a.law).not.toBe(r.T[0].b.law);
    expect(r.T[0].actionId).toBe('melden');
  });

  it('caps how often the same duty may appear', () => {
    // In actions.v1 kam eine Formulierung SECHSMAL vor: derselbe Adjudikator
    // beantwortet dieselbe Frage mehrfach, ohne dass Information entsteht.
    const many: SlottedObligation[] = [
      o('DSGVO', 'Art. 33', 'links', 'melden', 'controller', 'behoerde'),
      ...Array.from({ length: 5 }, (_, i) => o('DORA', `Art. ${19 + i}`, `rechts ${i}`, 'melden', 'controller', 'behoerde')),
    ];
    const r = buildStrictPairs(many, { maxUsesPerObligation: 2 });
    expect(r.T.length).toBeLessThanOrEqual(2);
  });

  it('spreads across groups instead of letting one bucket dominate', () => {
    // 44 der 60 Arm-T-Paare in actions.v1 stammten aus ZWEI Toepfen.
    const obs: SlottedObligation[] = [];
    for (let i = 0; i < 6; i++) {
      obs.push(o('DSGVO', `Art. ${i}`, `gross ${i}`, 'melden', 'controller', 'behoerde'));
      obs.push(o('DORA', `Art. ${100 + i}`, `gross-b ${i}`, 'melden', 'controller', 'behoerde'));
    }
    obs.push(o('DSGVO', 'Art. 32', 'klein', 'tom', 'controller', 'intern'));
    obs.push(o('NIS2', 'Art. 21', 'klein-b', 'tom', 'controller', 'intern'));

    const r = buildStrictPairs(obs, { maxUsesPerObligation: 1, maxPerArm: 4 });
    const actions = new Set(r.T.map((c) => c.actionId));
    expect(actions.has('tom')).toBe(true);
    expect(r.T.length).toBeLessThanOrEqual(4);
  });

  it('is deterministic — a wobbling probe measures two different things', () => {
    const obs = [
      o('DSGVO', 'Art. 33', 'A', 'melden', 'controller', 'behoerde'),
      o('DORA', 'Art. 19', 'B', 'melden', 'controller', 'behoerde'),
      o('NIS2', 'Art. 23', 'C', 'melden', 'controller', 'behoerde'),
    ];
    expect(buildStrictPairs(obs).T.map((c) => c.id)).toEqual(buildStrictPairs(obs).T.map((c) => c.id));
  });

  it('keeps arm K genuinely off-action but otherwise comparable', () => {
    // Sonst misst die Negativ-Kontrolle den Themenbruch statt den Katalog.
    const r = buildStrictPairs([
      o('DSGVO', 'Art. 33', 'A', 'melden', 'controller', 'behoerde'),
      o('DORA', 'Art. 19', 'B', 'melden', 'controller', 'behoerde'),
      o('DSGVO', 'Art. 32', 'C', 'tom', 'controller', 'behoerde'),
      o('DORA', 'Art. 9', 'D', 'zugriff', 'controller', 'behoerde'),
    ]);
    for (const c of r.K) {
      expect(c.actionIdB).toBeDefined();
      expect(c.actionId).not.toBe(c.actionIdB);
      expect(c.a.law).not.toBe(c.b.law);
    }
  });

  it('can restrict to allowed duty-holders and says how many it dropped', () => {
    const r = buildStrictPairs(
      [
        o('DSGVO', 'Art. 33', 'A', 'melden', 'controller', 'behoerde'),
        o('DORA', 'Art. 19', 'B', 'melden', 'supervisor', 'behoerde'),
      ],
      { allowedPartyRoles: ['controller'] },
    );
    expect(r.statsT.wrongParty).toBe(1);
    expect(r.T).toHaveLength(0);
  });

  it('counts duties that could not be placed at all', () => {
    const r = buildStrictPairs([o('DSGVO', 'Art. 33', 'A', null, 'controller', 'behoerde')]);
    expect(r.statsT.incomplete).toBe(1);
  });

  it('reports an empty result as a FINDING, not as an error', () => {
    // Bleiben wenige Paare uebrig, ist das die Antwort auf die Wertfrage — die
    // unabhaengige Katalog-Rechnung kam auf 5-6 echte Kandidaten.
    const r = buildStrictPairs([]);
    expect(r.T).toEqual([]);
    expect(r.statsT.candidates).toBe(0);
  });

  it('assembles a golden set that is NOT frozen — it still needs adjudication', () => {
    const r = buildStrictPairs([
      o('DSGVO', 'Art. 33', 'A', 'melden', 'controller', 'behoerde'),
      o('DORA', 'Art. 19', 'B', 'melden', 'controller', 'behoerde'),
    ]);
    const set = toGoldenSet(r, 'actions.v2.draft', '1.8.0');
    expect(set.frozen).toBe(false);
    expect(set.cases.length).toBe(r.T.length + r.K.length);
  });
});
