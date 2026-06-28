/**
 * assessAndStore — run the assessment and persist it (Slice 3 / THE-360).
 *
 *   runAssessment (pure) → persist lifted graph (Neo4j, if in scope)
 *                        → upsert assessment record (Mongo: GapReport snapshot
 *                          + corpus reference, one current per workflow)
 *
 * The law text is NOT copied — only referenced via ART30_REGULATION_REF
 * ({regulationKey, versionHash}, ADR-0001). The lifted graph is the only
 * genuinely-tenant data persisted.
 */
import { runAssessment } from './assess';
import { persistLiftedGraph, loadLiftedGraph } from './persist';
import { runTraceCheck } from './trace';
import { annotateModes, applyAttestation, type Attestation } from './attestation';
import { ART30_FIELDS } from '../../data/art30.seed-data';
import { WfcompAssessment } from '../../models/WfcompAssessment';
import { ART30_REGULATION_REF } from '../../data/art30.reference';
import type { GapReport, FieldSuggestion } from './types';

export interface AssessAndStoreArgs {
  projectId: string;
  wfcompId: string;
  raw: string | object;
  infer?: boolean;
  assessedBy?: string;
}

export async function assessAndStore(args: AssessAndStoreArgs): Promise<GapReport> {
  const { report, lifted, workflowName } = await runAssessment(args.raw, { infer: args.infer });

  // Lifted graph = tenant data → Neo4j (only when Art. 30 is in scope).
  if (lifted) {
    await persistLiftedGraph(args.projectId, args.wfcompId, lifted);
  }

  // Assessment record (current state per workflow). regulationRef is a corpus
  // reference, not a text copy (ADR-0001).
  await WfcompAssessment.updateOne(
    { projectId: args.projectId, wfcompId: args.wfcompId },
    {
      $set: {
        projectId: args.projectId,
        wfcompId: args.wfcompId,
        workflowName,
        gapReport: report,
        regulationRef: ART30_REGULATION_REF,
        ...(args.assessedBy ? { assessedBy: args.assessedBy } : {}),
      },
    },
    { upsert: true, runValidators: true },
  );

  return report;
}

export interface RecomputeArgs {
  projectId: string;
  wfcompId: string;
  /** Human-confirmed/provided field values (the VVT content itself, organizational metadata). */
  attestations: Attestation[];
  attestedBy?: string;
}

/**
 * Recompute a stored assessment after human attestation (THE-356/THE-360).
 *
 *   load persisted graph → applyAttestation (a person materializes the path)
 *                        → runTraceCheck (the field flips to 'present' — a human
 *                          makes it green, never the LLM)
 *                        → persist the updated graph + verdict.
 *
 * Round-trip by design: the BATTLE-TESTED pure runTraceCheck is the single source
 * of truth — no second Cypher trace. The prior LLM suggestions are carried over so
 * still-open fields keep their confirm/ask mode.
 *
 * Unlike /assess, the attestation values ARE persisted: they are the controller's
 * own Art.-30 record (organizational metadata), not a data subject's personal data.
 */
export async function recomputeAssessment(args: RecomputeArgs): Promise<GapReport> {
  const graph = await loadLiftedGraph(args.projectId, args.wfcompId);
  if (graph.elements.length === 0) {
    throw new Error('no persisted assessment to recompute');
  }

  const prior = await WfcompAssessment.findOne(
    { projectId: args.projectId, wfcompId: args.wfcompId },
    { gapReport: 1 },
  ).lean();
  const priorSuggestions: FieldSuggestion[] = (prior?.gapReport?.fields ?? [])
    .map((f) => f.suggestion)
    .filter((s): s is FieldSuggestion => !!s);

  const updated = applyAttestation(graph, args.attestations);
  const report = annotateModes(runTraceCheck(updated, ART30_FIELDS), priorSuggestions);

  await persistLiftedGraph(args.projectId, args.wfcompId, updated);
  await WfcompAssessment.updateOne(
    { projectId: args.projectId, wfcompId: args.wfcompId },
    { $set: { gapReport: report, ...(args.attestedBy ? { assessedBy: args.attestedBy } : {}) } },
  );

  return report;
}
