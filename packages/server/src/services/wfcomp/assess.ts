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
import type { GapReport, FieldSuggestion } from './types';

/** M1: rein deterministisch (kein LLM). */
export function assessWorkflow(rawN8nJson: string | object): GapReport {
  const sanitized = sanitizeN8nWorkflow(rawN8nJson);
  if (!detectGdprScope(sanitized)) {
    return { gdprScope: false, fields: [] };
  }
  const lifted = liftCompliance(sanitized);
  return runTraceCheck(lifted, ART30_FIELDS);
}

/** M2: deterministisch + LLM-Vorschläge (Ask/Confirm-annotiert). Vorschlag macht NIE grün. */
export async function assessWorkflowWithInference(
  rawN8nJson: string | object,
  opts?: { anthropicClient?: Anthropic },
): Promise<GapReport> {
  const sanitized = sanitizeN8nWorkflow(rawN8nJson);
  if (!detectGdprScope(sanitized)) {
    return { gdprScope: false, fields: [] };
  }
  const lifted = liftCompliance(sanitized);

  // Graceful degradation: if the LLM is unavailable (no key, timeout, rate-limit,
  // backend down) we do NOT fail the assessment — we return the deterministic
  // verdict and the legal fields simply stay 'ask'. The LLM is an enhancement,
  // never a blocker. (THE-360 landmine #2)
  let suggestions: FieldSuggestion[] = [];
  try {
    suggestions = await inferLegalFields(sanitized, opts);
  } catch {
    log.warn('[wfcomp] inference unavailable — degrading to the deterministic verdict');
  }

  const report = runTraceCheck(lifted, ART30_FIELDS);
  return annotateModes(report, suggestions);
}
