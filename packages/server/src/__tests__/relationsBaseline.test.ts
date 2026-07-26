/**
 * Baseline-Eval-Metriken (THE-433 Task 4 · THE-529 Task 6) — reine Funktionen,
 * kein Netz.
 *
 * Die Erfolgs-/Abbruchregel des Plans ist VOR der Messung fixiert worden; diese
 * Suite nagelt fest, dass das Gate genau sie rechnet und nicht etwas Ähnliches:
 *  (a) alles richtig → Gesamt 1,0, Verdikt ERFOLG
 *  (b) Typ richtig / Richtung falsch → Fehler UND eigener Richtungs-Zähler
 *  (c) Klasse mit n<10 → als dünn ausgewiesen, aber NICHT gegated (n≥10-Regel)
 *  (d) EIN metadata-Vorschlag → ABBRUCH, egal wie gut der Rest ist (AC-5)
 *  (e) Messausfall ist ein Ausfall, KEIN 'none' — fehlende Daten, kein Datenpunkt
 *  (f) THE-529: mechanische Klassen (INTERPRETS) erreichen das LLM nicht,
 *      verlassen Zähler UND Nenner der LLM-Messung und werden als
 *      „mechanical (Parser-Pfad, THE-529)" ausgewiesen
 *
 * Seit THE-529 ist die n≥10-Gate-Klasse der Fixtures CONCRETIZES — INTERPRETS
 * ist mechanisch und darf in der LLM-F1-Rechnung nicht mehr vorkommen.
 *
 * Run: cd packages/server && npx jest src/__tests__/relationsBaseline.test.ts
 */
import {
  BASELINE_GATE_MIN_SUPPORT,
  RELATIONS_BASELINE_SUCCESS_RULE,
  detectMetadataProposal,
  runRelationsBaseline,
  scoreRelationsBaseline,
  selectLlmCases,
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

/** 10 CONCRETIZES (genau die n≥10-Gate-Klasse) + 20 'none' — alles korrekt vorhergesagt. */
function perfectSet(): { cases: RelationsBaselineTruth[]; predictions: RelationsBaselinePrediction[] } {
  const cases: RelationsBaselineTruth[] = [];
  const predictions: RelationsBaselinePrediction[] = [];
  for (let i = 0; i < 10; i++) {
    cases.push(truth(`con-${i}`, 'CONCRETIZES', 'a-to-b'));
    predictions.push(pred(`con-${i}`, { relation: 'CONCRETIZES', direction: 'a-to-b' }));
  }
  for (let i = 0; i < 20; i++) {
    cases.push(truth(`none-${i}`, null));
    predictions.push(pred(`none-${i}`, { relation: null }));
  }
  return { cases, predictions };
}

describe('scoreRelationsBaseline() — (a) alles richtig', () => {
  it('Gesamt 1,0, none-Precision 1,0, CONCRETIZES-F1 1,0 → Verdikt ERFOLG', () => {
    const { cases, predictions } = perfectSet();
    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.totalCases).toBe(30);
    expect(r.scored).toBe(30);
    expect(r.correct).toBe(30);
    expect(r.overallAgreement).toBe(1);
    expect(r.none.precision).toBe(1);
    expect(r.none.recall).toBe(1);
    const con = r.types.find((t) => t.relationType === 'CONCRETIZES')!;
    expect(con.support).toBe(10);
    expect(con.thin).toBe(false);
    expect(con.gated).toBe(true);
    expect(con.f1).toBe(1);
    expect(r.directionErrors).toBe(0);
    expect(r.typeErrors).toBe(0);
    expect(r.metadataProposals).toBe(0);
    expect(r.mechanical.count).toBe(0);
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
    predictions[0] = pred('con-0', { relation: 'CONCRETIZES', direction: 'b-to-a' }); // Wahrheit: a-to-b

    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.correct).toBe(29);
    expect(r.overallAgreement).toBeCloseTo(29 / 30, 10);
    expect(r.directionErrors).toBe(1);
    expect(r.directionErrorCaseIds).toEqual(['con-0']);
    // Ein Richtungs-Fehler ist ein ANDERER Fehlertyp als ein falscher Typ.
    expect(r.typeErrors).toBe(0);
    // …und er schlägt trotzdem auf die Klassen-Metrik durch (Richtung ist Teil der Behauptung).
    const con = r.types.find((t) => t.relationType === 'CONCRETIZES')!;
    expect(con.tp).toBe(9);
    expect(con.fp).toBe(1);
    expect(con.fn).toBe(1);
  });
});

