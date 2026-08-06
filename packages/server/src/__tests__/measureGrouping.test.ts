/**
 * Tests für die Maßnahmen-Gruppierung (THE-545, Task 6).
 *
 * Hier sitzen zwei der drei Kontrollen aus THE-545 — und die schwerwiegendste
 * ist STRUKTURELL, nicht inhaltlich:
 *
 * **Die mechanische Negativ-Kontrolle gilt als gerissen, sobald das verdrängte
 * Paar überhaupt einem Richter vorgelegt wird** — unabhängig davon, wie er
 * urteilt. Ein richtiges Urteil aus dem falschen Grund ist kein Bestehen.
 *
 * Drei Entwurfsentscheidungen, die der Plan-Review gerettet hat:
 *
 * 1. Geprüft wird mit der Adressatenklasse der VORRANGIGEN Seite. NIS2 Art. 23
 *    trägt `essential_important_entity`, und `findDisplacement('nis2',
 *    'essential_important_entity')` ist null — die richtige Frage lautet „gibt
 *    es einen Adressaten, für den BEIDE gelten?", und ein Finanzunternehmen ist
 *    zugleich wesentliche Einrichtung.
 * 2. Adressaten-Kompatibilität ist eine Datenzeile, NICHT „gleiche Rolle".
 *    Alle fünf SCF-Kandidaten sind rollenübergreifend; „gleiche Id" ergäbe
 *    mechanisch 0/5.
 * 3. Eine Maßnahme ist eine ZUSAMMENHANGSKOMPONENTE, kein Paar. GOV-02 und
 *    RSK-01 verlangen DORA+DSGVO+NIS2, und alle NIS2×DORA-Direktkanten sind
 *    verdrängt — paarweise Gruppen könnten höchstens 3/5 erreichen, und die
 *    Abbruchschwelle risse an einer Implementierungsentscheidung.
 */
import {
  groupIntoMeasures,
  COMPATIBLE_ENTERPRISE_ROLES,
  areAddresseesCompatible,
  PAIR_SELECTION_ORDER,
  type GroupableSysReq,
  type JudgeFn,
} from '../evals/reqtrace/measureGrouping';

const rel = (r: string): string => `{"relation":"${r}","why":"stub"}`;
const INTERSECTS = rel('intersects');
const UNRELATED = rel('unrelated');

const req = (over: Partial<GroupableSysReq> & Pick<GroupableSysReq, 'id' | 'source'>): GroupableSysReq => ({
  text: 'Das Unternehmen muss Risiken bewerten. [M-1]',
  schutzgut: 'Daten',
  verpflichteter: 'controller',
  ausloeser: 'Verarbeitung',
  nachweis: 'Rechenschaft',
  derivedFrom: ['x:y:c01'],
  implementationFree: true,
  actionId: 'risikobewertung',
  addresseeClass: 'controller',
  ...over,
});

/** Stub-Richter, der LIEST: gleiche Marke `[M-n]` auf beiden Seiten → verwandt. */
const markerJudge = async (_s: string, u: string): Promise<string> => {
  const marks = [...u.matchAll(/\[M-(\d)\]/g)].map((m) => m[1]);
  return marks.length === 2 && marks[0] === marks[1] ? INTERSECTS : UNRELATED;
};

const nis2Art23 = req({
  id: 'nis2:art23:s1',
  source: 'nis2',
  addresseeClass: 'essential_important_entity',
  actionId: 'vorfall-melden-behoerde',
  text: 'Das Unternehmen muss erhebliche Vorfälle an das CSIRT melden. [M-9]',
  ausloeser: 'erheblicher Sicherheitsvorfall',
  nachweis: 'CSIRT-Meldung',
});
const doraArt19 = req({
  id: 'dora:art19:s1',
  source: 'dora',
  addresseeClass: 'financial_entity',
  actionId: 'vorfall-melden-behoerde',
  text: 'Das Unternehmen muss schwerwiegende Vorfälle an die Finanzaufsicht melden. [M-9]',
  ausloeser: 'schwerwiegender IKT-Vorfall',
  nachweis: 'Aufsichtsmeldung',
});

