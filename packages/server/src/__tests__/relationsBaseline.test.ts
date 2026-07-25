/**
 * Baseline-Eval-Metriken (THE-433 Task 4) — reine Funktionen, kein Netz.
 *
 * Die Erfolgs-/Abbruchregel des Plans ist VOR der Messung fixiert worden; diese
 * Suite nagelt fest, dass das Gate genau sie rechnet und nicht etwas Ähnliches:
 *  (a) alles richtig → Gesamt 1,0, Verdikt ERFOLG
 *  (b) Typ richtig / Richtung falsch → Fehler UND eigener Richtungs-Zähler
 *  (c) Klasse mit n<10 → als dünn ausgewiesen, aber NICHT gegated (n≥10-Regel)
 *  (d) EIN metadata-Vorschlag → ABBRUCH, egal wie gut der Rest ist (AC-5)
 *  (e) Messausfall ist ein Ausfall, KEIN 'none' — fehlende Daten, kein Datenpunkt
 *
 * Run: cd packages/server && npx jest src/__tests__/relationsBaseline.test.ts
 */
import {
  BASELINE_GATE_MIN_SUPPORT,
  RELATIONS_BASELINE_SUCCESS_RULE,
  detectMetadataProposal,
  runRelationsBaseline,
  scoreRelationsBaseline,
  formatRelationsBaselineReport,
  type RelationsBaselinePrediction,
  type RelationsBaselineTruth,
} from '../scripts/relations-baseline';

// ─── Helfer: synthetische Wahrheiten + Vorhersagen ──────────────

const truth = (
  caseId: string,
  relation: string | null,
  direction?: 'a-to-b' | 'b-to-a'
): RelationsBaselineTruth =>
  relation === null ? { caseId, relation: null } : { caseId, relation, direction };

const pred = (
  caseId: string,
  over: Partial<RelationsBaselinePrediction> = {}
): RelationsBaselinePrediction => ({ caseId, dropped: false, ...over });

/** 10 INTERPRETS (genau die n≥10-Gate-Klasse) + 20 'none' — alles korrekt vorhergesagt. */
function perfectSet(): { cases: RelationsBaselineTruth[]; predictions: RelationsBaselinePrediction[] } {
  const cases: RelationsBaselineTruth[] = [];
  const predictions: RelationsBaselinePrediction[] = [];
  for (let i = 0; i < 10; i++) {
    cases.push(truth(`int-${i}`, 'INTERPRETS', 'a-to-b'));
    predictions.push(pred(`int-${i}`, { relation: 'INTERPRETS', direction: 'a-to-b' }));
  }
  for (let i = 0; i < 20; i++) {
    cases.push(truth(`none-${i}`, null));
    predictions.push(pred(`none-${i}`, { relation: null }));
  }
  return { cases, predictions };
}

describe('scoreRelationsBaseline() — (a) alles richtig', () => {
  it('Gesamt 1,0, none-Precision 1,0, INTERPRETS-F1 1,0 → Verdikt ERFOLG', () => {
    const { cases, predictions } = perfectSet();
    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.totalCases).toBe(30);
    expect(r.scored).toBe(30);
    expect(r.correct).toBe(30);
    expect(r.overallAgreement).toBe(1);
    expect(r.none.precision).toBe(1);
    expect(r.none.recall).toBe(1);
    const interprets = r.types.find((t) => t.relationType === 'INTERPRETS')!;
    expect(interprets.support).toBe(10);
    expect(interprets.thin).toBe(false);
    expect(interprets.gated).toBe(true);
    expect(interprets.f1).toBe(1);
    expect(r.directionErrors).toBe(0);
    expect(r.typeErrors).toBe(0);
    expect(r.metadataProposals).toBe(0);
    expect(r.verdict.pass).toBe(true);
    expect(r.verdict.failed).toEqual([]);
  });

  it('der Report zitiert die Erfolgsregel und ruft ERFOLG laut aus', () => {
    const { cases, predictions } = perfectSet();
    const text = formatRelationsBaselineReport(scoreRelationsBaseline(cases, predictions));
    expect(text).toContain(RELATIONS_BASELINE_SUCCESS_RULE);
    expect(text).toContain('ERFOLG');
    expect(text).not.toContain('ABBRUCH');
  });
});

