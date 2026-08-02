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
  ProvisionKindSchema,
  RelationTypeSchema,
  PartyRoleSchema,
  CanonicalActionSchema,
  NormSourceSchema,
  LanguageSchema,
  isInferredRelation,
  isMechanicalRelation,
} from './norm-ontology.schema';

// ─── Derived allowed-value sets (data-driven — no hand-maintained enum) ──
export const NORM_KIND_IDS = NORM_ONTOLOGY.normKinds.map((k) => k.id);
export const BINDINGNESS_IDS = NORM_ONTOLOGY.bindingness.map((b) => b.id);
export const OBLIGATION_KIND_IDS = NORM_ONTOLOGY.obligationKinds.map((o) => o.id);
export const PROVISION_KIND_IDS = NORM_ONTOLOGY.provisionKinds.map((p) => p.id);
export const RELATION_TYPE_IDS = NORM_ONTOLOGY.relationTypes.map((r) => r.id);
export const PARTY_ROLE_IDS = NORM_ONTOLOGY.partyRoles.map((p) => p.id);
export const CANONICAL_ACTION_IDS = NORM_ONTOLOGY.canonicalActions.map((a) => a.id);
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
const PROVISION_KIND_ID_SET = new Set<string>(PROVISION_KIND_IDS);
const CANONICAL_ACTION_ID_SET = new Set<string>(CANONICAL_ACTION_IDS);
export const isNormSource = (v: string): boolean => NORM_SOURCE_ID_SET.has(v);
export const isJurisdiction = (v: string): boolean => JURISDICTION_ID_SET.has(v);
export const isLanguage = (v: string): boolean => LANGUAGE_ID_SET.has(v);
export const isNormKind = (v: string): boolean => NORM_KIND_ID_SET.has(v);
export const isObligationKind = (v: string): boolean => OBLIGATION_KIND_ID_SET.has(v);
export const isProvisionKind = (v: string): boolean => PROVISION_KIND_ID_SET.has(v);
/** Bezugsgröße der Harmonisierung (THE-438) — Schreibgrenze wie die übrigen Facetten. */
export const isCanonicalAction = (v: string): boolean => CANONICAL_ACTION_ID_SET.has(v);

export type Displacement = (typeof NORM_ONTOLOGY.displacements)[number];

/** Alle Verdrängungs-Kanten (lex specialis). ADR-0007 E6. */
export const DISPLACEMENTS: readonly Displacement[] = NORM_ONTOLOGY.displacements;

/**
 * Wird `displacedSource` für einen Adressaten dieser Klasse verdrängt?
 *
 * `null` heißt „keine Verdrängung" — beide Normen gelten nebeneinander. Der
 * Treffer trägt die Zitate mit: eine Verdrängung ohne Begründung ist für ein
 * Audit wertlos.
 *
 * Bewusst adressaten-scharf: DORA verdrängt NIS2 nur für Finanzunternehmen.
 * Eine wesentliche Einrichtung ohne Finanzaufsicht bleibt unter NIS2, und die
 * DSGVO wird gar nicht verdrängt — sie gilt daneben (DORA ErwG 16).
 */
export function findDisplacement(displacedSource: string, addresseeClass: string): Displacement | null {
  return (
    DISPLACEMENTS.find(
      (d) => d.displaced.source === displacedSource && d.addresseeClass === addresseeClass,
    ) ?? null
  );
}

const PARTY_ROLE_ID_SET = new Set<string>(PARTY_ROLE_IDS);
/** Ist der Wert eine Adressatenklasse der Ontologie? (THE-545) */
export const isPartyRole = (v: string): boolean => PARTY_ROLE_ID_SET.has(v);

// ─── Derived convenience literal unions (authoring/UI only) ──────────
export type NormKindId = (typeof NORM_ONTOLOGY.normKinds)[number]['id'];
export type BindingnessId = (typeof NORM_ONTOLOGY.bindingness)[number]['id'];
export type ObligationKindId = (typeof NORM_ONTOLOGY.obligationKinds)[number]['id'];
export type ProvisionKindId = (typeof NORM_ONTOLOGY.provisionKinds)[number]['id'];
export type RelationTypeId = (typeof NORM_ONTOLOGY.relationTypes)[number]['id'];
export type PartyRoleId = (typeof NORM_ONTOLOGY.partyRoles)[number]['id'];
export type CanonicalActionId = (typeof NORM_ONTOLOGY.canonicalActions)[number]['id'];
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
    provisionKind: string[];
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
      provisionKind: ontology.provisionKinds.map((p) => p.id),
      partyRole: ontology.partyRoles.map((p) => p.id),
    },
    nonTaxonomicRelations: ontology.relationTypes.map((r) => r.id),
    taxonomy: [],
  };
}

// ── THE-548: Anwendbarkeitsprofil des Unternehmens ─────────────────────────
// Die Kundenseite zur Norm-Seite oben — und der erste Produktaufrufer von
// `findDisplacement`.
export {
  assessNormApplicability,
  validateLegalProfile,
} from './legal-profile';
export type {
  LegalProfile,
  NormDescriptor,
  LegalApplicabilityState,
  LegalApplicabilityAssessment,
} from './legal-profile';
