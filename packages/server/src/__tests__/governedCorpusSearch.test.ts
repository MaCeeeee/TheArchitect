import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCurrent = jest.fn();
jest.mock('../services/corpusClient.service', () => ({
  getCurrentVersionHashes: (...a: unknown[]) => mockCurrent(...a),
}));
const mockRaw = jest.fn();
jest.mock('../services/corpusVectorSearch.service', () => ({
  corpusVectorSearch: (...a: unknown[]) => mockRaw(...a),
}));

import { governedCorpusSearch, resetGovernedStats, getGovernedStats } from '../services/governedRetrieval.service';

const hit = (key: string, hash: string | undefined, score = 0.9) => ({
  regulationKey: key, versionHash: hash, source: key.split(':')[0], paragraphNumber: key.split(':')[1], title: 't', jurisdiction: 'EU', language: 'en', score,
});

describe('governedCorpusSearch', () => {
  beforeEach(() => { resetGovernedStats(); jest.clearAllMocks(); });

  it('droppt stale Treffer (versionHash present & != current)', async () => {
    mockRaw.mockResolvedValue([hit('ai-act-en:5', 'OLD'), hit('dora-en:3', 'CUR')]);
    mockCurrent.mockResolvedValue(new Map([['ai-act-en:5', 'CUR2'], ['dora-en:3', 'CUR']]));
    const res = await governedCorpusSearch({ text: 'x', topK: 10 });
    expect(res.map(h => h.regulationKey)).toEqual(['dora-en:3']);
    expect(getGovernedStats().staleDropped).toBe(1);
  });

  it('behält Legacy-Treffer ohne versionHash (unverifiable+1)', async () => {
    mockRaw.mockResolvedValue([hit('x-en:1', undefined)]);
    mockCurrent.mockResolvedValue(new Map());
    const res = await governedCorpusSearch({ text: 'x', topK: 10 });
    expect(res).toHaveLength(1);
    expect(getGovernedStats().unverifiable).toBe(1);
  });

  it('provisionKind-Filter ist dormant: gesetzt ⇒ Ergebnis unverändert (Slice-1)', async () => {
    mockRaw.mockResolvedValue([hit('ai-act-en:5', 'CUR')]);
    mockCurrent.mockResolvedValue(new Map([['ai-act-en:5', 'CUR']]));
    const res = await governedCorpusSearch({ text: 'x', topK: 10, provisionKind: 'obligation' });
    expect(res).toHaveLength(1); // Naht wirkungslos bis THE-432
  });

  it('Pin: Match ⇒ kept + pinnedServed; Mismatch ⇒ staleDropped', async () => {
    mockRaw.mockResolvedValue([hit('ai-act-en:5', 'PIN'), hit('dora-en:3', 'OTHER')]);
    mockCurrent.mockResolvedValue(new Map([['ai-act-en:5', 'CURR'], ['dora-en:3', 'CURR']]));
    const res = await governedCorpusSearch({ text: 'x', topK: 10, pin: { 'ai-act-en:5': 'PIN', 'dora-en:3': 'PIN' } });
    expect(res.map(h => h.regulationKey)).toEqual(['ai-act-en:5']); // OTHER != PIN → dropped
    expect(getGovernedStats().pinnedServed).toBe(1);
    expect(getGovernedStats().staleDropped).toBe(1);
  });
});
