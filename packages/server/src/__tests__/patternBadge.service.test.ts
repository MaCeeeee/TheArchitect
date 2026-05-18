/**
 * REQ-CHOICE-007.2 + 007.4 — Badge computation unit tests
 *
 * Run: cd packages/server && npx jest src/__tests__/patternBadge.service.test.ts
 */

import {
  computeBadges,
  computeMedian,
  computeTop10PercentThreshold,
} from '../services/patternBadge.service';

const NOW = new Date('2026-05-18T00:00:00Z');
const TWO_DAYS_AGO = new Date('2026-05-16T00:00:00Z');
const TWO_MONTHS_AGO = new Date('2026-03-18T00:00:00Z');

describe('computeBadges', () => {
  const baseInput = {
    totalUses: 0,
    last30Days: 0,
    endorsementCount: 0,
    createdAt: TWO_MONTHS_AGO,
    medianLast30DaysAcrossAllPatterns: 0,
    totalUsesThreshold: 0,
    now: NOW,
  };

  test('1. returns "New" badge when pattern is younger than 30 days', () => {
    const badges = computeBadges({ ...baseInput, createdAt: TWO_DAYS_AGO });
    expect(badges.map((b) => b.kind)).toContain('new');
  });

  test('2. does NOT return "New" for older patterns', () => {
    const badges = computeBadges(baseInput);
    expect(badges.map((b) => b.kind)).not.toContain('new');
  });

  test('3. returns "Most Used" when totalUses >= threshold', () => {
    const badges = computeBadges({
      ...baseInput,
      totalUses: 50,
      totalUsesThreshold: 40,
    });
    expect(badges.map((b) => b.kind)).toContain('most-used');
  });

  test('4. does NOT return "Most Used" when threshold is 0 (no adoptions at all)', () => {
    const badges = computeBadges({
      ...baseInput,
      totalUses: 5,
      totalUsesThreshold: 0,
    });
    expect(badges.map((b) => b.kind)).not.toContain('most-used');
  });

  test('5. returns "Trending" when last30Days > 3× median + min 3 adoptions', () => {
    const badges = computeBadges({
      ...baseInput,
      last30Days: 10,
      medianLast30DaysAcrossAllPatterns: 2,
    });
    expect(badges.map((b) => b.kind)).toContain('trending');
  });

  test('6. does NOT return "Trending" if last30Days < 3 (too few absolute)', () => {
    const badges = computeBadges({
      ...baseInput,
      last30Days: 2,
      medianLast30DaysAcrossAllPatterns: 0,
    });
    expect(badges.map((b) => b.kind)).not.toContain('trending');
  });

  test('7. returns "Architects\' Choice" when >=1 endorsement', () => {
    const badges = computeBadges({ ...baseInput, endorsementCount: 1 });
    expect(badges.map((b) => b.kind)).toContain('architects-choice');
  });

  test('8. multiple badges can co-exist (New + Most Used + Architects\' Choice)', () => {
    const badges = computeBadges({
      ...baseInput,
      createdAt: TWO_DAYS_AGO,
      totalUses: 100,
      totalUsesThreshold: 50,
      endorsementCount: 3,
    });
    const kinds = badges.map((b) => b.kind);
    expect(kinds).toContain('new');
    expect(kinds).toContain('most-used');
    expect(kinds).toContain('architects-choice');
  });
});

describe('computeMedian', () => {
  test('returns 0 for empty array', () => {
    expect(computeMedian([])).toBe(0);
  });

  test('returns middle for odd-length sorted', () => {
    expect(computeMedian([1, 3, 5])).toBe(3);
  });

  test('returns average of two middle for even-length', () => {
    expect(computeMedian([1, 3, 5, 7])).toBe(4);
  });

  test('handles unsorted input', () => {
    expect(computeMedian([5, 1, 3])).toBe(3);
  });
});

describe('computeTop10PercentThreshold', () => {
  test('returns 0 for empty array', () => {
    expect(computeTop10PercentThreshold([])).toBe(0);
  });

  test('returns 0 when all values are zero', () => {
    expect(computeTop10PercentThreshold([0, 0, 0])).toBe(0);
  });

  test('returns the top value for a 10-item array', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // 10% of 10 = 1, cutoffIdx = max(0, 0) = 0, sorted DESC: [10,9,...]
    expect(computeTop10PercentThreshold(values)).toBe(10);
  });

  test('returns reasonable threshold for small dataset', () => {
    expect(computeTop10PercentThreshold([5, 10, 15])).toBe(15);
  });
});
