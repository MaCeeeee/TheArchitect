// packages/server/src/services/compliance-pipeline.service.ts
import { CompliancePipelineState, ICompliancePipelineState } from '../models/CompliancePipelineState';
import { StandardMapping } from '../models/StandardMapping';
import { Standard } from '../models/Standard';
import { Policy } from '../models/Policy';

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
  // Advance to 'mapped' only when at least one non-gap mapping exists
  if (stats.compliant + stats.partial > 0 && state.stage === 'uploaded') {
    state.stage = 'mapped';
  }
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

  // Advance to policies_generated when policies exist and stage is 'mapped'
  if (approvedCount > 0 && state.stage === 'mapped') {
    state.stage = 'policies_generated';
  }

  await state.save();
  return state;
}

/**
 * Get pipeline status for all standards in a project.
 */
export async function getPipelineStatus(
  projectId: string
): Promise<ICompliancePipelineState[]> {
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
