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
import { persistLiftedGraph } from './persist';
import { WfcompAssessment } from '../../models/WfcompAssessment';
import { ART30_REGULATION_REF } from '../../data/art30.reference';
import type { GapReport } from './types';

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
