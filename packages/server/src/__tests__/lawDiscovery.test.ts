const mockProfile = jest.fn();
const mockSearch = jest.fn();
const mockConfigured = jest.fn();
jest.mock('../services/useCaseProfile.service', () => ({ buildUseCaseProfile: (...a: unknown[]) => mockProfile(...a) }));
jest.mock('../services/governedRetrieval.service', () => ({ governedCorpusSearch: (...a: unknown[]) => mockSearch(...a) }));
jest.mock('../services/corpusClient.service', () => ({ isCorpusConfigured: () => mockConfigured() }));

import { discoverCandidates } from '../services/lawDiscovery.service';
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

  it('unkonfigurierter Korpus ⇒ degraded, leere Kandidaten (kein Fehler)', async () => {
    mockConfigured.mockReturnValue(false);
    const res = await discoverCandidates('p1');
    expect(res.candidates).toEqual([]);
    expect(res.degraded).toBeTruthy();
  });
});
