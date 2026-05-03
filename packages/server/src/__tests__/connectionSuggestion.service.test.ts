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

  it('treats Requirement with only upstream Driver-influence as fulfillment-isolated (still heal-iterated)', async () => {
    // Real-world case: ESRS policy gets projected as a Requirement and
    // simultaneously gets a Driver→Requirement influence edge from
    // CSRD. With the legacy "any-edge → not isolated" rule, Heal would
    // skip this Requirement entirely. With the fulfillment-isolated
    // rule, Heal still scans it because no Capability fulfills it yet.
    const req: El = { id: 'req1', type: 'requirement', name: 'Materiality Assessment Requirement', description: 'Perform materiality assessment.' };
    const driver: El = { id: 'd1', type: 'driver', name: 'CSRD', description: 'EU regulation.' };
    const cap: El = { id: 'cap1', type: 'business_capability', name: 'Materiality Analysis', description: 'Identifies material ESG topics.' };

    const seen: string[] = [];
    const recordingLLM: LLMReasoner = async ({ source }) => {
      seen.push(source.id);
      return [];
    };

    await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [req, driver, cap],
      connections: [{ id: 'c1', sourceId: 'd1', targetId: 'req1', type: 'influence' }],
      minConfidence: 0.7,
      llm: recordingLLM,
    });

    // Driver and Cap are 0-isolated → scanned. Requirement has 1 edge
    // (driver-influence) but ZERO fulfilling realizers → also scanned.
    expect(seen).toContain('req1');
  });

  it('does NOT scan a Requirement that already has a realizing Capability', async () => {
    const req: El = { id: 'req1', type: 'requirement', name: 'Disclosure Req', description: 'Disclose carbon.' };
    const cap: El = { id: 'cap1', type: 'business_capability', name: 'Carbon Accounting', description: 'Tracks GHG emissions.' };

    const seen: string[] = [];
    const recordingLLM: LLMReasoner = async ({ source }) => {
      seen.push(source.id);
      return [];
    };

    await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [req, cap],
      connections: [{ id: 'c1', sourceId: 'cap1', targetId: 'req1', type: 'realization' }],
      minConfidence: 0.7,
      llm: recordingLLM,
    });

    // Requirement is fulfilled (Capability realizes it) → NOT scanned
    expect(seen).not.toContain('req1');
  });

  it('honours bidirectional direction: Capability realizes Requirement (edge runs Capability→Requirement)', async () => {
    // The isolated element is a Requirement. Per ArchiMate the edge runs
    // Capability → Requirement (incoming), not the reverse. The heal must
    // swap source/target so the persisted edge is in the spec-correct
    // direction even though we iterate over the isolated Requirement.
    const requirement: El = {
      id: 'req1',
      type: 'requirement',
      name: 'Disclose Scope-3 emissions',
      description: 'Per ESRS E1 §51.',
    };
    const capability: El = {
      id: 'cap1',
      type: 'business_capability',
      name: 'Carbon Accounting',
      description: 'Tracks GHG emissions across the value chain.',
    };
    const llmRealizes: LLMReasoner = async () => [{
      targetId: 'cap1',
      relationshipType: 'realization' as const,
      confidence: 0.92,
      reasoning: 'capability fulfils the disclosure requirement',
      direction: 'incoming',
    }];
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [requirement, capability],
      connections: [],
      minConfidence: 0.7,
      llm: llmRealizes,
    });
    const sugs = r.perElement.get('req1') ?? [];
    expect(sugs.length).toBe(1);
    // Edge must be Capability → Requirement, not Requirement → Capability
    expect(sugs[0].sourceId).toBe('cap1');
    expect(sugs[0].targetId).toBe('req1');
    expect(sugs[0].direction).toBe('incoming');
    expect(sugs[0].relationshipType).toBe('realization');
  });

  it('drops suggestions whose relationshipType is ArchiMate-invalid for the pair', async () => {
    // stakeholder→business_capability is motivation→strategy.
    // Per ArchiMate 3.2 §7.6 the only valid relationships are 'influence' and 'association'.
    // 'serving' is structurally invalid and must be dropped post-LLM.
    const capability: El = {
      id: 'c1',
      type: 'business_capability',
      name: 'Cap',
      description: 'A capability.',
    };
    const llmHallucinatesServing: LLMReasoner = async () => [{
      targetId: 'c1',
      relationshipType: 'serving' as const,
      confidence: 0.95,
      reasoning: 'looks plausible',
    }];
    const r = await suggestConnectionsForIsolatedElements({
      projectId: 'p1',
      elements: [stakeholder, capability],
      connections: [],
      minConfidence: 0.7,
      llm: llmHallucinatesServing,
    });
    expect(r.suggestionsTotal).toBe(0);
    expect(r.invalidRelationshipDrops).toBeGreaterThan(0);
  });
});
