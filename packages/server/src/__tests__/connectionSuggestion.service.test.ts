import { suggestConnectionsForIsolatedElements, type LLMReasoner } from '../services/connectionSuggestion.service';

type El = { id: string; type: string; name: string; description?: string };

const stakeholder: El = { id: 's1', type: 'stakeholder', name: 'CFO', description: 'Owns financial outcomes and ESG investor relations.' };
const driver: El = { id: 'd1', type: 'driver', name: 'CSRD compliance', description: 'EU mandate, Q1 2026.' };
const goal: El = { id: 'g1', type: 'goal', name: 'Reduce carbon 50%', description: 'By 2030.' };
const goal2: El = { id: 'g2', type: 'goal', name: 'Lower IT spend', description: 'Cut SaaS bill 20%.' };

const llmAlwaysMatches: LLMReasoner = async ({ candidates }) => candidates.slice(0, 2).map((c) => ({
  targetId: c.id,
  relationshipType: 'influence' as const,
  confidence: 0.9,
  reasoning: 'stub match',
}));

const llmNeverMatches: LLMReasoner = async () => [];

const llmFailing: LLMReasoner = async () => { throw new Error('LLM down'); };

describe('suggestConnectionsForIsolatedElements (LLM+RAG)', () => {
  it('uses the injected LLM and returns its suggestions', async () => {
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [stakeholder, driver, goal, goal2],
      connections: [],
      minConfidence: 0.7,
      llm: llmAlwaysMatches,
    });
    expect(r.isolatedCount).toBe(4);
    expect(r.llmCallsMade).toBeGreaterThan(0);
    expect(r.perElement.size).toBeGreaterThan(0);
    const stakeholderSugs = r.perElement.get('s1') ?? [];
    expect(stakeholderSugs.length).toBeGreaterThan(0);
    expect(stakeholderSugs[0].reasoning).toBe('stub match');
  });

  it('returns no suggestions when the LLM rejects all candidates', async () => {
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [stakeholder, driver, goal],
      connections: [],
      minConfidence: 0.7,
      llm: llmNeverMatches,
    });
    expect(r.suggestionsTotal).toBe(0);
    expect(r.perElement.size).toBe(0);
  });

  it('skips elements when LLM fails for that element (does not poison whole heal)', async () => {
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [stakeholder, driver, goal],
      connections: [],
      minConfidence: 0.7,
      llm: llmFailing,
    });
    expect(r.suggestionsTotal).toBe(0);
  });

  it('drops same-type pairs at the structural pre-filter (no stakeholder→stakeholder LLM call)', async () => {
    const otherStakeholder: El = { id: 's2', type: 'stakeholder', name: 'CTO', description: 'Tech.' };
    const calls: Array<{ source: string; cands: string[] }> = [];
    const recordingLLM: LLMReasoner = async ({ source, candidates }) => {
      calls.push({ source: source.id, cands: candidates.map((c) => c.id) });
      return [];
    };
    await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [stakeholder, otherStakeholder, driver],
      connections: [],
      minConfidence: 0.7,
      llm: recordingLLM,
    });
    for (const c of calls) {
      // The other stakeholder must NOT appear as a candidate when the source is a stakeholder
      if (c.source === 's1') expect(c.cands).not.toContain('s2');
      if (c.source === 's2') expect(c.cands).not.toContain('s1');
    }
  });

  it('respects minConfidence — drops suggestions below threshold', async () => {
    const llmLowConfidence: LLMReasoner = async ({ candidates }) => candidates.map((c) => ({
      targetId: c.id,
      relationshipType: 'association' as const,
      confidence: 0.5,
      reasoning: 'weak',
    }));
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [stakeholder, driver],
      connections: [],
      minConfidence: 0.7,
      llm: llmLowConfidence,
    });
    expect(r.suggestionsTotal).toBe(0);
  });

  it('handles empty workspace', async () => {
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [],
      connections: [],
      minConfidence: 0.7,
      llm: llmAlwaysMatches,
    });
    expect(r.elementsAnalyzed).toBe(0);
    expect(r.suggestionsTotal).toBe(0);
  });

  it('skips already-connected pairs', async () => {
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [stakeholder, driver, goal],
      connections: [{ id: 'c1', sourceId: 's1', targetId: 'd1', type: 'influence' }],
      minConfidence: 0.7,
      llm: llmAlwaysMatches,
    });
    // s1 should NOT show up in isolated count (already has 1 connection)
    expect(r.perElement.has('s1')).toBe(false);
    expect(r.perElement.has('d1')).toBe(false);
  });
});
