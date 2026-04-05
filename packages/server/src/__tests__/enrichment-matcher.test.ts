/**
 * Enrichment Matcher — Unit Tests
 *
 * Tests the 3-tier matching strategy helpers:
 *   1. normalize — string normalization for fuzzy comparison
 *   2. levenshteinSimilarity — edit-distance-based similarity
 *   3. tokenOverlap — Dice coefficient on word tokens
 *   4. findExactMatch / findFuzzyMatch — tier 1 & 2 matching logic
 *
 * Run: cd packages/server && npx jest src/__tests__/enrichment-matcher.test.ts --verbose
 */

import { __testExports as matcher } from '../services/enrichment-matcher.service';

const { normalize, levenshteinSimilarity, tokenOverlap, findExactMatch, findFuzzyMatch, buildMatch } = matcher;

// ════════════════════════════════════════════════════════
// normalize
// ════════════════════════════════════════════════════════

describe('normalize', () => {
  it('lowercases input', () => {
    expect(normalize('Hello World')).toBe('hello world');
  });

  it('replaces dashes, underscores, dots, slashes with spaces', () => {
    expect(normalize('my-app_v2.0/build')).toBe('my app v2 0 build');
  });

  it('collapses multiple spaces', () => {
    expect(normalize('  hello   world  ')).toBe('hello world');
  });

  it('handles backslashes', () => {
    expect(normalize('path\\to\\file')).toBe('path to file');
  });

  it('handles empty string', () => {
    expect(normalize('')).toBe('');
  });

  it('handles already normalized string', () => {
    expect(normalize('simple name')).toBe('simple name');
  });
});

// ════════════════════════════════════════════════════════
// levenshteinSimilarity
// ════════════════════════════════════════════════════════

describe('levenshteinSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(levenshteinSimilarity('', '')).toBe(1);
  });

  it('returns 0.0 for completely different strings of equal length', () => {
    // "abc" vs "xyz" — 3 edits, maxLen=3 → 1 - 3/3 = 0
    expect(levenshteinSimilarity('abc', 'xyz')).toBe(0);
  });

  it('computes correct similarity for one-edit distance', () => {
    // "kitten" vs "sitten" — 1 edit, maxLen=6 → 1 - 1/6 ≈ 0.833
    const sim = levenshteinSimilarity('kitten', 'sitten');
    expect(sim).toBeCloseTo(0.833, 2);
  });

  it('handles one empty string', () => {
    // "hello" vs "" — 5 edits, maxLen=5 → 1 - 5/5 = 0
    expect(levenshteinSimilarity('hello', '')).toBe(0);
  });

  it('is symmetric', () => {
    const a = levenshteinSimilarity('application', 'applications');
    const b = levenshteinSimilarity('applications', 'application');
    expect(a).toBe(b);
  });

  it('scores high for very similar strings', () => {
    const sim = levenshteinSimilarity('application component', 'application components');
    expect(sim).toBeGreaterThan(0.9);
  });
});

// ════════════════════════════════════════════════════════
// tokenOverlap (Dice coefficient)
// ════════════════════════════════════════════════════════

describe('tokenOverlap', () => {
  it('returns 1.0 for identical token sets', () => {
    expect(tokenOverlap('hello world', 'hello world')).toBe(1);
  });

  it('returns 1.0 for two empty strings', () => {
    expect(tokenOverlap('', '')).toBe(1);
  });

  it('returns 0.0 for no overlap', () => {
    expect(tokenOverlap('foo bar', 'baz qux')).toBe(0);
  });

  it('returns 0.0 when one side is empty', () => {
    expect(tokenOverlap('hello', '')).toBe(0);
  });

  it('computes correct Dice coefficient for partial overlap', () => {
    // tokens A: {crm, system}, tokens B: {crm, app}
    // overlap: 1 (crm), dice: 2*1 / (2+2) = 0.5
    expect(tokenOverlap('crm system', 'crm app')).toBe(0.5);
  });

  it('handles single-token strings', () => {
    expect(tokenOverlap('crm', 'crm')).toBe(1);
    expect(tokenOverlap('crm', 'erp')).toBe(0);
  });
});

// ════════════════════════════════════════════════════════
// findExactMatch (Tier 1)
// ════════════════════════════════════════════════════════

