import type { PatternBadge } from '@thearchitect/shared';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TRENDING_MIN_ABSOLUTE = 3;
const TRENDING_MEDIAN_FACTOR = 3;
const ARCHITECTS_CHOICE_MIN_ENDORSEMENTS = 1;

export interface BadgeComputationInput {
  totalUses: number;
  last30Days: number;
  endorsementCount: number;
  createdAt: Date;
  medianLast30DaysAcrossAllPatterns: number;
  totalUsesThreshold: number;
  now: Date;
}

export function computeBadges(input: BadgeComputationInput): PatternBadge[] {
  const badges: PatternBadge[] = [];

  const ageMs = input.now.getTime() - input.createdAt.getTime();
  if (ageMs < THIRTY_DAYS_MS) {
    badges.push({ kind: 'new', label: 'New' });
  }

  if (
    input.totalUsesThreshold > 0 &&
    input.totalUses >= input.totalUsesThreshold
  ) {
    badges.push({ kind: 'most-used', label: 'Most Used' });
  }

  const medianFloor = Math.max(input.medianLast30DaysAcrossAllPatterns, 1);
  if (
    input.last30Days >= TRENDING_MIN_ABSOLUTE &&
    input.last30Days > TRENDING_MEDIAN_FACTOR * medianFloor
  ) {
    badges.push({ kind: 'trending', label: 'Trending' });
  }

  if (input.endorsementCount >= ARCHITECTS_CHOICE_MIN_ENDORSEMENTS) {
    badges.push({ kind: 'architects-choice', label: "Architects' Choice" });
  }

  return badges;
}

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function computeTop10PercentThreshold(values: number[]): number {
  if (values.length === 0) return 0;
  const filtered = values.filter((v) => v > 0);
  if (filtered.length === 0) return 0;
  const sorted = [...filtered].sort((a, b) => b - a);
  const cutoffIdx = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  return sorted[cutoffIdx] ?? 0;
}
