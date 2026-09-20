/**
 * runTypingEval — THE-430 Slice 1 Phase 3. Eval-Kern (Stub-Classifier, kein LLM)
 * + Markdown-Report gegen das Fixture-Golden.
 *
 * Run: cd packages/server && npx jest src/__tests__/runTypingEval.test.ts
 */
import path from 'node:path';
import { evaluateTyping, renderTypingReportMarkdown, type Classify, aggregateVotes, withSelfConsistency, type Classification, renderThe597Section } from '../evals/runTypingEval';
import { loadTypingGolden } from '../evals/typingGolden';
import type { TypingEvalCase } from '../evals/typingMetrics';

const FIXTURE = path.join(__dirname, '..', 'evals', 'golden', 'typing.fixture.json');

describe('evaluateTyping (Fixture, Stub-Classifier)', () => {
  const golden = loadTypingGolden(FIXTURE);

  it('perfekter Classifier (echoed gold) → Accuracy 100% je gelabelter Achse', async () => {
    const perfect: Classify = async (c) => ({ labels: c.labels });
    const report = await evaluateTyping({ golden, classify: perfect });
    expect(report.total).toBe(4);
    expect(report.axes.normKind.accuracy.accuracy).toBe(1);
    expect(report.axes.obligationKind.accuracy.accuracy).toBe(1);
    // partyRole: nur 2 der 4 Cases gelabelt (2× null zählt als gelabelt) → labeled 4
    expect(report.axes.partyRole.accuracy.labeled).toBe(4);
  });

  it('konstant-falscher Classifier → niedrige Accuracy + Sprach-Breakdown', async () => {
    const wrong: Classify = async () => ({ labels: { normKind: 'guideline' } });
    const report = await evaluateTyping({ golden, classify: wrong });
    expect(report.axes.normKind.accuracy.accuracy).toBe(0); // alle gold=legislation
    expect(report.axes.normKind.byLanguage.de.labeled).toBe(2);
    expect(report.axes.normKind.byLanguage.en.labeled).toBe(2);
  });

  it('bandOf-Injektion landet im Breakdown', async () => {
    const perfect: Classify = async (c) => ({ labels: c.labels });
    const report = await evaluateTyping({
      golden,
      classify: perfect,
      bandOf: (c) => (c.source === 'nis2' ? 'high' : 'moderate'),
    });
    expect(report.axes.normKind.byComplexityBand.high.labeled).toBe(2);
    expect(report.axes.normKind.byComplexityBand.moderate.labeled).toBe(2);
  });

  it('Confidence-Injektion aktiviert die Kalibrierung', async () => {
    const withConf: Classify = async (c) => ({ labels: c.labels, confidence: { normKind: 0.9 } });
    const report = await evaluateTyping({ golden, classify: withConf });
    expect(report.axes.normKind.calibration).not.toBeNull();
  });
});

describe('renderTypingReportMarkdown', () => {
  it('rendert Achsen-Sektionen + Breakdown-Tabellen', async () => {
    const golden = loadTypingGolden(FIXTURE);
    const report = await evaluateTyping({ golden, classify: async (c) => ({ labels: c.labels }) });
    const md = renderTypingReportMarkdown(report, { golden: 'typing.fixture.json', model: 'test' });
    expect(md).toContain('# Typing-Eval Report');
    expect(md).toContain('## normKind');
    expect(md).toContain('## obligationKind');
    expect(md).toContain('Leakage-Caveat');
    expect(md).toContain('source: dsgvo');
    expect(md).toContain('| Klasse | P | R | F1 | support |');
  });
});

