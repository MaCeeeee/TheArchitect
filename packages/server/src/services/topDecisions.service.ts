/**
 * UC-EXEC-001 — Top-3 CEO Decisions derivation.
 *
 * Score-based v1: picks the top 1 element per decision-kind (compliance gap,
 * SPOF, cost burden), formats it into a sentence the CEO can act on.
 *
 * LLM-augmented variant is feature-flagged via EXEC_DECISIONS_LLM=true and
 * lives in topDecisionsLlm.service.ts (TODO post-demo).
 *
 * Linear: THE-290
 */

import type {
  CriticalityScoreEntry,
  ExecutiveDecision,
  StrategicRoi,
} from '@thearchitect/shared';

interface DerivationInput {
  scores: CriticalityScoreEntry[];
  unmappedStandardElements: Set<string>;     // elementIds with at least one 'gap' standard-mapping
}

export function deriveTopDecisions(input: DerivationInput): ExecutiveDecision[] {
  const decisions: ExecutiveDecision[] = [];

  const complianceDecision = pickComplianceDecision(input.scores, input.unmappedStandardElements);
  if (complianceDecision) decisions.push(complianceDecision);

  const spofDecision = pickSpofDecision(input.scores);
  if (spofDecision) decisions.push(spofDecision);

  const costDecision = pickCostBurdenDecision(input.scores);
  if (costDecision) decisions.push(costDecision);

  return decisions;
}

function pickComplianceDecision(
  scores: CriticalityScoreEntry[],
  unmapped: Set<string>,
): ExecutiveDecision | null {
  const candidates = scores
    .filter((s) => (s.factors?.complianceGap?.weighted ?? 0) > 0)
    .filter((s) => unmapped.has(s.elementId) || s.dominantFactor === 'complianceGap')
    .sort((a, b) => (b.factors?.complianceGap?.weighted ?? 0) - (a.factors?.complianceGap?.weighted ?? 0));

  const top = candidates[0];
  if (!top) return null;

  const rawGaps = Math.round(top.factors?.complianceGap?.raw ?? 0);
  return {
    kind: 'compliance_gap',
    title: `Realize the missing standard for "${top.name}"`,
    why: `${rawGaps} standard section${rawGaps === 1 ? '' : 's'} reference this ${top.type} but lack a confirmed realizer.`,
    suggestedAction: 'Open Gap-Analysis → assign an owning capability + close the mapping.',
    estimatedImpact: `Closes ${rawGaps} compliance gap${rawGaps === 1 ? '' : 's'} and raises mapping coverage.`,
    sourceElementId: top.elementId,
    sourceElementName: top.name,
  };
}

function pickSpofDecision(scores: CriticalityScoreEntry[]): ExecutiveDecision | null {
  const top = scores
    .filter((s) => s.dominantFactor === 'spof' || (s.factors?.spof?.weighted ?? 0) > 0)
    .sort((a, b) => (b.factors?.spof?.weighted ?? 0) - (a.factors?.spof?.weighted ?? 0))[0];
  if (!top) return null;

  const dependents = Math.round(top.factors?.spof?.raw ?? 0);
  return {
    kind: 'spof',
    title: `Add redundancy for "${top.name}"`,
    why: `${dependents} downstream element${dependents === 1 ? '' : 's'} depend on this single-point-of-failure.`,
    suggestedAction: 'Apply a Pattern-Library redundancy pattern (HA, multi-region, queued fallback).',
    estimatedImpact: `Eliminates the blast radius for ${dependents} dependent${dependents === 1 ? '' : 's'}.`,
    sourceElementId: top.elementId,
    sourceElementName: top.name,
  };
}

function pickCostBurdenDecision(scores: CriticalityScoreEntry[]): ExecutiveDecision | null {
  const top = scores
    .filter((s) => (s.factors?.costBurden?.weighted ?? 0) > 0)
    .sort((a, b) => (b.factors?.costBurden?.weighted ?? 0) - (a.factors?.costBurden?.weighted ?? 0))[0];
  if (!top) return null;

  const sharePct = Math.round((top.factors?.costBurden?.raw ?? 0) * 100);
  return {
    kind: 'cost_burden',
    title: `Review investment in "${top.name}"`,
    why: `This element drives ${sharePct}% of an upcoming wave's budget.`,
    suggestedAction: 'Run the 7Rs assessment (Retire / Replace / Re-host / Re-platform / Refactor / Repurchase / Retain).',
    estimatedImpact: `Up to 40% optimization potential on a ${sharePct}%-share wave element.`,
    sourceElementId: top.elementId,
    sourceElementName: top.name,
  };
}

// ─── Strategic ROI (Goal Attainment) ──────────────────────────────────────

interface GoalRow {
  status: string;
  maturityLevel: number | null;
  type: string;
  layer: string;
}

export function computeStrategicRoi(goalRows: GoalRow[]): StrategicRoi {
  const goals = goalRows.filter(
    (g) => g.layer === 'motivation' && (g.type === 'goal' || g.type === 'driver' || g.type === 'outcome'),
  );
  const total = goals.length;
  if (total === 0) {
    return {
      goalAttainmentPct: 0,
      achievedGoals: 0,
      totalGoals: 0,
      description: 'No goals or drivers defined yet',
    };
  }
  const achieved = goals.filter(
    (g) => g.status === 'target' || (g.maturityLevel ?? 0) >= 4,
  ).length;
  const pct = Math.round((achieved / total) * 100);
  return {
    goalAttainmentPct: pct,
    achievedGoals: achieved,
    totalGoals: total,
    description: `${achieved} of ${total} goals/drivers at target or mature`,
  };
}
