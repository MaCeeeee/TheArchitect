/**
 * runTypingEval — THE-430 Slice 1 Phase 3. Eval-Kern (Stub-Classifier, kein LLM)
 * + Markdown-Report gegen das Fixture-Golden.
 *
 * Run: cd packages/server && npx jest src/__tests__/runTypingEval.test.ts
 */
import path from 'node:path';
import { evaluateTyping, renderTypingReportMarkdown, type Classify } from '../evals/runTypingEval';
import { loadTypingGolden } from '../evals/typingGolden';

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
