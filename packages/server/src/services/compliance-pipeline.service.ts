// packages/server/src/services/compliance-pipeline.service.ts
import { CompliancePipelineState, ICompliancePipelineState } from '../models/CompliancePipelineState';
import { StandardMapping } from '../models/StandardMapping';
import { Standard } from '../models/Standard';
import { Policy } from '../models/Policy';
import { ComplianceSnapshot, IComplianceSnapshot } from '../models/ComplianceSnapshot';
import { checkCompliance } from './compliance.service';

/**
 * Get or create pipeline state for a standard.
 */
export async function getOrCreatePipelineState(
  projectId: string,
  standardId: string
): Promise<ICompliancePipelineState> {
  let state = await CompliancePipelineState.findOne({ projectId, standardId });
  if (!state) {
    state = await CompliancePipelineState.create({
      projectId,
      standardId,
      stage: 'uploaded',
      mappingStats: { total: 0, compliant: 0, partial: 0, gap: 0, unmapped: 0 },
      policyStats: { generated: 0, approved: 0, rejected: 0 },
    });
  }
  return state;
}

/**
 * Refresh mapping stats from actual StandardMapping documents.
 * Note: s.id comes from IStandardSection.id (randomUUID) — the same value
 * stored in StandardMapping.sectionId when mappings are created.
 */
export async function refreshMappingStats(
  projectId: string,
  standardId: string
): Promise<ICompliancePipelineState> {
  const state = await getOrCreatePipelineState(projectId, standardId);
  const standard = await Standard.findById(standardId);
  if (!standard) throw new Error('Standard not found');

  const mappings = await StandardMapping.find({ projectId, standardId });
  const mappedSectionIds = new Set(mappings.map((m) => m.sectionId));

  const stats = {
    total: standard.sections.length,
    compliant: mappings.filter((m) => m.status === 'compliant').length,
    partial: mappings.filter((m) => m.status === 'partial').length,
    gap: mappings.filter((m) => m.status === 'gap').length,
    unmapped: standard.sections.filter((s) => !mappedSectionIds.has(s.id)).length,
  };

  state.mappingStats = stats;
  // Recompute stage based on actual data (not just sequential transitions)
  recomputeStage(state);
  await state.save();
  return state;
}

/**
 * Refresh policy stats from actual Policy documents linked to this standard.
 */
export async function refreshPolicyStats(
  projectId: string,
  standardId: string
): Promise<ICompliancePipelineState> {
  const state = await getOrCreatePipelineState(projectId, standardId);

  const approvedCount = await Policy.countDocuments({ projectId, standardId, enabled: true });

  state.policyStats = {
    generated: approvedCount,
    approved: approvedCount,
    rejected: 0,
  };

  // Also refresh mapping stats inline so stage can advance properly
  const standard = await Standard.findById(standardId);
  if (standard) {
    const mappings = await StandardMapping.find({ projectId, standardId });
    const mappedSectionIds = new Set(mappings.map((m) => m.sectionId));
    state.mappingStats = {
      total: standard.sections.length,
      compliant: mappings.filter((m) => m.status === 'compliant').length,
      partial: mappings.filter((m) => m.status === 'partial').length,
      gap: mappings.filter((m) => m.status === 'gap').length,
      unmapped: standard.sections.filter((s) => !mappedSectionIds.has(s.id)).length,
    };
  }

  recomputeStage(state);
  await state.save();
  return state;
}

/**
 * Recompute pipeline stage based on actual data — not sequential.
 * Always advances forward, never goes back.
 */
function recomputeStage(state: ICompliancePipelineState) {
  const STAGE_RANK: Record<string, number> = {
    uploaded: 0, mapped: 1, policies_generated: 2, roadmap_ready: 3, tracking: 4,
  };
  const currentRank = STAGE_RANK[state.stage] ?? 0;

  let newStage = state.stage;

  // Has non-gap mappings → at least 'mapped'
  if ((state.mappingStats.compliant + state.mappingStats.partial) > 0) {
    if (STAGE_RANK['mapped'] > (STAGE_RANK[newStage] ?? 0)) {
      newStage = 'mapped';
    }
  }

  // Has approved policies → at least 'policies_generated'
  if (state.policyStats.approved > 0) {
    if (STAGE_RANK['policies_generated'] > (STAGE_RANK[newStage] ?? 0)) {
      newStage = 'policies_generated';
    }
  }

  // Only advance, never go back
  if ((STAGE_RANK[newStage] ?? 0) > currentRank) {
    state.stage = newStage;
  }
}

/**
 * Get pipeline status for all standards in a project.
 */
