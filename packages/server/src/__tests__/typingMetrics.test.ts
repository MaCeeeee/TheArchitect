/**
 * Typing-Eval-Metriken — THE-430 Slice 1 Phase 3 (reine Funktionen, kein LLM).
 *
 * Run: cd packages/server && npx jest src/__tests__/typingMetrics.test.ts
 */
import {
  axisAccuracy,
  axisConfusion,
  breakdownByKey,
  axisCalibration,
  buildTypingReport,
  type TypingEvalCase,
} from '../evals/typingMetrics';
import { TYPING_AXES } from '../evals/typingGolden';

const mk = (over: Partial<TypingEvalCase>): TypingEvalCase => ({
  caseId: 'c',
  source: 'dsgvo',
  language: 'de',
  gold: {},
  predicted: {},
  ...over,
});

describe('axisAccuracy', () => {
  it('zählt nur gelabelte Gold-Achsen; null===null korrekt', () => {
    const cases = [
      mk({ gold: { obligationKind: 'obligation' }, predicted: { obligationKind: 'obligation' } }), // ✓
      mk({ gold: { obligationKind: 'prohibition' }, predicted: { obligationKind: 'obligation' } }), // ✗
      mk({ gold: { obligationKind: null }, predicted: { obligationKind: null } }), // ✓ (n/a korrekt)
      mk({ gold: {}, predicted: { obligationKind: 'obligation' } }), // ungelabelt → aus
    ];
    const a = axisAccuracy(cases, 'obligationKind');
    expect(a.labeled).toBe(3);
    expect(a.correct).toBe(2);
    expect(a.accuracy).toBeCloseTo(2 / 3, 6);
  });

  it('predicted undefined zählt als falsch (nicht ausgeschlossen)', () => {
    const a = axisAccuracy([mk({ gold: { normKind: 'legislation' }, predicted: {} })], 'normKind');
    expect(a.labeled).toBe(1);
    expect(a.correct).toBe(0);
  });
});

describe('axisConfusion', () => {
  it('per-Klassen P/R/F1 + macro-F1', () => {
    // obligation: 2 gold, beide korrekt → P=R=F1=1
    // prohibition: 1 gold, als obligation vorhergesagt → recall 0
    const cases = [
      mk({ gold: { obligationKind: 'obligation' }, predicted: { obligationKind: 'obligation' } }),
      mk({ gold: { obligationKind: 'obligation' }, predicted: { obligationKind: 'obligation' } }),
      mk({ gold: { obligationKind: 'prohibition' }, predicted: { obligationKind: 'obligation' } }),
    ];
    const conf = axisConfusion(cases, 'obligationKind');
    const oblig = conf.classes.find((c) => c.cls === 'obligation')!;
    const prohib = conf.classes.find((c) => c.cls === 'prohibition')!;
    expect(oblig.tp).toBe(2);
    expect(oblig.fp).toBe(1); // die prohibition-Fehlvorhersage
    expect(oblig.recall).toBe(1);
    expect(prohib.recall).toBe(0);
    expect(prohib.support).toBe(1);
    // macroF1 = (F1_obligation + F1_prohibition)/2
    expect(conf.macroF1).toBeCloseTo((oblig.f1 + prohib.f1) / 2, 6);
  });

  it('null-Gold bildet die __na__-Klasse', () => {
    const conf = axisConfusion(
      [mk({ gold: { obligationKind: null }, predicted: { obligationKind: null } })],
      'obligationKind'
    );
    expect(conf.classes.map((c) => c.cls)).toContain('__na__');
    expect(conf.classes[0].f1).toBe(1);
  });
});

describe('breakdownByKey', () => {
  it('splittet Accuracy nach Sprache', () => {
    const cases = [
      mk({ language: 'de', gold: { normKind: 'legislation' }, predicted: { normKind: 'legislation' } }),
      mk({ language: 'en', gold: { normKind: 'legislation' }, predicted: { normKind: 'guideline' } }),
    ];
    const bl = breakdownByKey(cases, (c) => c.language, 'normKind');
    expect(bl.de.accuracy).toBe(1);
    expect(bl.en.accuracy).toBe(0);
  });

  it('ignoriert Cases mit undefined-Key (z. B. fehlendes Band)', () => {
    const cases = [
      mk({ complexityBand: 'high', gold: { normKind: 'legislation' }, predicted: { normKind: 'legislation' } }),
      mk({ complexityBand: undefined, gold: { normKind: 'legislation' }, predicted: { normKind: 'legislation' } }),
    ];
    const bb = breakdownByKey(cases, (c) => c.complexityBand, 'normKind');
    expect(Object.keys(bb)).toEqual(['high']);
  });
});

