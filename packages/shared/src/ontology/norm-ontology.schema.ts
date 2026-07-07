/**
 * E6 Norm-Ontology — Zod schema + ingestion contract (ADR-0004 E6).
 *
 * Two jobs:
 *  1. Validate the ontology FILE itself is well-formed (`NormOntologySchema`,
 *     exercised by `assertOntologyValid()` — call it in a test / at boot).
 *  2. Validate INGESTED / SUGGESTED values against the file's allowed sets — the
 *     "Schreibgrenze". Core fields stay `string`; these schemas are the gate.
 *
 * OOV (out-of-vocabulary) → the caller drops + counts (same pattern as the
 * hallucinated-elementId drop in complianceMapping.service.ts:143). Reused by
 * THE-432 (term typing) and THE-433 (relation extraction).
 */
import { z } from 'zod';
import { NORM_ONTOLOGY } from './norm-ontology.v1';

// ─── (1) File-shape schema ──────────────────────────────────────────

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/, 'ontologyVersion must be semver');

const NormKindEntry = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  bindingnessDefault: z.string().min(1),
});
const IdLabel = z.object({ id: z.string().min(1), label: z.string().min(1) });
const RelationTypeEntry = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  derivation: z.enum(['metadata', 'inferred']),
  directed: z.boolean(),
  inverseOf: z.string().min(1).optional(),
});
const PartyRoleEntry = IdLabel.extend({ origin: z.string().min(1) });
const MaturityScaleEntry = IdLabel.extend({ stages: z.array(z.string().min(1)).min(1) });
const JurisdictionEntry = IdLabel.extend({ lifecycle: z.array(z.string().min(1)).min(1) });
const AssuranceAxisEntry = z.object({ id: z.string().min(1), levels: z.array(z.string().min(1)).min(1) });
const AssuranceSchemeEntry = IdLabel.extend({ axes: z.array(AssuranceAxisEntry).min(1) });
const NormSourceEntry = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  jurisdiction: z.string().min(1).optional(),
});

export const NormOntologySchema = z.object({
  ontologyVersion: SemverSchema,
  updatedAt: z.string().min(1),
  normKinds: z.array(NormKindEntry).min(1),
  bindingness: z.array(IdLabel).min(1),
  relationTypes: z.array(RelationTypeEntry).min(1),
  partyRoles: z.array(PartyRoleEntry).min(1),
  maturityScales: z.array(MaturityScaleEntry).min(1),
  jurisdictions: z.array(JurisdictionEntry).min(1),
  assuranceSchemes: z.array(AssuranceSchemeEntry).min(1),
  normSources: z.array(NormSourceEntry).min(1),
});

/**
 * Assert the shipped ontology is well-formed AND internally consistent
 * (unique ids per facet, relation `inverseOf` points at an existing relation,
 * `bindingnessDefault` is a real bindingness id). Throws on any violation.
 */
export function assertOntologyValid(ontology: unknown = NORM_ONTOLOGY): void {
  const o = NormOntologySchema.parse(ontology);

  const dupes = (ids: string[]): string[] => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const id of ids) (seen.has(id) ? dup : seen).add(id);
    return [...dup];
  };
  const facets: Array<[string, string[]]> = [
    ['normKinds', o.normKinds.map((x) => x.id)],
    ['bindingness', o.bindingness.map((x) => x.id)],
    ['relationTypes', o.relationTypes.map((x) => x.id)],
    ['partyRoles', o.partyRoles.map((x) => x.id)],
    ['jurisdictions', o.jurisdictions.map((x) => x.id)],
    ['assuranceSchemes', o.assuranceSchemes.map((x) => x.id)],
    ['normSources', o.normSources.map((x) => x.id)],
  ];
  for (const [facet, ids] of facets) {
    const d = dupes(ids);
    if (d.length) throw new Error(`ontology: duplicate ${facet} ids: ${d.join(', ')}`);
  }

  const bindingIds = new Set(o.bindingness.map((b) => b.id));
  for (const k of o.normKinds) {
    if (!bindingIds.has(k.bindingnessDefault)) {
      throw new Error(`ontology: normKind '${k.id}' bindingnessDefault '${k.bindingnessDefault}' not in bindingness set`);
    }
  }
  const relIds = new Set(o.relationTypes.map((r) => r.id));
  for (const r of o.relationTypes) {
    if (r.inverseOf && !relIds.has(r.inverseOf)) {
      throw new Error(`ontology: relation '${r.id}' inverseOf '${r.inverseOf}' does not exist`);
    }
  }
}

// ─── (2) Ingestion / suggestion boundary ────────────────────────────

/** Build a `string`-schema that only accepts values present in `ids`. */
export function makeMemberSchema(ids: readonly string[], facet: string): z.ZodType<string> {
  const set = new Set(ids);
  return z.string().refine((v) => set.has(v), {
    message: `value not in ontology facet '${facet}'`,
  });
}

const kindIds = NORM_ONTOLOGY.normKinds.map((k) => k.id);
const bindingIds = NORM_ONTOLOGY.bindingness.map((b) => b.id);
const relationIds = NORM_ONTOLOGY.relationTypes.map((r) => r.id);
const partyRoleIds = NORM_ONTOLOGY.partyRoles.map((p) => p.id);
const sourceIds = NORM_ONTOLOGY.normSources.map((s) => s.id);

export const NormKindSchema = makeMemberSchema(kindIds, 'normKinds');
export const BindingnessSchema = makeMemberSchema(bindingIds, 'bindingness');
export const RelationTypeSchema = makeMemberSchema(relationIds, 'relationTypes');
export const PartyRoleSchema = makeMemberSchema(partyRoleIds, 'partyRoles');
export const NormSourceSchema = makeMemberSchema(sourceIds, 'normSources');

/**
 * Only relation types the LLM path may PROPOSE (derivation === 'inferred').
 * Metadata edges (AMENDS, REPEALS, …) come from the parser and must be rejected
 * here — the THE-433 AC-5 boundary. Returns true if `id` is an inferred relation.
 */
export function isInferredRelation(id: string): boolean {
  const rel = NORM_ONTOLOGY.relationTypes.find((r) => r.id === id);
  return rel?.derivation === 'inferred';
}
