import { describe, it, expect } from '@jest/globals';
import { __setCorpusSearchDeps, __resetCorpusSearchDeps, corpusVectorSearch } from '../services/corpusVectorSearch.service';

describe('corpusVectorSearch', () => {
  it('mappt Qdrant-Hits auf CorpusHit inkl. score', async () => {
    __setCorpusSearchDeps({
      embed: async () => new Array(768).fill(0.1),
      search: async () => [
        { score: 0.91, payload: { regulationKey: 'ai-act-en:5', versionHash: 'h1', source: 'ai-act-en', paragraphNumber: '5', title: 'Art 5', jurisdiction: 'EU', language: 'en' } },
      ],
    });
    const hits = await corpusVectorSearch('some profile text', 10);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ regulationKey: 'ai-act-en:5', source: 'ai-act-en', score: 0.91, versionHash: 'h1' });
    expect(hits[0].provisionKind).toBeUndefined(); // Naht dormant
    __resetCorpusSearchDeps();
  });

  it('leeres Ergebnis ⇒ []', async () => {
    __setCorpusSearchDeps({ embed: async () => new Array(768).fill(0), search: async () => [] });
    expect(await corpusVectorSearch('x', 5)).toEqual([]);
    __resetCorpusSearchDeps();
  });
});
