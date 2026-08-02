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
  type GroupableSysReq,
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

  it('forms a THREE-law measure over a bridge, without a direct edge', async () => {
    // GOV-02/RSK-01 verlangen dora+dsgvo+nis2, aber NIS2xDORA ist verdraengt.
    // Die DSGVO ist die Bruecke — paarweise Gruppen koennten das nie.
    const dora6 = req({
      id: 'dora:art6:s1',
      source: 'dora',
      addresseeClass: 'financial_entity',
      text: 'Das Unternehmen muss IKT-Risiken bewerten. [M-1]',
    });
    const r = await groupIntoMeasures([dsgvo32, nis2_21, dora6], { judge: markerJudge });
    expect(r.measures).toHaveLength(1);
    expect(r.measures[0].laws.sort()).toEqual(['dora', 'dsgvo', 'nis2']);
    // Die verdraengte Direktkante wurde NICHT geurteilt.
    expect(r.excludedByDisplacement).toHaveLength(1);
    expect(r.judged).toBe(2);
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