describe('axisCalibration', () => {
  it('ohne Confidence → null', () => {
    expect(axisCalibration([mk({ gold: { normKind: 'legislation' } })], 'normKind')).toBeNull();
  });

  it('mit Confidence → ECE-Report', () => {
    const cases = Array.from({ length: 20 }, (_, i) =>
      mk({
        gold: { normKind: 'legislation' },
        predicted: { normKind: i < 10 ? 'legislation' : 'guideline' },
        confidence: { normKind: 0.99 },
      })
    );
    const cal = axisCalibration(cases, 'normKind');
    expect(cal).not.toBeNull();
    expect(cal!.ece).toBeGreaterThan(0.4); // 99% conf, 50% korrekt → mis-kalibriert
  });
});

describe('buildTypingReport', () => {
  it('assembliert alle 4 Achsen mit Breakdowns', () => {
    const cases = [
      mk({
        source: 'dsgvo',
        language: 'de',
        complexityBand: 'moderate',
        gold: { normKind: 'legislation', obligationKind: 'obligation', partyRole: 'controller' },
        predicted: { normKind: 'legislation', obligationKind: 'obligation', partyRole: 'controller' },
      }),
    ];
    const r = buildTypingReport(cases);
    expect(r.total).toBe(1);
    expect(Object.keys(r.axes).sort()).toEqual([...TYPING_AXES].sort());
    expect(r.axes.normKind.accuracy.accuracy).toBe(1);
    expect(r.axes.normKind.byComplexityBand.moderate.accuracy).toBe(1);
    // bindingness war nie gelabelt → labeled 0
    expect(r.axes.bindingness.accuracy.labeled).toBe(0);
  });

  it('buildTypingReport covers all five axes without any change to typingMetrics.ts', () => {
    const cases = [
      mk({
        gold: { provisionKind: 'obligation' },
        predicted: { provisionKind: 'obligation' }, // ✓
      }),
      mk({
        gold: { provisionKind: 'scope-applicability' },
        predicted: { provisionKind: 'obligation' }, // ✗
      }),
    ];
    const r = buildTypingReport(cases);
    expect(Object.keys(r.axes).sort()).toEqual([...TYPING_AXES].sort());
    expect(r.axes.provisionKind).toBeDefined();
    // die fünfte Achse misst tatsächlich: eine korrekte Vorhersage zählt, eine falsche nicht
    expect(r.axes.provisionKind.accuracy.correct).toBe(1);
    expect(r.axes.provisionKind.accuracy.labeled).toBe(2);
  });
});

/**
 * THE-668 — die Beobachtungs-Zählung im Report.
 *
 * AC-5 verlangt, dass der Kanal schweigt, wo eine Rolle passt. Ohne diese
 * Zählung wäre das Kriterium nur behauptet: Der Report muss trennen, ob eine
 * Beobachtung dort fiel, wo das GOLD eine Rolle kennt (Rauschen), oder dort,
 * wo es keine kennt (der gewollte Fall).
 */
describe('buildTypingReport — Beobachtungskanal (THE-668)', () => {
  it('zählt Beobachtungen getrennt nach Gold-Lage', () => {
    const cases = [
      // gewollt: Gold sagt na, Modell beobachtet einen Akteur
      mk({ gold: { partyRole: null }, predicted: { partyRole: null }, partyRoleObserved: 'Normungsorganisation' }),
      // Rauschen: Gold kennt eine Rolle, Modell beobachtet trotzdem
      mk({ gold: { partyRole: 'controller' }, predicted: { partyRole: null }, partyRoleObserved: 'Verantwortlicher' }),
      // still: keine Beobachtung
      mk({ gold: { partyRole: 'controller' }, predicted: { partyRole: 'controller' } }),
      // Gold-Achse ungelabelt + Beobachtung → zählt als na-Seite (kein Gold-Widerspruch)
      mk({ gold: {}, predicted: {}, partyRoleObserved: 'AI Office' }),
    ];
    const r = buildTypingReport(cases);
    expect(r.observed).toEqual({ total: 3, whereGoldNa: 2, whereGoldHasRole: 1 });
  });

  it('ohne jede Beobachtung ist der Block null-frei vorhanden — 0 heißt gemessen, nicht vergessen', () => {
    const r = buildTypingReport([mk({ gold: { partyRole: 'controller' }, predicted: { partyRole: 'controller' } })]);
    expect(r.observed).toEqual({ total: 0, whereGoldNa: 0, whereGoldHasRole: 0 });
  });
});
