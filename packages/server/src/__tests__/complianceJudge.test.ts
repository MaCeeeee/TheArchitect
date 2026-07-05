/**
 * Kaskaden-Judge Tests (THE-401 S2 / THE-382) — Extraktion, Sanitizing,
 * Filter-Policy, Judge-Qualitäts-Metriken, LLM-Roundtrip mit Fake-Client.
 *
 * Run: cd packages/server && npx jest src/__tests__/complianceJudge.test.ts
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  extractJudgeJson,
  sanitizeJudgeResponse,
  applyJudgeVerdicts,
  judgeMappings,
  ComplianceJudgeError,
  type JudgeResponse,
} from '../services/complianceJudge.service';
import { judgeQualityForCase } from '../evals/runJudgeEval';

const resp = (over: Partial<JudgeResponse> = {}): JudgeResponse => ({
  verdicts: [],
  missed: [],
  emptyJustified: false,
  ...over,
});

describe('extractJudgeJson()', () => {
  it('parses plain and fenced JSON', () => {
    expect(extractJudgeJson('{"verdicts":[]}')).toEqual({ verdicts: [] });
    expect(extractJudgeJson('bla\n```json\n{"a":1}\n```\nblub')).toEqual({ a: 1 });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJudgeJson('no json here')).toThrow(ComplianceJudgeError);
  });
});

describe('sanitizeJudgeResponse()', () => {
  const proposals = ['a', 'b'];
  const candidates = ['a', 'b', 'c', 'd'];

  it('drops hallucinated verdict ids and duplicate verdicts (first wins)', () => {
    const s = sanitizeJudgeResponse(
      resp({
        verdicts: [
          { elementId: 'a', verdict: 'required', reason: 'r1' },
          { elementId: 'a', verdict: 'incorrect', reason: 'dup' },
          { elementId: 'ghost', verdict: 'required', reason: 'hallucinated' },
          { elementId: 'b', verdict: 'superfluous', reason: 'r2' },
        ],
      }),
      proposals,
      candidates
    );
    expect(s.verdicts.map(v => `${v.elementId}:${v.verdict}`)).toEqual(['a:required', 'b:superfluous']);
  });

  it('fills omitted proposals with uncertain (Auslassung ≠ Löschung)', () => {
    const s = sanitizeJudgeResponse(
      resp({ verdicts: [{ elementId: 'a', verdict: 'incorrect', reason: 'x' }] }),
      proposals,
      candidates
    );
    const b = s.verdicts.find(v => v.elementId === 'b')!;
    expect(b.verdict).toBe('uncertain');
  });

  it('keeps missed only for non-proposed, existing candidates', () => {
    const s = sanitizeJudgeResponse(
      resp({
        missed: [
          { elementId: 'c', reason: 'ok' },
          { elementId: 'a', reason: 'already proposed' },
          { elementId: 'ghost', reason: 'invented' },
          { elementId: 'c', reason: 'dup' },
        ],
      }),
      proposals,
      candidates
    );
    expect(s.missed.map(m => m.elementId)).toEqual(['c']);
  });
});

describe('applyJudgeVerdicts() — die Filter-Policy', () => {
  it('keeps required+uncertain, removes incorrect+superfluous, adds missed', () => {
    const judge = resp({
      verdicts: [
        { elementId: 'a', verdict: 'required', reason: '' },
        { elementId: 'b', verdict: 'incorrect', reason: '' },
        { elementId: 'c', verdict: 'superfluous', reason: '' },
        { elementId: 'd', verdict: 'uncertain', reason: '' },
      ],
      missed: [{ elementId: 'e', reason: '' }],
    });
    const r = applyJudgeVerdicts(['a', 'b', 'c', 'd'], judge);
    expect(r.kept).toEqual(['a', 'd']);
    expect(r.removed).toEqual(['b', 'c']);
    expect(r.added).toEqual(['e']);
  });

  it('treats proposals without verdict as uncertain (kept)', () => {
    const r = applyJudgeVerdicts(['x'], resp());
    expect(r.kept).toEqual(['x']);
  });
});

describe('judgeQualityForCase()', () => {
  it('splits kills into FP-kill (good) and TP-kill (damage) and scores the sweep', () => {
    // gold = {a, e}; proposals = {a (TP), b (FP), c (FP)}; e nicht vorgeschlagen
    const judge = resp({
      verdicts: [
        { elementId: 'a', verdict: 'incorrect', reason: 'DAMAGE' },
        { elementId: 'b', verdict: 'superfluous', reason: 'good kill' },
        { elementId: 'c', verdict: 'required', reason: 'missed FP' },
      ],
      missed: [
        { elementId: 'e', reason: 'recovered' },
        { elementId: 'f', reason: 'false add' },
      ],
    });
    const q = judgeQualityForCase(['a', 'e'], ['a', 'b', 'c'], judge);
    expect(q).toEqual({
      proposalTp: 1,
      proposalFp: 2,
      fpKilled: 1,
      tpKilled: 1,
      goldMissedBefore: 1,
      missedRecovered: 1,
      falseAdds: 1,
    });
  });
});

describe('judgeMappings() — Roundtrip mit Fake-Client', () => {
  const fakeClient = (text: string): Anthropic =>
    ({
      messages: {
        create: async () => ({
          content: [{ type: 'text', text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    }) as unknown as Anthropic;

  const baseArgs = {
    requirementTitle: 'Erase personal data',
    requirementText: 'Each system holding personal data must support deletion.',
    source: 'dsgvo',
    paragraphNumber: 'Art. 17',
    candidates: [
      { id: 'db', name: 'DB', type: 'data_object', description: 'holds account' },
      { id: 'wiki', name: 'Wiki', type: 'application' },
    ],
    proposals: [{ elementId: 'db', confidence: 0.9, reasoning: 'stores accounts' }],
  };

  it('parses, sanitizes and returns meta', async () => {
    const res = await judgeMappings({
      ...baseArgs,
      anthropicClient: fakeClient(
        JSON.stringify({
          verdicts: [{ elementId: 'db', verdict: 'required', reason: 'holds account:doc → must erase' }],
          missed: [{ elementId: 'wiki', reason: 'sweep says so' }],
          emptyJustified: false,
        })
      ),
    });
    expect(res.verdicts).toEqual([
      { elementId: 'db', verdict: 'required', reason: 'holds account:doc → must erase' },
    ]);
    expect(res.missed.map(m => m.elementId)).toEqual(['wiki']);
    expect(res.meta.inputTokens).toBe(100);
  });

  it('rejects schema-invalid judge output with a clear error', async () => {
    await expect(
      judgeMappings({
        ...baseArgs,
        anthropicClient: fakeClient('{"verdicts":[{"elementId":"db","verdict":"maybe","reason":"x"}]}'),
      })
    ).rejects.toThrow(/schema validation/);
  });
});
