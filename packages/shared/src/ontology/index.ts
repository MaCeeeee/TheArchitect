/**
 * E6 Norm-Ontology — public surface (ADR-0004 E6/E7/E8-R5).
 *
 * Consumers (server ingestion/typing, crawler, UI) import from here. The core
 * schema fields stay `string`; the `*_ID` sets + `*Schema` validators below are
 * how a `string` is checked against the ontology at the write boundary.
 *
 * The `…Id` types are convenience literal unions DERIVED from the data — for
 * authoring/UI autocomplete only. They are NOT the persisted field type
 * (that stays `string`, ADR-0004 E6). Do not use them as core schema fields.
 */
import { NORM_ONTOLOGY } from './norm-ontology.v1';

export { NORM_ONTOLOGY } from './norm-ontology.v1';
export type { NormOntology } from './norm-ontology.v1';
export {
  NormOntologySchema,
  assertOntologyValid,
  makeMemberSchema,
  NormKindSchema,
  BindingnessSchema,
  ObligationKindSchema,
  RelationTypeSchema,
  PartyRoleSchema,
  NormSourceSchema,
  LanguageSchema,
  isInferredRelation,
} from './norm-ontology.schema';

// ─── Derived allowed-value sets (data-driven — no hand-maintained enum) ──
export const NORM_KIND_IDS = NORM_ONTOLOGY.normKinds.map((k) => k.id);
export const BINDINGNESS_IDS = NORM_ONTOLOGY.bindingness.map((b) => b.id);
export const OBLIGATION_KIND_IDS = NORM_ONTOLOGY.obligationKinds.map((o) => o.id);
export const RELATION_TYPE_IDS = NORM_ONTOLOGY.relationTypes.map((r) => r.id);
export const PARTY_ROLE_IDS = NORM_ONTOLOGY.partyRoles.map((p) => p.id);
export const NORM_SOURCE_IDS = NORM_ONTOLOGY.normSources.map((s) => s.id);
export const JURISDICTION_IDS = NORM_ONTOLOGY.jurisdictions.map((j) => j.id);
export const LANGUAGE_IDS = NORM_ONTOLOGY.languages.map((l) => l.id);

// ─── O(1) write-boundary membership checks (THE-413) ─────────────────
// Mongoose validators + route gates call these instead of hand-maintained
// enum arrays. New source/jurisdiction = ontology data row, nothing else.
const NORM_SOURCE_ID_SET = new Set<string>(NORM_SOURCE_IDS);
const JURISDICTION_ID_SET = new Set<string>(JURISDICTION_IDS);
const LANGUAGE_ID_SET = new Set<string>(LANGUAGE_IDS);
const NORM_KIND_ID_SET = new Set<string>(NORM_KIND_IDS);
const OBLIGATION_KIND_ID_SET = new Set<string>(OBLIGATION_KIND_IDS);
export const isNormSource = (v: string): boolean => NORM_SOURCE_ID_SET.has(v);
export const isJurisdiction = (v: string): boolean => JURISDICTION_ID_SET.has(v);
export const isLanguage = (v: string): boolean => LANGUAGE_ID_SET.has(v);
export const isNormKind = (v: string): boolean => NORM_KIND_ID_SET.has(v);
export const isObligationKind = (v: string): boolean => OBLIGATION_KIND_ID_SET.has(v);

// ─── Derived convenience literal unions (authoring/UI only) ──────────
export type NormKindId = (typeof NORM_ONTOLOGY.normKinds)[number]['id'];
export type BindingnessId = (typeof NORM_ONTOLOGY.bindingness)[number]['id'];
export type ObligationKindId = (typeof NORM_ONTOLOGY.obligationKinds)[number]['id'];
export type RelationTypeId = (typeof NORM_ONTOLOGY.relationTypes)[number]['id'];
export type PartyRoleId = (typeof NORM_ONTOLOGY.partyRoles)[number]['id'];
export type NormSourceId = (typeof NORM_ONTOLOGY.normSources)[number]['id'];
export type JurisdictionId = (typeof NORM_ONTOLOGY.jurisdictions)[number]['id'];
export type LanguageId = (typeof NORM_ONTOLOGY.languages)[number]['id'];

// ─── OntoLearner export (THE-429 AC-3) ──────────────────────────────

export interface OntoLearnerExport {
  ontologyId: 'thearchitect-norm';
  version: string;
  /** Term-typing type space, by facet. */
  termTypes: {
    normKind: string[];
    bindingness: string[];
    obligationKind: string[];
    partyRole: string[];
  };
  /** Non-taxonomic relation vocabulary R (paper §4.3). */
  nonTaxonomicRelations: string[];
  /**
   * Taxonomic (is-a) pairs. The norm hierarchy is per-norm AKN-@eId structure
   * (ADR-0004 E2, deterministic) and is NOT part of the vocabulary — hence
   * empty in the vocabulary export. Kept for OntoLearner shape-compatibility.
   */
  taxonomy: Array<[string, string]>;
}

/**
 * Serialise the ontology into an OntoLearner-loadable shape (pure TS, no Python
 * in the server path). Offline benchmarking (THE-430) loads this JSON. Every id
 * traces back to a `NORM_ONTOLOGY` entry — the roundtrip test asserts coverage.
 */
export function exportForOntoLearner(ontology = NORM_ONTOLOGY): OntoLearnerExport {
  return {
    ontologyId: 'thearchitect-norm',
    version: ontology.ontologyVersion,
    termTypes: {
      normKind: ontology.normKinds.map((k) => k.id),
      bindingness: ontology.bindingness.map((b) => b.id),
      obligationKind: ontology.obligationKinds.map((o) => o.id),
      partyRole: ontology.partyRoles.map((p) => p.id),
    },
    nonTaxonomicRelations: ontology.relationTypes.map((r) => r.id),
    taxonomy: [],
  };
}