describe('scoreRelationsBaseline() — (b) Richtung falsch', () => {
  it('Typ richtig, Richtung falsch: zählt als Fehler UND als directionError (nicht als Typfehler)', () => {
    const { cases, predictions } = perfectSet();
    predictions[0] = pred('int-0', { relation: 'INTERPRETS', direction: 'b-to-a' }); // Wahrheit: a-to-b

    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.correct).toBe(29);
    expect(r.overallAgreement).toBeCloseTo(29 / 30, 10);
    expect(r.directionErrors).toBe(1);
    expect(r.directionErrorCaseIds).toEqual(['int-0']);
    // Ein Richtungs-Fehler ist ein ANDERER Fehlertyp als ein falscher Typ.
    expect(r.typeErrors).toBe(0);
    // …und er schlägt trotzdem auf die Klassen-Metrik durch (Richtung ist Teil der Behauptung).
    const interprets = r.types.find((t) => t.relationType === 'INTERPRETS')!;
    expect(interprets.tp).toBe(9);
    expect(interprets.fp).toBe(1);
    expect(interprets.fn).toBe(1);
  });
});

describe('scoreRelationsBaseline() — (c) dünne Klasse (n<10)', () => {
  it('wird ausgewiesen, aber nicht gegated — ein F1 von 0 kippt das Verdikt nicht', () => {
    const { cases, predictions } = perfectSet();
    // 3 CONCRETIZES-Wahrheiten, alle falsch vorhergesagt (als SETS_PARAMETER).
    for (let i = 0; i < 3; i++) {
      cases.push(truth(`con-${i}`, 'CONCRETIZES', 'a-to-b'));
      predictions.push(pred(`con-${i}`, { relation: 'SETS_PARAMETER', direction: 'a-to-b' }));
    }

    const r = scoreRelationsBaseline(cases, predictions);

    const con = r.types.find((t) => t.relationType === 'CONCRETIZES')!;
    expect(con.support).toBe(3);
    expect(con.support).toBeLessThan(BASELINE_GATE_MIN_SUPPORT);
    expect(con.thin).toBe(true);
    expect(con.gated).toBe(false);
    expect(con.f1).toBe(0);
    // Auch die über-vorhergesagte Klasse ohne Gold-Support ist sichtbar, aber dünn.
    const setp = r.types.find((t) => t.relationType === 'SETS_PARAMETER')!;
    expect(setp.support).toBe(0);
    expect(setp.thin).toBe(true);
    expect(setp.gated).toBe(false);

    expect(r.typeErrors).toBe(3);
    expect(r.overallAgreement).toBeCloseTo(30 / 33, 10);
    expect(r.verdict.pass).toBe(true);
    expect(r.verdict.notGated).toContain('CONCRETIZES');
  });
});

describe('scoreRelationsBaseline() — (d) metadata-Vorschlag', () => {
  it('EIN metadata-Typ-Vorschlag → ABBRUCH, egal wie gut der Rest ist (AC-5)', () => {
    const { cases, predictions } = perfectSet();
    cases.push(truth('meta-0', null));
    predictions.push(pred('meta-0', { dropped: true, metadataRelation: 'AMENDS' }));

    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.metadataProposals).toBe(1);
    expect(r.metadataProposalCaseIds).toEqual(['meta-0']);
    // Der Rest ist exzellent …
    expect(r.overallAgreement).toBeGreaterThan(0.9);
    expect(r.none.precision).toBe(1);
    expect(r.types.find((t) => t.relationType === 'INTERPRETS')!.f1).toBe(1);
    // … und trotzdem ist das Verdikt ABBRUCH.
    expect(r.verdict.pass).toBe(false);
    expect(r.verdict.failed.join(' ')).toMatch(/metadata/i);
    expect(formatRelationsBaselineReport(r)).toContain('ABBRUCH');
  });
});

