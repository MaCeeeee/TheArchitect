/**
 * req-to-mapping-golden Tests — reine Transformation Requirement→Mapping-Golden.
 * Run: cd packages/server && npx jest src/__tests__/reqToMappingGolden.test.ts
 */
import { toMappingGolden } from '../scripts/req-to-mapping-golden';
import { GoldenSetSchema } from '../evals/goldenSet';
import { loadRequirementGolden } from '../evals/requirementsGolden';

describe('toMappingGolden()', () => {
  const reqSet = loadRequirementGolden(); // eingefrorenes req-self-v1

  it('produces a schema-valid mapping golden, one case per requirement', () => {
    const m = toMappingGolden(reqSet, false);
    expect(() => GoldenSetSchema.parse(m)).not.toThrow();
    expect(m.cases).toHaveLength(reqSet.requirements.length);
    expect(m.frozen).toBe(true);
    // fullText ≥ 50 (Schema) und trägt Titel + Beschreibung
    for (const c of m.cases) expect(c.fullText.length).toBeGreaterThanOrEqual(50);
    // gold wird 1:1 durchgereicht
    const erase = m.cases.find(c => c.caseId === 'dsgvo-a17-erase')!;
    expect(erase.goldElementIds).toContain('4193802f-data-mongo');
  });

  it('strip-facts removes only the facts suffix from candidate descriptions', () => {
    const withFacts = toMappingGolden(reqSet, false);
    const noFacts = toMappingGolden(reqSet, true);
    const cwith = withFacts.cases[0].candidates.find(c => c.id === '4193802f-data-mongo')!;
    const cno = noFacts.cases[0].candidates.find(c => c.id === '4193802f-data-mongo')!;
    expect(cwith.description).toContain('facts:');
    expect(cno.description).not.toContain('facts:');
    // der fachliche Teil bleibt erhalten
    expect(cno.description).toContain('Project metadata, users');
    // gold + fullText identisch (nur Kandidaten-Beschreibung unterscheidet sich)
    expect(noFacts.cases.map(c => c.goldElementIds)).toEqual(withFacts.cases.map(c => c.goldElementIds));
    expect(noFacts.version).toContain('nofacts');
  });
});