export async function getPipelineStatus(
  projectId: string
): Promise<ICompliancePipelineState[]> {
  // Ensure every uploaded standard has a pipeline state (backfill for standards uploaded before this feature)
  const standards = await Standard.find({ projectId }).select('_id');
  const existing = await CompliancePipelineState.find({ projectId }).select('standardId');
  const existingIds = new Set(existing.map((e) => String(e.standardId)));
  for (const std of standards) {
    if (!existingIds.has(String(std._id))) {
      await getOrCreatePipelineState(projectId, String(std._id));
    }
  }
  return CompliancePipelineState.find({ projectId }).sort({ updatedAt: -1 });
}

/**
 * Get portfolio overview: aggregated stats across all standards.
 * Maturity level: coverage < 20% → 1, < 40% → 2, < 60% → 3, < 80% → 4, else → 5
 */
export async function getPortfolioOverview(projectId: string) {
  const states = await getPipelineStatus(projectId);
  const standards = await Standard.find({ projectId }).select('name type version');

  const portfolio = states.map((s) => {
    const std = standards.find((st) => String(st._id) === String(s.standardId));
    const coverage = s.mappingStats.total > 0
      ? Math.round(
          ((s.mappingStats.compliant + s.mappingStats.partial * 0.5) /
            s.mappingStats.total) *
            100
        )
      : 0;
    const maturityLevel = coverage < 20 ? 1 : coverage < 40 ? 2 : coverage < 60 ? 3 : coverage < 80 ? 4 : 5;

    return {
      standardId: String(s.standardId),
      standardName: std?.name ?? 'Unknown',
      standardType: std?.type ?? 'custom',
      standardVersion: std?.version ?? '',
      stage: s.stage,
      mappingStats: s.mappingStats,
      policyStats: s.policyStats,
      coverage,
      maturityLevel,
      updatedAt: s.updatedAt,
    };
  });

  return {
    totalStandards: standards.length,
    trackedStandards: states.length,
    portfolio,
  };
}

/**
 * Compute maturity level from coverage (REQ-CDTP-022).
 * Coverage = (compliant + partial*0.5) / totalSections * 100
 */
export function computeMaturityLevel(
  compliant: number,
  partial: number,
  total: number,
): number {
  if (total === 0) return 1;
  const coverage = ((compliant + partial * 0.5) / total) * 100;
  if (coverage < 20) return 1;
  if (coverage < 40) return 2;
  if (coverage < 60) return 3;
  if (coverage < 80) return 4;
  return 5;
}

/**
 * Capture a compliance snapshot (REQ-CDTP-017).
 * If standardId is provided, captures for that standard.
 * If null, captures overall project score.
 */
export async function captureComplianceSnapshot(
  projectId: string,
  standardId?: string,
): Promise<IComplianceSnapshot> {
  let totalSections = 0;
  let compliantSections = 0;
  let partialSections = 0;
  let gapSections = 0;

  if (standardId) {
    const standard = await Standard.findById(standardId);
    if (!standard) throw new Error('Standard not found');

    const mappings = await StandardMapping.find({ projectId, standardId });
    totalSections = standard.sections.length;
    compliantSections = mappings.filter((m) => m.status === 'compliant').length;
    partialSections = mappings.filter((m) => m.status === 'partial').length;
    gapSections = mappings.filter((m) => m.status === 'gap').length;
  } else {
    // Aggregate across all standards
    const standards = await Standard.find({ projectId });
    for (const std of standards) {
      const mappings = await StandardMapping.find({ projectId, standardId: String(std._id) });
      totalSections += std.sections.length;
      compliantSections += mappings.filter((m) => m.status === 'compliant').length;
      partialSections += mappings.filter((m) => m.status === 'partial').length;
      gapSections += mappings.filter((m) => m.status === 'gap').length;
    }
  }

  const coverageScore = totalSections > 0
    ? Math.round(((compliantSections + partialSections * 0.5) / totalSections) * 100)
    : 0;

  // Get policy compliance score
  let policyScore = 100;
  let totalViolations = 0;
  try {
    const report = await checkCompliance(projectId);
    totalViolations = report.violations?.length || 0;
    policyScore = report.summary?.complianceScore ?? (totalViolations === 0 ? 100 : Math.max(0, 100 - totalViolations * 5));
  } catch {
    // Compliance check may fail if no policies exist
  }

  const maturityLevel = computeMaturityLevel(compliantSections, partialSections, totalSections);

  const snapshot = await ComplianceSnapshot.create({
    projectId,
    standardId: standardId || undefined,
    type: 'actual',
    policyComplianceScore: policyScore,
    standardCoverageScore: coverageScore,
    totalSections,
    compliantSections,
    partialSections,
    gapSections,
    totalViolations,
    maturityLevel,
  });

  return snapshot;
}

/**
 * Get compliance snapshots for a project.
 */
export async function getComplianceSnapshots(
  projectId: string,
  standardId?: string,
): Promise<IComplianceSnapshot[]> {
  const filter: Record<string, unknown> = { projectId };
  if (standardId) filter.standardId = standardId;
  return ComplianceSnapshot.find(filter).sort({ createdAt: -1 }).limit(100);
}
