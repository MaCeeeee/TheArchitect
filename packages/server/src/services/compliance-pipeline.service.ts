// packages/server/src/services/compliance-pipeline.service.ts
import { CompliancePipelineState, ICompliancePipelineState } from '../models/CompliancePipelineState';
import { StandardMapping } from '../models/StandardMapping';
import { Standard } from '../models/Standard';
import { Policy } from '../models/Policy';
import { ComplianceSnapshot, IComplianceSnapshot } from '../models/ComplianceSnapshot';
import { checkCompliance } from './compliance.service';
import {
  getPipelineNorm,
  computeNormMappingStats,
  derivePipelineAnchorId,
} from './norm.service';

/**
 * Get or create pipeline state for a norm (THE-390 P2).
 *
 * `normRef` ist entweder eine legacy `standardId` (Upload-Welt, wie bisher) oder
 * ein `corpus:<source>`-workId. Korpus-States ankern über eine deterministische
 * Pseudo-ObjectId (unique-Index bleibt intakt) und tragen den echten Schlüssel in
 * `normId`; der Anker stirbt in P4 mit dem Index-Flip (ADR-0004 E4).
 */
export async function getOrCreatePipelineState(
  projectId: string,
  normRef: string
): Promise<ICompliancePipelineState> {
  const isCorpus = normRef.startsWith('corpus:');
  const query = isCorpus
    ? { projectId, normId: normRef }
    : { projectId, standardId: normRef };
  let state = await CompliancePipelineState.findOne(query);
  if (!state) {
    state = await CompliancePipelineState.create({
      projectId,
      standardId: isCorpus ? derivePipelineAnchorId(normRef) : normRef,
      ...(isCorpus ? { normId: normRef } : {}),
      stage: 'uploaded',
      mappingStats: { total: 0, compliant: 0, partial: 0, gap: 0, unmapped: 0 },
      policyStats: { generated: 0, approved: 0, rejected: 0 },
    });
  }
  return state;
}

/** Pipeline-Schlüssel eines States: kanonische normId, sonst legacy standardId. */
function stateNormRef(state: ICompliancePipelineState): string {
  return state.normId ?? String(state.standardId);
}

/**
 * Refresh mapping stats from actual StandardMapping documents.
 * Note: s.id comes from IStandardSection.id (randomUUID) — the same value
 * stored in StandardMapping.sectionId when mappings are created.
 */
export async function refreshMappingStats(
  projectId: string,
  normRef: string
): Promise<ICompliancePipelineState> {
  const state = await getOrCreatePipelineState(projectId, normRef);
  // THE-390 P2: quellenagnostisch über die Norm-Facade — Upload liefert identische
  // Zahlen wie der bisherige Direktzugriff, Korpus projiziert lifecycle→conformance.
  const stats = await computeNormMappingStats(projectId, normRef);
  if (!stats) throw new Error('Standard not found');

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
  normRef: string
): Promise<ICompliancePipelineState> {
  const state = await getOrCreatePipelineState(projectId, normRef);

  // Policies hängen (bis zum P4-FK-Flip, ADR-0004 E5) am standardId-Anker des States.
  const approvedCount = await Policy.countDocuments({
    projectId,
    standardId: state.standardId,
    enabled: true,
  });

  state.policyStats = {
    generated: approvedCount,
    approved: approvedCount,
    rejected: 0,
  };

  // Also refresh mapping stats inline so stage can advance properly
  const stats = await computeNormMappingStats(projectId, normRef);
  if (stats) {
    state.mappingStats = stats;
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
    uploaded: 0, mapped: 1, policies_generated: 2, roadmap_ready: 3, tracking: 4, audit_ready: 5,
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

  // Has roadmap linked → at least 'roadmap_ready'
  if (state.roadmapId) {
    if (STAGE_RANK['roadmap_ready'] > (STAGE_RANK[newStage] ?? 0)) {
      newStage = 'roadmap_ready';
    }
  }

  // Has snapshot captured → at least 'tracking'
  if (state.lastSnapshotAt) {
    if (STAGE_RANK['tracking'] > (STAGE_RANK[newStage] ?? 0)) {
      newStage = 'tracking';
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

  // THE-389 heal-on-read: states written before the service-layer refresh
  // existed can still carry all-zero cached stats even though mappings exist.
  // total === 0 is exactly the "never refreshed" marker — after one refresh,
  // total equals the standard's section count (> 0), so this runs only once
  // per stale state.
  const states = await CompliancePipelineState.find({ projectId }).sort({ updatedAt: -1 });
  let healed = false;
  for (const state of states) {
    if (state.mappingStats.total === 0) {
      try {
        await refreshMappingStats(projectId, stateNormRef(state));
        healed = true;
      } catch {
        // standard may be orphaned — portfolio cleanup handles that
      }
    }
  }
  if (healed) {
    return CompliancePipelineState.find({ projectId }).sort({ updatedAt: -1 });
  }
  return states;
}

/**
 * Get portfolio overview: aggregated stats across all standards.
 * Maturity level: coverage < 20% → 1, < 40% → 2, < 60% → 3, < 80% → 4, else → 5
 */
export async function getPortfolioOverview(projectId: string) {
  const states = await getPipelineStatus(projectId);
  const standards = await Standard.find({ projectId }).select('name type version');

  const standardIds = new Set(standards.map((st) => String(st._id)));

  // Filter out orphaned pipeline states (standard was deleted but state remained).
  // THE-390 P2: Korpus-States (normId gesetzt) haben NIE ein Standard-Doc — sie
  // sind keine Waisen und dürfen hier nicht gelöscht werden.
  const orphanedIds = states
    .filter((s) => !s.normId && !standardIds.has(String(s.standardId)))
    .map((s) => s._id);
  if (orphanedIds.length > 0) {
    CompliancePipelineState.deleteMany({ _id: { $in: orphanedIds } }).catch(() => {});
  }

  const validStates = states.filter(
    (s) => s.normId || standardIds.has(String(s.standardId))
  );

  const portfolio = await Promise.all(validStates.map(async (s) => {
    const std = s.normId
      ? null
      : standards.find((st) => String(st._id) === String(s.standardId))!;
    // Korpus-Norm: Metadaten aus der Facade (Name = Gesetz, Typ = NormKind).
    const corpusNorm = s.normId ? await getPipelineNorm(projectId, s.normId) : null;
    const coverage = s.mappingStats.total > 0
      ? Math.min(100, Math.round(
          ((s.mappingStats.compliant + s.mappingStats.partial * 0.5) /
            s.mappingStats.total) *
            100
        ))
      : 0;
    const maturityLevel = coverage < 20 ? 1 : coverage < 40 ? 2 : coverage < 60 ? 3 : coverage < 80 ? 4 : 5;

    return {
      standardId: s.normId ?? String(s.standardId),
      normId: s.normId,
      standardName: std?.name ?? corpusNorm?.name ?? s.normId ?? 'Unknown',
      standardType: std?.type ?? corpusNorm?.type ?? 'regulation',
      standardVersion: std?.version ?? '',
      stage: s.stage,
      mappingStats: s.mappingStats,
      policyStats: s.policyStats,
      coverage,
      maturityLevel,
      updatedAt: s.updatedAt,
    };
  }));

  return {
    totalStandards: standards.length,
    trackedStandards: validStates.length,
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