describe('aggregateVotes (THE-597 Self-Consistency)', () => {
  const run = (labels: Classification['labels'], partyRoleObserved?: string): Classification => ({ labels, partyRoleObserved });

  it('Mehrheit je Achse, Konfidenz = Stimmen/k', () => {
    const out = aggregateVotes([
      run({ partyRole: 'controller', provisionKind: 'obligation' }),
      run({ partyRole: 'controller', provisionKind: 'obligation' }),
      run({ partyRole: 'processor', provisionKind: 'obligation' }),
      run({ partyRole: 'controller', provisionKind: 'procedural' }),
      run({ partyRole: 'controller', provisionKind: 'obligation' }),
    ]);
    expect(out.labels.partyRole).toBe('controller');
    expect(out.confidence?.partyRole).toBeCloseTo(0.8);
    expect(out.labels.provisionKind).toBe('obligation');
    expect(out.confidence?.provisionKind).toBeCloseTo(0.8);
  });

  it('null ist eine Stimme („nicht anwendbar"); offene Läufe drücken die Konfidenz', () => {
    const out = aggregateVotes([run({ partyRole: null }), run({ partyRole: null }), run({}), run({ partyRole: 'controller' })]);
    expect(out.labels.partyRole).toBeNull();
    expect(out.confidence?.partyRole).toBeCloseTo(0.5); // 2 von 4 Läufen
  });

  it('in allen Läufen offen → Achse bleibt offen, keine Konfidenz', () => {
    const out = aggregateVotes([run({}), run({})]);
    expect(out.labels.partyRole).toBeUndefined();
    expect(out.confidence?.partyRole).toBeUndefined();
  });

  it('Tie ist deterministisch (Label-String aufsteigend)', () => {
    const a = aggregateVotes([run({ partyRole: 'processor' }), run({ partyRole: 'controller' })]);
    const b = aggregateVotes([run({ partyRole: 'controller' }), run({ partyRole: 'processor' })]);
    expect(a.labels.partyRole).toBe('controller');
    expect(b.labels.partyRole).toBe('controller');
    expect(a.confidence?.partyRole).toBeCloseTo(0.5);
  });

  it('Tie zwischen null und einer id → null gewinnt (Enthaltung), Konfidenz 0.5', () => {
    const a = aggregateVotes([run({ partyRole: 'controller' }), run({ partyRole: null })]);
    const b = aggregateVotes([run({ partyRole: null }), run({ partyRole: 'supervisory_authority' })]);
    expect(a.labels.partyRole).toBeNull();
    expect(b.labels.partyRole).toBeNull();
    expect(a.confidence?.partyRole).toBeCloseTo(0.5);
  });

  it('leere Eingabe → nur leere Labels', () => {
    expect(aggregateVotes([])).toEqual({ labels: {} });
  });

  it('partyRoleObserved: nur bei Mehrheit über alle Läufe', () => {
    const majority = aggregateVotes([run({}, 'Betreiber'), run({}, 'Anbieter'), run({}, 'Betreiber')]);
    expect(majority.partyRoleObserved).toBe('Betreiber');

    const noMajority = aggregateVotes([run({}, 'Betreiber'), run({}), run({}), run({})]);
    expect(noMajority.partyRoleObserved).toBeUndefined();
  });
});

describe('withSelfConsistency (THE-597)', () => {
  const golden = loadTypingGolden(FIXTURE);

  it('ruft den inneren Classifier genau k-mal je Fall und aggregiert', async () => {
    let calls = 0;
    const seq = ['controller', 'controller', 'processor'];
    const inner: Classify = async () => ({ labels: { partyRole: seq[calls++] } });
    const wrapped = withSelfConsistency(inner, 3);
    const out = await wrapped(golden.cases[0]);
    expect(calls).toBe(3);
    expect(out.labels.partyRole).toBe('controller');
    expect(out.confidence?.partyRole).toBeCloseTo(2 / 3);
  });

  it('k < 2 → der innere Classifier selbst', async () => {
    const inner: Classify = async (c) => ({ labels: c.labels });
    expect(withSelfConsistency(inner, 1)).toBe(inner);

    const innerWithConfidence: Classify = async () => ({
      labels: { partyRole: 'controller' },
      confidence: { partyRole: 0.42 },
    });
    const out = await withSelfConsistency(innerWithConfidence, 1)(golden.cases[0]);
    expect(out.confidence?.partyRole).toBe(0.42);
  });

  it('Mehrheit über k=3 Läufe: Gold gewinnt, Konfidenz 2/3 landet in der Kalibrierung', async () => {
    let i = 0;
    const flaky: Classify = async (c) => ({ labels: i++ % 3 === 2 ? { ...c.labels, normKind: 'guideline' } : c.labels });
    const report = await evaluateTyping({ golden, classify: withSelfConsistency(flaky, 3) });
    expect(report.axes.normKind.accuracy.accuracy).toBe(1);
    expect(report.axes.normKind.calibration?.samples).toBe(4);
  });
});

describe('renderThe597Section (rein)', () => {
  it('schreibt je Inhalts-Achse AUROC und Routing bei 0.6/0.8/1.0; Akt-Metadaten markiert', () => {
    const c = (id: string, gold: string | null, pred: string | null, conf: number): TypingEvalCase => ({
      caseId: id, source: 's', language: 'de', gold: { partyRole: gold }, predicted: { partyRole: pred }, confidence: { partyRole: conf },
    });
    const cases = [c('a', 'controller', 'controller', 1.0), c('b', 'controller', 'processor', 0.4), c('c', 'processor', 'processor', 0.8)];
    const { markdown, json } = renderThe597Section(cases, 5, 'deadbeef');
    expect(markdown).toContain('## THE-597 — Schicht 1 retrospektiv (Self-Consistency k=5)');
    expect(markdown).toContain('| partyRole |');
    expect(json.k).toBe(5);
    expect(json.goldenSha256).toBe('deadbeef');
    expect(json.axes.partyRole.samples).toBe(3);
    expect(json.axes.partyRole.auroc).toBe(1);
    expect(json.axes.partyRole.routing.map((r) => r.threshold)).toEqual([0.6, 0.8, 1.0]);
    expect(json.axes.partyRole.routing[0]).toMatchObject({ caught: 1, wrong: 1, falseAlarms: 0 });
    expect(json.axes.normKind.samples).toBe(0);
    expect(json.axes.normKind.auroc).toBeNull();
    expect(json.axes.normKind.aktMetadatum).toBe(true);
  });
});