describe('scoreRelationsBaseline() — (c) dünne Klasse (n<10)', () => {
  it('wird ausgewiesen, aber nicht gegated — ein F1 von 0 kippt das Verdikt nicht', () => {
    const { cases, predictions } = perfectSet();
    // 3 IMPLEMENTS-Wahrheiten, alle falsch vorhergesagt (als SETS_PARAMETER).
    for (let i = 0; i < 3; i++) {
      cases.push(truth(`imp-${i}`, 'IMPLEMENTS', 'a-to-b'));
      predictions.push(pred(`imp-${i}`, { relation: 'SETS_PARAMETER', direction: 'a-to-b' }));
    }

    const r = scoreRelationsBaseline(cases, predictions);

    const imp = r.types.find((t) => t.relationType === 'IMPLEMENTS')!;
    expect(imp.support).toBe(3);
    expect(imp.support).toBeLessThan(BASELINE_GATE_MIN_SUPPORT);
    expect(imp.thin).toBe(true);
    expect(imp.gated).toBe(false);
    expect(imp.f1).toBe(0);
    // Auch die über-vorhergesagte Klasse ohne Gold-Support ist sichtbar, aber dünn.
    const setp = r.types.find((t) => t.relationType === 'SETS_PARAMETER')!;
    expect(setp.support).toBe(0);
    expect(setp.thin).toBe(true);
    expect(setp.gated).toBe(false);

    expect(r.typeErrors).toBe(3);
    expect(r.overallAgreement).toBeCloseTo(30 / 33, 10);
    expect(r.verdict.pass).toBe(true);
    expect(r.verdict.notGated).toContain('IMPLEMENTS');
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
    expect(r.types.find((t) => t.relationType === 'CONCRETIZES')!.f1).toBe(1);
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

describe('scoreRelationsBaseline() — (f) mechanische Klassen (THE-529)', () => {
  it('INTERPRETS-Wahrheiten verlassen Zähler UND Nenner und werden als mechanical ausgewiesen', () => {
    const { cases, predictions } = perfectSet();
    // 3 mechanische Wahrheiten OHNE Vorhersage — der Parser-Pfad, nicht das LLM,
    // ist für sie zuständig. Sie dürfen weder Messausfall noch F1-Klasse werden.
    cases.push(truth('int-0', 'INTERPRETS', 'b-to-a'));
    cases.push(truth('int-1', 'INTERPRETS', 'b-to-a'));
    cases.push(truth('int-2', 'INTERPRETS', 'a-to-b'));

    const r = scoreRelationsBaseline(cases, predictions);

    expect(r.mechanical.count).toBe(3);
    expect(r.mechanical.caseIds).toEqual(['int-0', 'int-1', 'int-2']);
    expect(r.totalCases).toBe(33);
    expect(r.scored).toBe(30); // Nenner ohne die mechanischen Fälle
    expect(r.measurementFailures).toBe(0); // fehlende LLM-Antwort ist hier KEIN Ausfall
    expect(r.types.find((t) => t.relationType === 'INTERPRETS')).toBeUndefined();
    // Die LLM-Messung (CONCRETIZES/none) bleibt unverändert.
    expect(r.overallAgreement).toBe(1);
    expect(r.none.precision).toBe(1);
    expect(r.types.find((t) => t.relationType === 'CONCRETIZES')!.f1).toBe(1);
    expect(r.verdict.pass).toBe(true);
  });

  it('der Report weist die mechanischen Fälle aus, statt sie in F1 zu rechnen', () => {
    const { cases, predictions } = perfectSet();
    cases.push(truth('int-0', 'INTERPRETS', 'b-to-a'));
    cases.push(truth('int-1', 'INTERPRETS', 'b-to-a'));

    const text = formatRelationsBaselineReport(scoreRelationsBaseline(cases, predictions));

    expect(text).toContain('mechanical (Parser-Pfad, THE-529): n=2 — nicht Teil der LLM-Messung');
    // INTERPRETS taucht in keiner Klassen-Metrik-Zeile auf.
    expect(text).not.toMatch(/INTERPRETS\s+n=/);
  });

  it('die Erfolgsregel gated INTERPRETS nicht mehr, sondern weist den Parser-Pfad aus', () => {
    expect(RELATIONS_BASELINE_SUCCESS_RULE).not.toContain('INTERPRETS-F1');
    expect(RELATIONS_BASELINE_SUCCESS_RULE).toMatch(/mechanisch/i);
    expect(RELATIONS_BASELINE_SUCCESS_RULE).toContain('THE-529');
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
  const goldenCase = (caseId: string, relation: string | null = null) => ({
    caseId,
    a: side('aaa:art-1'),
    b: side('bbb:art-1'),
    relation,
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
        text: '{"relation":"CONCRETIZES","direction":"b-to-a"}',
        inputTokens: 7,
        outputTokens: 3,
      }),
    };
    const res = await runRelationsBaseline([goldenCase('c1'), goldenCase('c2')], client);
    expect(res.predictions).toHaveLength(2);
    expect(res.predictions[0]).toMatchObject({ relation: 'CONCRETIZES', direction: 'b-to-a' });
    expect(res.inputTokens).toBe(14);
    expect(res.outputTokens).toBe(6);
  });

  it('THE-529: mechanische Fälle erreichen das LLM nicht (selectLlmCases + Spy)', async () => {
    const cases = [
      goldenCase('mech-1', 'INTERPRETS'),
      goldenCase('llm-1', 'CONCRETIZES'),
      goldenCase('llm-2', null),
    ];
    const llmCases = selectLlmCases(cases);
    expect(llmCases.map((c) => c.caseId)).toEqual(['llm-1', 'llm-2']);

    const complete = jest.fn(async () => ({
      text: '{"relation":"CONCRETIZES","direction":"a-to-b"}',
      inputTokens: 1,
      outputTokens: 1,
    }));
    const client = { provider: 'anthropic' as const, model: 'fake', complete };
    const res = await runRelationsBaseline(llmCases, client);

    // Genau die zwei LLM-Fälle wurden klassifiziert — der mechanische nie.
    expect(complete).toHaveBeenCalledTimes(2);
    expect(res.predictions.map((p) => p.caseId)).toEqual(['llm-1', 'llm-2']);
  });
});
