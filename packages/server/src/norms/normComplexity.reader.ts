/**
 * Dünner Reader-Adapter: NormView (norm.service-Facade) → C_score.
 *
 * Bewusst getrennt vom reinen Kern (`complexityScore.ts`), damit dieser
 * I/O-frei und ohne Shared-Typ-Kopplung testbar bleibt (Ousterhout: Kopplung
 * minimieren + explizit machen). Der Score wird je `{workId, versionHash}`
 * geschlüsselt — dieselbe Identität wie ComplianceMapping/AiTrace, damit die
 * Eval-Stratifizierung (THE-430) joinen kann.
 *
 * Linear: THE-431 (REQ-ONTO-001.1)
 */
import type { NormView } from '@thearchitect/shared';
import { computeComplexityScore, type NormComplexity } from './complexityScore';

export interface KeyedNormComplexity extends NormComplexity {
  /** = NormIdentity.workId der Norm (interner Stammschlüssel, ADR-0004 E1). */
  workId: string;
  /** Korpus-Versions-Fingerprint (ADR-0001), falls die Norm aus dem Korpus stammt. */
  versionHash?: string;
}

export function complexityForNorm(view: NormView): KeyedNormComplexity {
  const base = computeComplexityScore(view.sections);
  return {
    ...base,
    workId: view.identity.workId,
    versionHash: view.corpusRef?.versionHash,
  };
}
