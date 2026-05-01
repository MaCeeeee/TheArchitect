import { suggestConnectionsForIsolatedElements } from '../services/connectionSuggestion.service';

type El = { id: string; type: string; name: string };

describe('suggestConnectionsForIsolatedElements', () => {
  const stakeholder: El = { id: 's1', type: 'stakeholder', name: 'CFO' };
  const driver:      El = { id: 'd1', type: 'driver',      name: 'CSRD compliance' };
  const goal:        El = { id: 'g1', type: 'goal',        name: 'Reduce carbon 50%' };
  const appComp:     El = { id: 'a1', type: 'application_component', name: 'ESG App' };

  it('returns suggestions for an isolated stakeholder', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver, goal],
      connections: [],
      minConfidence: 0,
    });
    expect(report.elementsAnalyzed).toBe(3);
    const sug = report.perElement.get('s1') ?? [];
    expect(sug.length).toBeGreaterThan(0);
    expect(sug[0].targetId).toMatch(/^(d1|g1)$/);
    expect(sug[0].relationshipType).toMatch(/influence|association/);
    expect(sug[0].confidence).toBeGreaterThan(0);
    expect(sug[0].confidence).toBeLessThanOrEqual(1);
  });

  it('skips already-connected elements', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver],
      connections: [{ id: 'c1', sourceId: 's1', targetId: 'd1', type: 'influence' }],
      minConfidence: 0,
    });
    expect(report.perElement.has('s1')).toBe(false);
    expect(report.perElement.has('d1')).toBe(false);
  });

  it('respects minConfidence threshold', async () => {
    const reportLow = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, appComp],
      connections: [],
      minConfidence: 0,
    });
    const reportHigh = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, appComp],
      connections: [],
      minConfidence: 0.95,
    });
    expect((reportHigh.perElement.get('s1') ?? []).length)
      .toBeLessThanOrEqual((reportLow.perElement.get('s1') ?? []).length);
  });

  it('does not duplicate suggestions and never suggests self-loops', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver, goal],
      connections: [],
      minConfidence: 0,
    });
    for (const [elementId, sugs] of report.perElement.entries()) {
      const targetIds = sugs.map(s => s.targetId);
      expect(new Set(targetIds).size).toBe(targetIds.length);
      expect(targetIds).not.toContain(elementId);
    }
  });

  it('handles an empty workspace gracefully', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [],
      connections: [],
      minConfidence: 0,
    });
    expect(report.elementsAnalyzed).toBe(0);
    expect(report.suggestionsTotal).toBe(0);
    expect(report.perElement.size).toBe(0);
  });

  it('returns no suggestions for elements with unknown type', async () => {
    const weird: El = { id: 'x1', type: 'not_a_real_archimate_type', name: 'X' };
    const report = await suggestConnectionsForIsolatedElements({
      elements: [weird, driver],
      connections: [],
      minConfidence: 0,
    });
    expect(report.perElement.has('x1')).toBe(false);
  });

  it('analyzes weakly-connected elements when includeWeak=true', async () => {
    const report = await suggestConnectionsForIsolatedElements({
      elements: [stakeholder, driver, goal],
      connections: [{ id: 'c1', sourceId: 's1', targetId: 'd1', type: 'influence' }],
      minConfidence: 0,
      includeWeak: true,
    });
    expect(report.perElement.has('s1')).toBe(true);
  });
});
