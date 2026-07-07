/**
 * runMappingEval CLI/Report-Helfer Tests — S1 Multi-Modell-Eval (THE-401)
 *
 * Testet nur die exportierten PURE Funktionen des Runners (kein LLM, kein I/O):
 * Modell-Aliase, --models-Parsing, Cache-Bucket-Trennung, Verteilungs-Format,
 * Vergleichstabelle. Der Import darf main() NICHT triggern (require.main-Guard).
 *
 * Run: cd packages/server && npx jest src/__tests__/evalRunnerCli.test.ts
 */
import {
  MODEL_ALIASES,
  resolveModel,
  parseModelsArg,
  cacheBucketFor,
  formatDistribution,
  buildComparisonTable,
} from '../evals/runMappingEval';
import type { CaseOutcome } from '../evals/metrics';

function outcome(
  caseId: string,
  gold: string[],
  predicted: Array<[string, number]>,
  source = 'dsgvo'
): CaseOutcome {
  return {
    caseId,
    source,
    goldElementIds: gold,
    predicted: predicted.map(([elementId, confidence]) => ({ elementId, confidence })),
  };
}

describe('resolveModel() / parseModelsArg()', () => {
  it('maps aliases case-insensitively and passes full IDs through', () => {
    expect(resolveModel('haiku')).toBe(MODEL_ALIASES.haiku);
    expect(resolveModel('SONNET')).toBe(MODEL_ALIASES.sonnet);
    expect(resolveModel('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(resolveModel('some-future-model')).toBe('some-future-model');
  });

  it('splits, trims, resolves and dedupes --models values', () => {
    expect(parseModelsArg('haiku, sonnet')).toEqual([
      MODEL_ALIASES.haiku,
      MODEL_ALIASES.sonnet,
    ]);
    // Alias + volle ID desselben Modells → EIN Eintrag
    expect(parseModelsArg(`haiku,${MODEL_ALIASES.haiku}`)).toEqual([MODEL_ALIASES.haiku]);
    // leere Segmente verschwinden
    expect(parseModelsArg('haiku,,')).toEqual([MODEL_ALIASES.haiku]);
  });
});

describe('cacheBucketFor()', () => {
  it('separates buckets per model under the set version', () => {
    const a = cacheBucketFor('v1-draft', MODEL_ALIASES.haiku);
    const b = cacheBucketFor('v1-draft', MODEL_ALIASES.sonnet);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1-draft')).toBe(true);
    expect(a).toContain(MODEL_ALIASES.haiku);
  });

  it('sanitizes path-hostile characters in model names', () => {
    const bucket = cacheBucketFor('v1', 'weird/model:name');
    expect(bucket).not.toContain('/model');
    expect(bucket).not.toContain(':');
  });
});

describe('formatDistribution()', () => {
  it('sorts numerically with the cap bucket last', () => {
    expect(formatDistribution({ '10': 1, '2': 3, '0': 2, '5+': 4 })).toBe(
      '0: 2 · 2: 3 · 10: 1 · 5+: 4'
    );
  });

  it('renders an em dash for an empty distribution', () => {
    expect(formatDistribution({})).toBe('—');
  });
});

describe('buildComparisonTable()', () => {
  it('renders one row per model with correctness AND conciseness columns', () => {
    const haikuRun = {
      model: 'claude-haiku-4-5-20251001',
      cacheHits: 0,
      // Recall 1.0, aber über-eifrig: 3 Vorhersagen auf 1 Gold + Hard Negative getroffen
      outcomes: [
        outcome('c1', ['a'], [['a', 0.9], ['x', 0.6], ['y', 0.55]]),
        outcome('neg', [], [['z', 0.7]]),
      ],
    };
    const sonnetRun = {
      model: 'claude-sonnet-5',
      cacheHits: 2,
      // sparsam und korrekt
      outcomes: [outcome('c1', ['a'], [['a', 0.95]]), outcome('neg', [], [])],
    };

    const table = buildComparisonTable([haikuRun, sonnetRun], 5);

    expect(table).toContain('`claude-haiku-4-5-20251001`');
    expect(table).toContain('`claude-sonnet-5`');
    // Header enthält beide Achsen
    expect(table).toContain('Recall');
    expect(table).toContain('OMR');
    expect(table).toContain('Empty-Set');
    // Sonnet-Zeile: Recall perfekt; OMR = (1+0)/(1+1) = 0.50, weil der saubere
    // Hard Negative per Design mit Nenner 1 und Zähler 0 eingeht
    const sonnetRow = table.split('\n').find(l => l.includes('claude-sonnet-5'))!;
    expect(sonnetRow).toContain('100.0%'); // Recall
    expect(sonnetRow).toContain('0.50'); // OMR
    // Haiku-Zeile: OMR (3+1)/(1+1) = 2.00, Empty-Set 0%
    const haikuRow = table.split('\n').find(l => l.includes('claude-haiku'))!;
    expect(haikuRow).toContain('2.00');
    expect(haikuRow).toContain('0.0%');
    // Anti-Goodhart-Leseregel steht drin
    expect(table).toContain('Anti-Goodhart');
  });
});