describe('areAddresseesCompatible (THE-545)', () => {
  it('treats the enterprise roles as compatible — one company holds all three', () => {
    expect(COMPATIBLE_ENTERPRISE_ROLES.length).toBeGreaterThanOrEqual(3);
    expect(areAddresseesCompatible('controller', 'financial_entity')).toBe(true);
    expect(areAddresseesCompatible('controller', 'essential_important_entity')).toBe(true);
  });

  it('is NOT "same role" — that reading would kill every positive candidate', () => {
    // Alle fuenf SCF-Kandidaten sind rollenuebergreifend.
    expect(areAddresseesCompatible('controller', 'controller')).toBe(true);
    expect(areAddresseesCompatible('financial_entity', 'essential_important_entity')).toBe(true);
  });

  it('rejects an authority against a company', () => {
    // Genau der Defekt, an dem die Adjudikation am 2026-08-02 abgebrochen ist.
    expect(areAddresseesCompatible('controller', 'data_subject')).toBe(false);
  });
});

describe('groupIntoMeasures — Verdrängung (THE-545, DoD-2)', () => {
  it('excludes displaced pairs BEFORE any judge sees them — structurally', async () => {
    const asked: string[] = [];
    const r = await groupIntoMeasures([nis2Art23, doraArt19], {
      judge: async (_s, u) => {
        asked.push(u);
        return INTERSECTS;
      },
    });
    expect(r.excludedByDisplacement).toHaveLength(1);
    expect(r.excludedByDisplacement[0].displaced).toContain('nis2');
    // Pro Prompt asserten, NICHT ueber die Konkatenation: sonst matcht das
    // Muster ueber Prompt-Grenzen hinweg und der Test reisst falsch-positiv.
    for (const u of asked) {
      expect(u).not.toMatch(/CSIRT[\s\S]*Finanzaufsicht|Finanzaufsicht[\s\S]*CSIRT/);
    }
    expect(r.judged).toBe(0);
  });

  it('checks displacement against the PREVAILING side addressee class', async () => {
    // findDisplacement('nis2', 'essential_important_entity') ist null — die
    // Kante traegt `financial_entity`, also die Klasse der vorrangigen Seite.
    const r = await groupIntoMeasures([nis2Art23, doraArt19], { judge: async () => UNRELATED });
    expect(r.excludedByDisplacement).toHaveLength(1);
    expect(r.excludedByDisplacement[0].citations.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves the displaced pair in NO measure', async () => {
    const r = await groupIntoMeasures([nis2Art23, doraArt19], { judge: async () => INTERSECTS });
    for (const m of r.measures) {
      expect(m.memberIds).not.toEqual(expect.arrayContaining(['nis2:art23:s1', 'dora:art19:s1']));
    }
  });
});

describe('groupIntoMeasures — Gruppierung (THE-545, DoD-1/DoD-3)', () => {
  const dsgvo32 = req({ id: 'dsgvo:art32:s1', source: 'dsgvo', addresseeClass: 'controller' });
  const nis2_21 = req({ id: 'nis2:art21:s1', source: 'nis2', addresseeClass: 'essential_important_entity' });

  it('groups same-action cross-law requirements into one measure', async () => {
    const r = await groupIntoMeasures([dsgvo32, nis2_21], { judge: markerJudge });
    expect(r.measures).toHaveLength(1);
    expect(r.measures[0].memberIds.sort()).toEqual(['dsgvo:art32:s1', 'nis2:art21:s1']);
    expect(r.measures[0].laws.sort()).toEqual(['dsgvo', 'nis2']);
  });

  it('records the typed relation on every edge — intersects is the expected case', async () => {
    const r = await groupIntoMeasures([dsgvo32, nis2_21], { judge: markerJudge });
    expect(r.measures[0].relations).toEqual([expect.objectContaining({ relation: 'intersects' })]);
  });

  it('leaves same-addressee different-action pairs ungrouped (semantic negative)', async () => {
    // NIS2 Art. 21 Risikoanalyse x DSGVO Art. 33 Meldung: gleicher Adressat,
    // verschiedene Handlung — keine geteilte Massnahme.
    const dsgvo33 = req({
      id: 'dsgvo:art33:s1',
      source: 'dsgvo',
      actionId: 'vorfall-melden-behoerde',
      text: 'Das Unternehmen muss die Verletzung melden. [M-1]',
    });
    const r = await groupIntoMeasures([nis2_21, dsgvo33], { judge: markerJudge });
    expect(r.judged).toBe(0); // verschiedene Handlung → gar nicht erst gefragt
    expect(r.measures.filter((m) => m.memberIds.length > 1)).toHaveLength(0);
  });

  it('drops a pair the judge calls unrelated', async () => {
    const other = req({ id: 'nis2:art21:s9', source: 'nis2', text: 'Etwas ganz anderes. [M-7]' });
    const r = await groupIntoMeasures([dsgvo32, other], { judge: markerJudge });
    expect(r.judged).toBe(1);
    expect(r.measures.filter((m) => m.memberIds.length > 1)).toHaveLength(0);
  });

  it('does NOT let a bridge re-unite what displacement separated', async () => {
    // DER BEFUND AUS LAUF 1: ueber die DSGVO als Bruecke landeten NIS2 Art. 23
    // und DORA Art. 19 in DERSELBEN Massnahme — das Paar, das lex specialis
    // fuer jeden Adressaten ausschliesst. Die mechanische Kontrolle bestand
    // dem Buchstaben nach (der Richter sah das Paar nie) und verfehlte ihren
    // Zweck. Die Clique verhindert das: dora kann nur beitreten, wenn es mit
    // JEDEM Mitglied verbunden ist — und die Kante zu nis2 existiert nicht.
    const dora6 = req({
      id: 'dora:art6:s1',
      source: 'dora',
      addresseeClass: 'financial_entity',
      text: 'Das Unternehmen muss IKT-Risiken bewerten. [M-1]',
    });
    const r = await groupIntoMeasures([dsgvo32, nis2_21, dora6], { judge: markerJudge });
    expect(r.excludedByDisplacement).toHaveLength(1);
    expect(r.judged).toBe(2);
    for (const m of r.measures) {
      expect(m.laws).not.toEqual(expect.arrayContaining(['dora', 'nis2']));
    }
  });

  it('is deterministic — same input, same measures', async () => {
    const a = await groupIntoMeasures([dsgvo32, nis2_21], { judge: markerJudge });
    const b = await groupIntoMeasures([dsgvo32, nis2_21], { judge: markerJudge });
    expect(a.measures).toEqual(b.measures);
  });

  it('blinds both sides before the judge sees them', async () => {
    const seen: string[] = [];
    await groupIntoMeasures(
      [
        req({ id: 'a', source: 'dsgvo', text: 'Nach DSGVO Art. 32 bewerten. [M-1]' }),
        req({ id: 'b', source: 'nis2', addresseeClass: 'essential_important_entity', text: 'Nach NIS2 Art. 21 bewerten. [M-1]' }),
      ],
      {
        judge: async (_s, u) => {
          seen.push(u);
          return INTERSECTS;
        },
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toMatch(/\bDSGVO\b|\bNIS-?2\b|Art\.\s?32|Art\.\s?21/);
  });
});

describe('groupIntoMeasures — Zusammenfall (THE-545, ADR-0007 E5)', () => {
  it('collapses only on an identical collapseKey', async () => {
    const a = req({ id: 'dsgvo:art32:s1', source: 'dsgvo' });
    const twin = req({ id: 'nis2:art21:s1', source: 'nis2', addresseeClass: 'essential_important_entity' });
    const r = await groupIntoMeasures([a, twin], { judge: markerJudge });
    expect(r.collapsed).toHaveLength(1);
    expect(r.collapsed[0].ids.sort()).toEqual(['dsgvo:art32:s1', 'nis2:art21:s1']);
  });

  it('does NOT collapse when one key field differs — the deadline case', async () => {
    const a = req({ id: 'a', source: 'dsgvo' });
    const b = req({ id: 'b', source: 'nis2', addresseeClass: 'essential_important_entity', ausloeser: 'erheblicher Vorfall' });
    const r = await groupIntoMeasures([a, b], { judge: markerJudge });
    expect(r.collapsed).toEqual([]);
  });
});

/**
 * Transitivität (THE-545, Befund aus Lauf 1 vom 2026-08-02).
 *
 * Lauf 1 erzeugte EINE Maßnahme mit 159 Anforderungen über alle drei Gesetze —
 * 442 der 576 Urteile waren `intersects`, und Zusammenhangskomponenten
 * behandeln die Relation als Äquivalenz. Das ist ein Kategorienfehler:
 * unsere eigene Rubrik definiert `intersects` als „gemeinsamer Kern, aber JEDE
 * Pflicht verlangt zusätzlich etwas" — daraus folgt für A–B und B–C NICHTS
 * über A–C.
 *
 * Schlimmer: über die DSGVO als Brücke landeten NIS2 Art. 23 und DORA Art. 19
 * in derselben Maßnahme — das Paar, das lex specialis für jeden Adressaten
 * ausschließt. Die mechanische Kontrolle bestand dem Buchstaben nach (der
 * Richter sah das Paar nie) und verfehlte ihren Zweck.
 *
 * `equal` und `subset` bleiben transitiv — sie sind es.
 */
describe('groupIntoMeasures — Transitivität (THE-545)', () => {
  // WICHTIG: der DORA-Eintrag traegt hier `controller`, nicht
  // `financial_entity` — sonst greift die Verdraengung nis2xdora und der Test
  // pruefte sie statt der Transitivitaet. Ein Finanzunternehmen IST auch
  // Verantwortlicher, die Konstellation ist also nicht konstruiert.
  const r = (id: string, source: string, addresseeClass = 'controller'): GroupableSysReq =>
    req({ id, source, addresseeClass, text: `Anforderung ${id}. [M-1]` });

  const judgeFor = (map: Record<string, string>): JudgeFn =>
    async (_s, u) => {
      const ids = [...u.matchAll(/Anforderung ([a-z0-9]+)\./g)].map((m) => m[1]).sort();
      const r = map[ids.join('-')] ?? 'unrelated';
      // `subset` OHNE Richtung wird vom Parser verworfen (THE-382, Task 1) —
      // der Stub muss sie mitliefern, sonst entsteht gar keine Kante.
      return r === 'subset' ? '{"relation":"subset","wider":"A","why":"stub"}' : rel(r);
    };

  it('does NOT chain intersects — A~B and B~C without A~C stays two measures', async () => {
    const g = await groupIntoMeasures([r('a', 'dsgvo'), r('b', 'nis2', 'essential_important_entity'), r('c', 'dora')], {
      judge: judgeFor({ 'a-b': 'intersects', 'b-c': 'intersects', 'a-c': 'unrelated' }),
    });
    const big = g.measures.filter((m) => m.memberIds.length > 1);
    expect(big.every((m) => m.memberIds.length === 2)).toBe(true);
    expect(big.some((m) => m.memberIds.length === 3)).toBe(false);
  });

  it('forms a three-law measure when ALL THREE pairs were judged intersects', async () => {
    // Eine Clique unterstellt keine Transitivitaet — sie verlangt sie als
    // beobachtet. GOV-02/RSK-01 bleiben damit erreichbar.
    const g = await groupIntoMeasures([r('a', 'dsgvo'), r('b', 'nis2', 'essential_important_entity'), r('c', 'dora')], {
      judge: judgeFor({ 'a-b': 'intersects', 'b-c': 'intersects', 'a-c': 'intersects' }),
    });
    expect(g.measures.find((m) => m.memberIds.length === 3)?.laws.sort()).toEqual(['dora', 'dsgvo', 'nis2']);
  });

  it('DOES chain equal and subset — those relations are transitive', async () => {
    const g = await groupIntoMeasures([r('a', 'dsgvo'), r('b', 'nis2', 'essential_important_entity'), r('c', 'dora')], {
      judge: judgeFor({ 'a-b': 'equal', 'b-c': 'subset', 'a-c': 'unrelated' }),
    });
    expect(g.measures.find((m) => m.memberIds.length === 3)).toBeTruthy();
  });

  it('reports intersects pairs that formed no group as shared-core candidates', async () => {
    const g = await groupIntoMeasures([r('a', 'dsgvo'), r('b', 'nis2', 'essential_important_entity'), r('c', 'dora')], {
      judge: judgeFor({ 'a-b': 'intersects', 'b-c': 'intersects', 'a-c': 'unrelated' }),
    });
    // Nichts geht verloren: jede geurteilte Ueberschneidung bleibt sichtbar.
    // a~b bildet die Massnahme; nur b~c bleibt uebrig — es ist mit a nicht
    // verbunden und darf deshalb nicht angehaengt werden.
    expect(g.sharedCorePairs.length).toBe(1);
  });
});

/**
 * Laufzeit-Schutz (THE-545, Befund aus Lauf 2).
 *
 * Die Paar-Schleife ist quadratisch: 304 Anforderungen ergaben 2124
 * Kandidaten-Paare, davon 980 beurteilt — die Gruppierungsphase lief ueber
 * eine Stunde OHNE ein einziges Lebenszeichen. Beides ist zu beheben, und
 * die Deckelung muss sichtbar sein: ein stilles Abschneiden liest sich im
 * Bericht wie „mehr gab es nicht".
 */
describe('groupIntoMeasures — Laufzeit-Schutz (THE-545)', () => {
  const many = Array.from({ length: 6 }, (_, i) =>
    req({ id: `r${i}`, source: i % 2 === 0 ? 'dsgvo' : 'nis2', addresseeClass: i % 2 === 0 ? 'controller' : 'essential_important_entity' }),
  );

  it('reports progress while judging — an hour without a sign of life is not acceptable', async () => {
    const seen: [number, number][] = [];
    await groupIntoMeasures(many, { judge: markerJudge, onProgress: (d, t) => seen.push([d, t]) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1][0]).toBe(seen[seen.length - 1][1]);
  });

  it('caps the number of judged pairs and SAYS so', async () => {
    const r = await groupIntoMeasures(many, { judge: markerJudge, maxJudgedPairs: 2 });
    expect(r.judged).toBe(2);
    expect(r.cappedPairs).toBeGreaterThan(0);
  });

  it('reports zero capping when the cap was never reached', async () => {
    const r = await groupIntoMeasures(many, { judge: markerJudge });
    expect(r.cappedPairs).toBe(0);
  });
});

/**
 * THE-590 Slice 1 — die Ehrlichkeit des Deckels.
 *
 * `cappedPairs` allein beantwortet die falsche Frage. Es sagt, wie viele
 * ÜBRIG blieben, nicht wie viele es GAB — und wer die Gesamtzahl braucht,
 * muss sie aus zwei Feldern zusammenrechnen. Genau diese stille
 * Doppeldeutigkeit war der Watch-Point des Pre-Flights: ein Aufruf mit
 * `maxJudgedPairs: 0` liefert die Kandidatenzahl heute schon — verkleidet
 * als „gekappt". Ein Zähler, den man nur über einen Trick erreicht, ist
 * kein Zähler.
 */
describe('groupIntoMeasures — Kandidatenzahl und Auswahlkriterium (THE-590)', () => {
  // Jede Anforderung traegt eine EIGENE Marke: nur so kann der
  // Determinismus-Test sagen, WELCHE Paare gekappt wurden, statt nur wie viele.
  const many = Array.from({ length: 6 }, (_, i) =>
    req({
      id: `r${i}`,
      source: i % 2 === 0 ? 'dsgvo' : 'nis2',
      addresseeClass: i % 2 === 0 ? 'controller' : 'essential_important_entity',
      text: `Das Unternehmen muss Risiken bewerten. [M-${i}]`,
    }),
  );

  it('names the candidate pairs as their own field — not derivable from cappedPairs', async () => {
    const r = await groupIntoMeasures(many, { judge: markerJudge, maxJudgedPairs: 2 });
    expect(r.candidatePairs).toBe(9); // 3 dsgvo × 3 nis2, gleiche Handlung, verträgliche Rollen
    expect(r.judged).toBe(2);
  });

  it('keeps the ledger balanced under a cap — judged + capped = candidates', async () => {
    const r = await groupIntoMeasures(many, { judge: markerJudge, maxJudgedPairs: 4 });
    expect(r.judged + r.cappedPairs).toBe(r.candidatePairs);
  });

  it('keeps the ledger balanced without a cap', async () => {
    const r = await groupIntoMeasures(many, { judge: markerJudge });
    expect(r.cappedPairs).toBe(0);
    expect(r.judged).toBe(r.candidatePairs);
  });

  it('keeps the ledger balanced at cap zero — the count without a single judgement', async () => {
    const judge: JudgeFn = async () => {
      throw new Error('the judge must not run at cap zero');
    };
    const r = await groupIntoMeasures(many, { judge, maxJudgedPairs: 0 });
    expect(r.judged).toBe(0);
    expect(r.candidatePairs).toBe(9);
    expect(r.cappedPairs).toBe(9);
  });

  // Die Verdrängung sitzt VOR dem Deckel: ein ausgeschlossenes Paar ist kein
  // Kandidat, der weggekappt wurde — es hätte den Richter nie erreicht.
  // Beides in eine Zahl zu werfen, würde die Negativ-Kontrolle unlesbar machen.
  it('does not count displaced pairs as candidates', async () => {
    const r = await groupIntoMeasures([nis2Art23, doraArt19], { judge: markerJudge });
    expect(r.excludedByDisplacement).toHaveLength(1);
    expect(r.candidatePairs).toBe(0);
    expect(r.judged).toBe(0);
  });

  it('reports the selection order, and it is stable rather than a ranking', async () => {
    const r = await groupIntoMeasures(many, { judge: markerJudge, maxJudgedPairs: 2 });
    expect(r.selectionOrder).toBe(PAIR_SELECTION_ORDER);
  });

  it('caps the SAME pairs on a repeated run — a shifting excerpt would be worthless as evidence', async () => {
    const seen: string[][] = [];
    const spy: JudgeFn = async (_s, u) => {
      seen.push([...u.matchAll(/\[M-(\d)\]/g)].map((m) => m[0]));
      return UNRELATED;
    };
    await groupIntoMeasures(many, { judge: spy, maxJudgedPairs: 3 });
    const first = seen.splice(0, seen.length);
    await groupIntoMeasures(many, { judge: spy, maxJudgedPairs: 3 });
    expect(seen).toEqual(first);
  });
});

/**
 * THE-600 — Werk-Stämme: die Kette rechnet auf dem GESETZ, nicht auf der
 * Schreibweise.
 *
 * Der Korpus-Pfad (seit THE-570 der Hauptpfad) liefert `nis2-de`/`dora-de`
 * als Schlüssel-Stamm. Vor diesem Fix verglich alles exakt: das
 * Verdrängungs-Gate war für drei von vier Stamm-Kombinationen stumm
 * (gemessen 2026-08-05), und zwei Sprachfassungen DESSELBEN Gesetzes galten
 * als gesetzesübergreifendes Paar. Der Richter throws hier bewusst — die
 * Kontrolle ist strukturell, nicht inhaltlich: sieht er das Paar überhaupt,
 * ist sie gerissen, egal wie er urteilt.
 */
describe('groupIntoMeasures — Werk-Stämme (THE-600)', () => {
  const neverJudge: JudgeFn = async () => {
    throw new Error('the judge must never see this pair');
  };
  const nis2DeArt23 = req({
    ...nis2Art23,
    id: 'nis2-de:art23:s1',
    source: 'nis2-de',
  });
  const doraDeArt19 = req({
    ...doraArt19,
    id: 'dora-de:art19:s1',
    source: 'dora-de',
  });

  it('excludes dora-de × nis2-de BEFORE any judge — the canonical corpus path', async () => {
    const r = await groupIntoMeasures([nis2DeArt23, doraDeArt19], { judge: neverJudge });
    expect(r.excludedByDisplacement).toHaveLength(1);
    expect(r.excludedByDisplacement[0].displaced).toBe('nis2-de');
    expect(r.judged).toBe(0);
    expect(r.candidatePairs).toBe(0);
  });

  it('treats nis2 × nis2-de as ONE law — no candidate, no exclusion, no judge', async () => {
    // Gleiche Handlung, verträgliche Rollen — nur die Familie trennt das Paar
    // von der Beurteilung. Es ist kein Verdrängungs-Fall (ein Gesetz verdrängt
    // sich nicht selbst), sondern gar kein gesetzesübergreifendes Paar.
    const r = await groupIntoMeasures([nis2Art23, nis2DeArt23], { judge: neverJudge });
    expect(r.candidatePairs).toBe(0);
    expect(r.excludedByDisplacement).toHaveLength(0);
    expect(r.judged).toBe(0);
  });

  it('counts measure.laws as families — nis2-de contributes as nis2', async () => {
    // Sonst zählt dieselbe Norm doppelt, und das Gold-Matching am Produktpfad
    // reißt mechanisch an 'nis2-de' ≠ 'nis2'.
    const dsgvo = req({
      id: 'dsgvo:art33:s1',
      source: 'dsgvo',
      actionId: 'vorfall-melden-behoerde',
      text: 'Das Unternehmen muss die Verletzung melden. [M-9]',
    });
    const r = await groupIntoMeasures([dsgvo, nis2DeArt23], { judge: markerJudge });
    expect(r.measures).toHaveLength(1);
    expect(r.measures[0].laws).toEqual(['dsgvo', 'nis2']);
  });
});
