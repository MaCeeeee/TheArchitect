/**
 * lawJudge.service Tests — UC-LAW-002 Slice-2 (THE-462).
 *
 * Struktur 1:1 gespiegelt von complianceJudge.service: injizierbarer
 * Anthropic-Client (kein Netz), Schema-Validierung, Anti-Halluzination,
 * in-process Cache, AiTrace-Aufruf (gemockt).
 *
 * Run: cd packages/server && npx jest src/__tests__/lawJudge.service.test.ts --verbose
 */
const mockTrace = jest.fn();
jest.mock('../services/aiTrace.service', () => ({ recordAiTrace: (...a: unknown[]) => mockTrace(...a) }));

import { judgeCandidate, __resetJudgeCache } from '../services/lawJudge.service';

// Fake Anthropic client: gibt tool_use mit kontrollierbarem input zurück.
function fakeClient(input: unknown) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'submit_law_verdicts', input }], usage: { input_tokens: 10, output_tokens: 20 } }) } } as never;
}
const profileElements = [{ id: 'e1', name: 'Auth', layer: 'application' }];
const candidate = { family: 'ai-act', sources: ['ai-act-en'], jurisdiction: 'EU', topHits: [{ regulationKey: 'ai-act-en:5', title: 'Art 5' }], retrievalScore: 0.8 };

describe('judgeCandidate', () => {
  beforeEach(() => { jest.clearAllMocks(); __resetJudgeCache(); });

  it('validiert Schema + tract', async () => {
    const client = fakeClient({ family: 'ai-act', applies: true, confidence: 0.9, reasoning: 'AI system', elementIds: ['e1'], keyParagraphs: ['ai-act-en:5'] });
    const v = await judgeCandidate({ profileText: 'p', profileElements, candidate, projectId: 'p1', corpusVersionHash: 'H', anthropicClient: client });
    expect(v.applies).toBe(true);
    expect(v.confidence).toBe(0.9);
    expect(mockTrace).toHaveBeenCalledTimes(1);
  });

  it('Anti-Halluzination: erfundene elementIds/family werden verworfen', async () => {
    const client = fakeClient({ family: 'GHOST-LAW', applies: true, confidence: 0.9, reasoning: 'x', elementIds: ['e1', 'GHOST'], keyParagraphs: [] });
    const v = await judgeCandidate({ profileText: 'p', profileElements, candidate, projectId: 'p1', corpusVersionHash: 'H', anthropicClient: client });
    expect(v.family).toBe('ai-act');           // family wird auf den Kandidaten fixiert
    expect(v.elementIds).toEqual(['e1']);      // GHOST verworfen
  });

  it('Cache: zweiter Call mit gleichem (profile,family,corpusVersion) macht 0 LLM-Calls', async () => {
    const create = jest.fn(async () => ({ content: [{ type: 'tool_use', name: 'submit_law_verdicts', input: { family: 'ai-act', applies: true, confidence: 0.7, reasoning: 'x', elementIds: [], keyParagraphs: [] } }], usage: {} }));
    const client = { messages: { create } } as never;
    const args = { profileText: 'p', profileElements, candidate, projectId: 'p1', corpusVersionHash: 'H', anthropicClient: client };
    await judgeCandidate(args); await judgeCandidate(args);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