describe('findExactMatch', () => {
  const elements = [
    { id: 'elem-1', name: 'CRM System', type: 'application_component', layer: 'application', metadata: { sonarqubeKey: 'org.example:crm' } },
    { id: 'elem-2', name: 'ERP Module', type: 'application_component', layer: 'application', metadata: { jiraKey: 'ERP-123' } },
    { id: 'elem-3', name: 'HR Portal', type: 'application_service', layer: 'application', metadata: {} },
  ];

  it('matches by metadata property', () => {
    const enrichment = { sourceKey: 'org.example:crm', sourceName: 'CRM', fields: {} as any, confidence: 0.8, metadata: {} };
    const match = findExactMatch(enrichment, elements, new Set());
    expect(match).not.toBeNull();
    expect(match!.elementId).toBe('elem-1');
    expect(match!.confidence).toBe(1.0);
    expect(match!.matchMethod).toBe('exact');
  });

  it('matches by element ID', () => {
    const enrichment = { sourceKey: 'elem-2', sourceName: 'ERP', fields: {} as any, confidence: 0.8, metadata: {} };
    const match = findExactMatch(enrichment, elements, new Set());
    expect(match).not.toBeNull();
    expect(match!.elementId).toBe('elem-2');
  });

  it('returns null when no match found', () => {
    const enrichment = { sourceKey: 'nonexistent', sourceName: 'Something', fields: {} as any, confidence: 0.8, metadata: {} };
    const match = findExactMatch(enrichment, elements, new Set());
    expect(match).toBeNull();
  });

  it('skips already-used elements', () => {
    const enrichment = { sourceKey: 'org.example:crm', sourceName: 'CRM', fields: {} as any, confidence: 0.8, metadata: {} };
    const usedIds = new Set(['elem-1']);
    const match = findExactMatch(enrichment, elements, usedIds);
    expect(match).toBeNull();
  });
});

// ════════════════════════════════════════════════════════
// findFuzzyMatch (Tier 2)
// ════════════════════════════════════════════════════════

describe('findFuzzyMatch', () => {
  const elements = [
    { id: 'elem-1', name: 'CRM System', type: 'application_component', layer: 'application', metadata: {} },
    { id: 'elem-2', name: 'ERP Module', type: 'application_component', layer: 'application', metadata: {} },
    { id: 'elem-3', name: 'HR Portal', type: 'application_service', layer: 'application', metadata: {} },
  ];

  it('matches similar names above threshold', () => {
    const enrichment = { sourceKey: 'x', sourceName: 'CRM-System', fields: {} as any, confidence: 0.8, metadata: {} };
    const match = findFuzzyMatch(enrichment, elements, new Set());
    expect(match).not.toBeNull();
    expect(match!.elementId).toBe('elem-1');
    expect(match!.matchMethod).toBe('fuzzy');
  });

  it('returns null for names below threshold', () => {
    const enrichment = { sourceKey: 'x', sourceName: 'Totally Different System', fields: {} as any, confidence: 0.8, metadata: {} };
    const match = findFuzzyMatch(enrichment, elements, new Set());
    expect(match).toBeNull();
  });

  it('skips already-used elements', () => {
    const enrichment = { sourceKey: 'x', sourceName: 'CRM System', fields: {} as any, confidence: 0.8, metadata: {} };
    const usedIds = new Set(['elem-1']);
    const match = findFuzzyMatch(enrichment, elements, usedIds);
    // Should not match elem-1, might match something else or return null
    if (match) {
      expect(match.elementId).not.toBe('elem-1');
    }
  });
});

// ════════════════════════════════════════════════════════
// buildMatch
// ════════════════════════════════════════════════════════

describe('buildMatch', () => {
  it('constructs correct EnrichmentMatch structure', () => {
    const enrichment = { sourceKey: 'k1', sourceName: 'Test', fields: {} as any, confidence: 0.9, metadata: {} };
    const element = { id: 'elem-1', name: 'Test Element', type: 'application_component', layer: 'application' };
    const match = buildMatch(enrichment, element, 0.85, 'fuzzy');
    expect(match.elementId).toBe('elem-1');
    expect(match.elementName).toBe('Test Element');
    expect(match.elementType).toBe('application_component');
    expect(match.confidence).toBe(0.85);
    expect(match.matchMethod).toBe('fuzzy');
    expect(match.enrichment).toBe(enrichment);
  });
});
