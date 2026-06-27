/**
 * assessWorkflow — die komplette In-Memory Compliance-Pipeline (UC-WFCOMP-001).
 *
 *   sanitize → scope → (scope ? lift → trace : nicht einschlägig)
 *
 * Reiner Mechanismus, DB-frei. Produktions-Verdrahtung mit Neo4j: THE-360.
 */
import { sanitizeN8nWorkflow } from './sanitize';
import { detectGdprScope } from './scope';
import { liftCompliance } from './lift';
import { runTraceCheck } from './trace';
import { ART30_FIELDS } from '../../data/art30.seed-data';
import type { GapReport } from './types';

export function assessWorkflow(rawN8nJson: string | object): GapReport {
  const sanitized = sanitizeN8nWorkflow(rawN8nJson);
  if (!detectGdprScope(sanitized)) {
    return { gdprScope: false, fields: [] };
  }
  const lifted = liftCompliance(sanitized);
  return runTraceCheck(lifted, ART30_FIELDS);
}
