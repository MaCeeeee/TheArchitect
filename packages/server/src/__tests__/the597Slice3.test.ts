/**
 * THE-597 Slice 3 — Go/No-Go nach der Vorregistrierung vom 17.11.2026.
 * Reine Logik, kein LLM. Run: cd packages/server && npx jest src/__tests__/the597Slice3.test.ts
 */
import {
  parseRun,
  SLICE3_GOLDEN_SHA256,
  SLICE3_INSTRUMENT,
  type GoldenId,
} from '../evals/the597Slice3';
import type { TypingEvalCase } from '../evals/typingMetrics';

/** Ein Fall: Gold und Vorhersage je Achse, Konfidenz je Achse. */
export function mkCase(
  id: string,
  gold: Record<string, string | null>,
  predicted: Record<string, string | null>,
  confidence: Record<string, number>
): TypingEvalCase {
  return { caseId: id, source: 's', language: 'en', gold, predicted, confidence } as unknown as TypingEvalCase;
}

export function runJson(golden: GoldenId, cases: TypingEvalCase[], over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    variante: SLICE3_INSTRUMENT.variante,
    model: SLICE3_INSTRUMENT.model,
    samples: SLICE3_INSTRUMENT.samples,
    the597: { goldenSha256: SLICE3_GOLDEN_SHA256[golden] },
    cases,
    ...over,
  });
}

/** 70 gültige Fälle mit eindeutigen caseIds — so groß wie gv3/gv2. */
const one = Array.from({ length: 70 }, (_, i) =>
  mkCase(`c${i}`, { obligationKind: 'obligation' }, { obligationKind: 'obligation' }, { obligationKind: 1 })
);

describe('parseRun', () => {
  it('nimmt einen Lauf mit vorregistriertem Instrument an und hasht die Datei', () => {
    const raw = runJson('gv3', one);
    const run = parseRun('gv3-run1', 'gv3', raw);
    expect(run.label).toBe('gv3-run1');
    expect(run.golden).toBe('gv3');
    expect(run.cases).toHaveLength(70);
    expect(run.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['model', { model: 'claude-sonnet-x' }],
    ['samples', { samples: 1 }],
    ['variante', { variante: 'tp-3' }],
    ['goldenSha256', { the597: { goldenSha256: 'abc' } }],
    ['cases', { cases: [] }],
  ])('lehnt einen Lauf mit abweichendem %s ab', (feld, over) => {
    expect(() => parseRun('x', 'gv3', runJson('gv3', one, over))).toThrow(new RegExp(String(feld)));
  });

  it('lehnt 69 Fälle und doppelte caseIds ab', () => {
    expect(() => parseRun('x', 'gv3', runJson('gv3', one.slice(1)))).toThrow(/cases=69 statt 70/);
    const dup = [...one.slice(1), one[1]];
    expect(() => parseRun('x', 'gv3', runJson('gv3', dup))).toThrow(/caseId doppelt/);
  });

  it('lehnt einen gv3-Lauf ab, der als gv2 deklariert wird (Golden-Hash passt nicht)', () => {
    expect(() => parseRun('x', 'gv2', runJson('gv3', one))).toThrow(/goldenSha256/);
  });
});
