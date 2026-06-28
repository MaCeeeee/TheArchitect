/**
 * assessWorkflow — die komplette In-Memory Compliance-Pipeline (UC-WFCOMP-001).
 *
 *   sanitize → scope → (scope ? lift → trace : nicht einschlägig)
 *
 * Reiner Mechanismus, DB-frei. Produktions-Verdrahtung mit Neo4j: THE-360.
 */
import Anthropic from '@anthropic-ai/sdk';
import { sanitizeN8nWorkflow } from './sanitize';
import { detectGdprScope } from './scope';
import { liftCompliance } from './lift';
import { runTraceCheck } from './trace';
import { inferLegalFields } from './inference';
import { annotateModes } from './attestation';
import { ART30_FIELDS } from '../../data/art30.seed-data';
import { log } from '../../config/logger';
import type { GapReport, FieldSuggestion, LiftedGraph } from './types';

/** M1: rein deterministisch (kein LLM). */
export function assessWorkflow(rawN8nJson: string | object): GapReport {
  const sanitized = sanitizeN8nWorkflow(rawN8nJson);
  if (!detectGdprScope(sanitized)) {
    return { gdprScope: false, fields: [] };
  }
  const lifted = liftCompliance(sanitized);
  return runTraceCheck(lifted, ART30_FIELDS);
}

export interface AssessOutcome {
  report: GapReport;
  /** null when not applicable (gdprScope=false) — nothing to persist. */
  lifted: LiftedGraph | null;
  workflowName: string;
}

/**
 * Shared core — returns the report AND the lifted graph, so callers that
 * persist (Slice 3) can reuse the pipeline without re-running it.
 */
export async function runAssessment(
  rawN8nJson: string | object,
  opts?: { infer?: boolean; anthropicClient?: Anthropic },
): Promise<AssessOutcome> {
  const sanitized = sanitizeN8nWorkflow(rawN8nJson);
  if (!detectGdprScope(sanitized)) {
    return { report: { gdprScope: false, fields: [] }, lifted: null, workflowName: sanitized.name };
  }
  const lifted = liftCompliance(sanitized);

  // Graceful degradation: if the LLM is unavailable we do NOT fail — the legal
  // fields simply stay 'ask'. The LLM is an enhancement, never a blocker. (landmine #2)
  let suggestions: FieldSuggestion[] = [];
  if (opts?.infer) {
    try {
      suggestions = await inferLegalFields(sanitized, { anthropicClient: opts.anthropicClient });
    } catch {
      log.warn('[wfcomp] inference unavailable — degrading to the deterministic verdict');
    }
  }

  const report = annotateModes(runTraceCheck(lifted, ART30_FIELDS), suggestions);
  return { report, lifted, workflowName: sanitized.name };
}

/** M2: deterministisch + LLM-Vorschläge (Ask/Confirm-annotiert). Vorschlag macht NIE grün. */
export async function assessWorkflowWithInference(
  rawN8nJson: string | object,
  opts?: { anthropicClient?: Anthropic },
): Promise<GapReport> {
  return (await runAssessment(rawN8nJson, { infer: true, anthropicClient: opts?.anthropicClient })).report;
}
