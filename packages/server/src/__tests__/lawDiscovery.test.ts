const mockProfile = jest.fn();
const mockSearch = jest.fn();
const mockConfigured = jest.fn();
jest.mock('../services/useCaseProfile.service', () => ({ buildUseCaseProfile: (...a: unknown[]) => mockProfile(...a) }));
jest.mock('../services/governedRetrieval.service', () => ({ governedCorpusSearch: (...a: unknown[]) => mockSearch(...a) }));
jest.mock('../services/corpusClient.service', () => ({ isCorpusConfigured: () => mockConfigured() }));

import { discoverCandidates, gateCandidatesForJudge } from '../services/lawDiscovery.service';
import type { DiscoveryCandidate } from '@thearchitect/shared';
const h = (source: string, para: string, score: number) => ({ regulationKey: `${source}:${para}`, versionHash: 'x', source, paragraphNumber: para, title: 't', jurisdiction: 'EU', language: source.endsWith('-de') ? 'de' : 'en', score });

describe('discoverCandidates', () => {
  beforeEach(() => { jest.clearAllMocks(); mockConfigured.mockReturnValue(true); mockProfile.mockResolvedValue({ projectId: 'p1', text: 'prof', signalHints: [], meta: {} }); });

  it('aggregiert §→Gesetz und merged Sprach-Familie', async () => {
    mockSearch.mockResolvedValue([h('ai-act-en', '5', 0.9), h('ai-act-de', '5', 0.8), h('dora-en', '3', 0.5)]);
    const res = await discoverCandidates('p1');
    const ai = res.candidates.find(c => c.family === 'ai-act');
    expect(ai).toBeDefined();
    expect(ai!.sources.sort()).toEqual(['ai-act-de', 'ai-act-en']);
    expect(ai!.hitCount).toBe(2);
    expect(res.candidates[0].family).toBe('ai-act'); // höchster Score zuerst
    expect(res.candidates.every(c => c.score >= 0 && c.score <= 1)).toBe(true);
  });

  it('klemmt negative Qdrant-Cosine-Scores auf 0 (untere Klemme, AC-3)', async () => {
    // Qdrant-Cosine ist roh ∈[-1,1]. Ein Kandidat mit ausschließlich negativen Scores
    // ⇒ gewichteter Schnitt negativ ⇒ Math.max(0, ...) muss auf 0 klemmen.
    mockSearch.mockResolvedValue([h('dora-en', '3', -0.5), h('dora-en', '4', -0.3)]);
    const res = await discoverCandidates('p1');
    const dora = res.candidates.find(c => c.family === 'dora');
    expect(dora).toBeDefined();
    expect(dora!.score).toBe(0); // ohne untere Klemme wäre er negativ
  });

  it('unkonfigurierter Korpus ⇒ degraded, leere Kandidaten (kein Fehler)', async () => {
    mockConfigured.mockReturnValue(false);
    const res = await discoverCandidates('p1');
    expect(res.candidates).toEqual([]);
    expect(res.degraded).toBeTruthy();
  });
});

describe('gateCandidatesForJudge (pure Prod-Gating — Eval-Reuse, kein Drift)', () => {
  const cand = (family: string, score: number): DiscoveryCandidate => ({
    family, sources: [`${family}-en`], jurisdiction: 'EU', score, hitCount: 1, topHits: [],
  });

  it('filtert unter der Schwelle und deckelt auf max (0.9/0.4/0.1, thr 0.3, max 5 ⇒ 2 Familien)', () => {
    const gated = gateCandidatesForJudge([cand('a', 0.9), cand('b', 0.4), cand('c', 0.1)], 0.3, 5);
    expect(gated.map(c => c.family)).toEqual(['a', 'b']);
  });

  it('max deckelt die Anzahl auch über der Schwelle', () => {
    const gated = gateCandidatesForJudge([cand('a', 0.9), cand('b', 0.8), cand('c', 0.7)], 0.3, 2);
    expect(gated.map(c => c.family)).toEqual(['a', 'b']);
  });

  it('lauter Sub-Threshold-Scores ⇒ leere Menge', () => {
    expect(gateCandidatesForJudge([cand('a', 0.1), cand('b', 0.2)], 0.3, 5)).toEqual([]);
  });

  it('Defaults kommen aus den Env-Funktionen (LAW_DISCOVERY_JUDGE_THRESHOLD/_MAX_JUDGE)', () => {
    const prevThr = process.env.LAW_DISCOVERY_JUDGE_THRESHOLD;
    const prevMax = process.env.LAW_DISCOVERY_MAX_JUDGE;
    try {
      process.env.LAW_DISCOVERY_JUDGE_THRESHOLD = '0.5';
      process.env.LAW_DISCOVERY_MAX_JUDGE = '1';
      const gated = gateCandidatesForJudge([cand('a', 0.9), cand('b', 0.6), cand('c', 0.4)]);
      expect(gated.map(c => c.family)).toEqual(['a']); // 0.4 < 0.5 raus, max 1 kappt b
    } finally {
      if (prevThr === undefined) delete process.env.LAW_DISCOVERY_JUDGE_THRESHOLD; else process.env.LAW_DISCOVERY_JUDGE_THRESHOLD = prevThr;
      if (prevMax === undefined) delete process.env.LAW_DISCOVERY_MAX_JUDGE; else process.env.LAW_DISCOVERY_MAX_JUDGE = prevMax;
    }
  });
});
