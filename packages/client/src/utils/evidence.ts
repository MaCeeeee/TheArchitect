/**
 * UC-PROV-003 (THE-737) — assumption-vs-validated trust encoding.
 *
 * Elements written through the API can carry a hypothesis flag plus
 * traceability in their free-form `metadata`:
 *
 *   metadata.assumption       boolean — true = hypothesis, false = validated
 *   metadata.assumptionNote   why it is (still) an assumption
 *   metadata.assumptionSince  ISO date the assumption was recorded
 *   metadata.validationRef    where it gets validated (doc path + anchor, or URL)
 *   metadata.previousName     name before the last rename
 *   metadata.changedOn        ISO date of that rename
 *
 * These keys are a convention, not a typed schema — this module is the only
 * place in the client that knows them. PropertyPanel and NodeObject3D both
 * read through it.
 */

export type EvidenceState = 'assumption' | 'validated' | 'planned' | 'unassessed';

export interface Evidence {
  state: EvidenceState;
  note?: string;
  since?: string;
  validationRef?: string;
  /** Set only for http(s) refs — doc paths stay plain text. */
  validationHref?: string;
  previousName?: string;
  changedOn?: string;
  source?: string;
  provenance?: string;
  certifiedAt?: string;
}

interface EvidenceInput {
  status?: string;
  metadata?: Record<string, unknown>;
  source?: unknown;
  provenance?: unknown;
  certifiedAt?: unknown;
}

/** Opacity of a hypothesis body in 3D — translucent, but still pickable. */
export const HYPOTHESIS_OPACITY = 0.45;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

export function isAssumption(element: EvidenceInput): boolean {
  return element.metadata?.assumption === true;
}

export function getEvidence(element: EvidenceInput): Evidence {
  const meta = element.metadata ?? {};
  // Only an explicit flag counts as evidence either way: `status: current`
  // means "as-is", not "someone checked it".
  const state: EvidenceState =
    meta.assumption === true ? 'assumption' :
    meta.assumption === false ? 'validated' :
    element.status === 'target' ? 'planned' : 'unassessed';

  const validationRef = str(meta.validationRef);
  return {
    state,
    note: str(meta.assumptionNote),
    since: str(meta.assumptionSince),
    validationRef,
    validationHref: validationRef && /^https?:\/\//i.test(validationRef) ? validationRef : undefined,
    previousName: str(meta.previousName),
    changedOn: str(meta.changedOn),
    source: str(element.source),
    provenance: str(element.provenance),
    certifiedAt: str(element.certifiedAt),
  };
}