describe('scoreRelationsBaseline() — (e) Messausfall', () => {
  it('wird als Ausfall gezählt, nie als "none" — er verlässt Zähler UND Nenner', () => {
    const { cases, predictions } = perfectSet();
    // Wahrheit 'none', aber der Prüfer hat nach allen Wiederholungen NICHTS geliefert.
    predictions[10] = pred('none-0', { measurementFailed: true });

    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.measurementFailures).toBe(1);
    expect(r.measurementFailureCaseIds).toEqual(['none-0']);
    expect(r.totalCases).toBe(30);
    expect(r.scored).toBe(29);
    // Der Ausfall darf weder als korrektes 'none' (TP) noch als 'none'-Fehlschuss zählen.
    expect(r.none.support).toBe(19);
    expect(r.none.tp).toBe(19);
    expect(r.none.fp).toBe(0);
    expect(r.none.fn).toBe(0);
    expect(r.none.precision).toBe(1);
    expect(r.none.recall).toBe(1);
    expect(r.correct).toBe(29);
    expect(r.overallAgreement).toBe(1);
  });

  it('eine offen gebliebene (aber gelieferte) Antwort ist KEIN Ausfall, sondern ein Fehler', () => {
    const { cases, predictions } = perfectSet();
    predictions[10] = pred('none-0', { dropped: true }); // geantwortet, aber verworfen

    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.measurementFailures).toBe(0);
    expect(r.scored).toBe(30);
    expect(r.oovDrops).toBe(1);
    expect(r.correct).toBe(29);
    expect(r.none.fn).toBe(1);
  });
});

describe('detectMetadataProposal()', () => {
  it('erkennt einen metadata-Typ in der Roh-Antwort', () => {
    expect(detectMetadataProposal('{"relation": "AMENDS", "direction": "a-to-b"}')).toBe('AMENDS');
    expect(detectMetadataProposal('sure: {"relation":"REPEALS","direction":"b-to-a"}')).toBe('REPEALS');
  });
  it('meldet inferred-Typen, "none" und Müll NICHT als metadata', () => {
    expect(detectMetadataProposal('{"relation": "INTERPRETS", "direction": "a-to-b"}')).toBeNull();
    expect(detectMetadataProposal('{"relation": "none"}')).toBeNull();
    expect(detectMetadataProposal('{"relation": "FRUIT_SALAD"}')).toBeNull();
    expect(detectMetadataProposal('')).toBeNull();
  });
});

describe('runRelationsBaseline() — Klassifikator-Schleife', () => {
  const side = (key: string) => ({
    regulationKey: key,
    source: key.split(':')[0],
    paragraphNumber: 'Art. 1',
    title: 'T',
    fullText: 'x'.repeat(60),
    language: 'en' as const,
  });
  const goldenCase = (caseId: string) => ({
    caseId,
    a: side('aaa:art-1'),
    b: side('bbb:art-1'),
    relation: null,
  });

  it('leere Antwort → measurementFailed, KEIN Label (fehlende Daten, kein Datenpunkt)', async () => {
    const client = {
      provider: 'anthropic' as const,
      model: 'fake',
      complete: async () => ({ text: '', inputTokens: 1, outputTokens: 0 }),
    };
    const res = await runRelationsBaseline([goldenCase('c1')], client);
    expect(res.predictions[0].measurementFailed).toBe(true);
    expect(res.predictions[0].relation).toBeUndefined();
  });

  it('metadata-Antwort → dropped + metadataRelation gestempelt', async () => {
    const client = {
      provider: 'anthropic' as const,
      model: 'fake',
      complete: async () => ({
        text: '{"relation":"CONSOLIDATES","direction":"a-to-b"}',
        inputTokens: 1,
        outputTokens: 1,
      }),
    };
    const res = await runRelationsBaseline([goldenCase('c1')], client);
    expect(res.predictions[0].dropped).toBe(true);
    expect(res.predictions[0].metadataRelation).toBe('CONSOLIDATES');
    expect(res.predictions[0].relation).toBeUndefined();
  });

  it('gültiges Label wird durchgereicht; Tokens werden summiert', async () => {
    const client = {
      provider: 'anthropic' as const,
      model: 'fake',
      complete: async () => ({
        text: '{"relation":"INTERPRETS","direction":"b-to-a"}',
        inputTokens: 7,
        outputTokens: 3,
      }),
    };
    const res = await runRelationsBaseline([goldenCase('c1'), goldenCase('c2')], client);
    expect(res.predictions).toHaveLength(2);
    expect(res.predictions[0]).toMatchObject({ relation: 'INTERPRETS', direction: 'b-to-a' });
    expect(res.inputTokens).toBe(14);
    expect(res.outputTokens).toBe(6);
  });
});
