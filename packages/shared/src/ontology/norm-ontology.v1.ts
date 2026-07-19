/**
 * E6 Norm-Ontology — canonical reference data (ADR-0004 E6/E7/E8-R5).
 *
 * SOURCE OF TRUTH for the *allowed values* of norm typing + cross-norm relations.
 * The core schema stores `string` (ADR-0004 E6: "nicht als TS-Enum am Kern"); the
 * values below are DATA, validated at the ingestion/suggestion boundary via
 * `norm-ontology.schema.ts`. Adding a law, scheme or relation = an edit to THIS
 * file + a CHANGELOG entry + a semver bump — no core code edit, no enum change.
 *
 * Contract: docs/superpowers/plans/2026-07-07-e6-ontology-file-contract.md
 * Linear:   THE-429 (this file) · THE-390 P1 (consumes as string-stub target)
 *
 * `as const` is deliberate: it makes the id-unions derivable for free (see index.ts)
 * and keeps the review diff readable. The OntoLearner export (index.ts) serialises
 * this same object — there is no second store.
 */
export const NORM_ONTOLOGY = {
  ontologyVersion: '1.4.0',
  updatedAt: '2026-07-12',

  /** E6 — kind of norm. `bindingnessDefault` is a hint, overridable per norm. */
  normKinds: [
    { id: 'legislation', label: 'Legislation', bindingnessDefault: 'binding' },
    { id: 'implementing_act', label: 'Implementing Act', bindingnessDefault: 'binding' },
    { id: 'delegated_act', label: 'Delegated Act', bindingnessDefault: 'binding' },
    { id: 'technical_standard', label: 'Technical Standard', bindingnessDefault: 'voluntary-de-facto' },
    { id: 'guideline', label: 'Guideline', bindingnessDefault: 'persuasive' },
    { id: 'trust_framework', label: 'Trust Framework', bindingnessDefault: 'voluntary-de-facto' },
    { id: 'court_decision', label: 'Court Decision', bindingnessDefault: 'binding' },
    { id: 'executive_order', label: 'Executive Order', bindingnessDefault: 'binding-for-agencies' },
    // THE-417: kinds the norm facade already produces for upload-world norms
    // (kindFromStandardType) — data rows, not code special-cases.
    { id: 'framework', label: 'Architecture/Management Framework', bindingnessDefault: 'voluntary-de-facto' },
    { id: 'custom', label: 'User-curated / Custom', bindingnessDefault: 'voluntary-de-facto' },
  ],

  /** E6 — how binding a norm is (orthogonal to kind). */
  bindingness: [
    { id: 'binding', label: 'Binding' },
    { id: 'binding-for-agencies', label: 'Binding for agencies' },
    { id: 'voluntary-de-facto', label: 'Voluntary / de-facto' },
    { id: 'persuasive', label: 'Persuasive' },
  ],

  /**
   * E6 — deontic force of a provision (the von-Wright triple). Orthogonal to
   * `bindingness` (which is about the *norm's* authority) — this is about what a
   * single provision DOES to its addressee. Closed label space for term typing
   * (THE-432); deliberately minimal (highest inter-annotator agreement). Finer
   * functional kinds (exemption/notification/…) are additive rows if needed.
   */
  obligationKinds: [
    { id: 'obligation', label: 'Obligation / Gebot' },
    { id: 'prohibition', label: 'Prohibition / Verbot' },
    { id: 'permission', label: 'Permission / Erlaubnis' },
  ],

  /**
   * E7 — cross-norm relation types.
   * `derivation` is the boundary contract between the deterministic parser path
   * and the LLM-suggestion path (THE-433 AC-5): 'metadata' edges come from
   * ELI/CELLAR and MUST NOT be produced by an LLM; 'inferred' edges are the
   * text-dependent ones the RE pipeline may suggest (human-confirmed).
   */
  relationTypes: [
    { id: 'AMENDS', label: 'amends', derivation: 'metadata', directed: true },
    { id: 'CONSOLIDATES', label: 'consolidates', derivation: 'metadata', directed: true },
    { id: 'REPEALS', label: 'repeals', derivation: 'metadata', directed: true },
    { id: 'CITES', label: 'cites', derivation: 'metadata', directed: true },
    { id: 'TRANSPOSES', label: 'transposes', derivation: 'inferred', directed: true },
    { id: 'IMPLEMENTS', label: 'implements', derivation: 'inferred', directed: true },
    { id: 'CONCRETIZES', label: 'concretizes', derivation: 'inferred', directed: true },
    { id: 'DEROGATED_BY', label: 'derogated by', derivation: 'inferred', directed: true, inverseOf: 'PREVAILS_OVER' },
    { id: 'PREVAILS_OVER', label: 'prevails over', derivation: 'inferred', directed: true, inverseOf: 'DEROGATED_BY' },
    { id: 'SETS_PARAMETER', label: 'sets parameter', derivation: 'inferred', directed: true },
    { id: 'RECOGNIZES_EQUIVALENCE', label: 'recognizes equivalence', derivation: 'inferred', directed: true },
    { id: 'INTERPRETS', label: 'interprets', derivation: 'inferred', directed: true },
  ],

  /** E8 — addressee roles (GDPR / AI Act et al.). */
  partyRoles: [
    { id: 'controller', label: 'Controller / Verantwortlicher', origin: 'gdpr' },
    { id: 'processor', label: 'Processor / Auftragsverarbeiter', origin: 'gdpr' },
    { id: 'data_subject', label: 'Data Subject / Betroffene Person', origin: 'gdpr' },
    { id: 'provider', label: 'Provider / Anbieter', origin: 'ai-act' },
    { id: 'deployer', label: 'Deployer / Betreiber', origin: 'ai-act' },
    { id: 'importer', label: 'Importer / Einführer', origin: 'ai-act' },
    { id: 'distributor', label: 'Distributor / Händler', origin: 'ai-act' },
    { id: 'authorized_representative', label: 'Authorized Representative', origin: 'ai-act' },
    { id: 'supervisory_authority', label: 'Supervisory Authority / Aufsichtsbehörde', origin: 'cross' },
  ],

  /**
   * E6 — per-SDO maturity scales (ordered stages). The applicable scale depends
   * on the norm's source/SDO; stored per norm as a `string` validated against
   * the relevant scale's `stages`.
   */
  maturityScales: [
    { id: 'w3c', label: 'W3C Recommendation Track', stages: ['WD', 'CR', 'PR', 'REC'] },
    { id: 'ietf', label: 'IETF', stages: ['internet-draft', 'RFC'] },
    { id: 'iso', label: 'ISO edition-based', stages: ['CD', 'DIS', 'FDIS', 'published'] },
    { id: 'eu-legislative', label: 'EU legislative', stages: ['proposal', 'adopted', 'in_force', 'repealed'] },
  ],

  /**
   * E6 — jurisdictions with a per-jurisdiction lifecycle state machine (as DATA).
   * CH carries the ADR showcase: `referendum_passed` = erwahrt, angenommen aber
   * noch nicht in Kraft (BGEID). Extensible to US states / cantons via `parent`.
   */
  jurisdictions: [
    { id: 'EU', label: 'European Union', lifecycle: ['proposal', 'adopted', 'in_force', 'repealed'] },
    { id: 'DE', label: 'Germany', lifecycle: ['referentenentwurf', 'regierungsentwurf', 'verkuendet', 'in_force', 'aufgehoben'] },
    { id: 'AT', label: 'Austria', lifecycle: ['entwurf', 'beschlossen', 'in_force', 'aufgehoben'] },
    { id: 'CH', label: 'Switzerland', lifecycle: ['consultation', 'adopted', 'referendum_passed', 'validated', 'in_force', 'repealed'] },
  ],

  /**
   * THE-417 (DELTA-4): expression languages as data — collapse target for the
   * closed RegulationLanguage TS union + the Mongoose `enum:` de/en model
   * fields. A new corpus language = a row here, no code edit.
   */
  languages: [
    { id: 'de', label: 'Deutsch' },
    { id: 'en', label: 'English' },
  ],

  /**
   * E8-R5 — assurance schemes + their axes (ontology-validated strings, NOT
   * closed TS unions). A fourth/fifth scheme (Singpass, TDIF, PCTF) is an entry
   * here, not a core edit.
   */
  assuranceSchemes: [
    { id: 'eidas', label: 'eIDAS Level of Assurance', axes: [{ id: 'loa', levels: ['low', 'substantial', 'high'] }] },
    {
      id: 'nist-800-63',
      label: 'NIST SP 800-63',
      axes: [
        { id: 'ial', levels: ['IAL1', 'IAL2', 'IAL3'] },
        { id: 'aal', levels: ['AAL1', 'AAL2', 'AAL3'] },
        { id: 'fal', levels: ['FAL1', 'FAL2', 'FAL3'] },
      ],
    },
    { id: 'uk-gpg45', label: 'UK GPG 45', axes: [{ id: 'confidence', levels: ['low', 'medium', 'high', 'very-high'] }] },
  ],

  /**
   * E6 source registry — the collapse target for the triplicated `RegulationSource`
   * enum (shared/compliance.types.ts, server/Regulation.ts, crawler/regulation.model.ts).
   * THE-396 (AI Act / Data Act) is the regression proof: they are DATA rows here,
   * not enum edits. CANON-001.1 owns the ingestion-registry *wiring*; this file
   * provides the reference-data it reads.
   */
  normSources: [
    { id: 'nis2', label: 'NIS2 Directive (EU) 2022/2555', jurisdiction: 'EU' },
    { id: 'dora', label: 'DORA (EU) 2022/2554', jurisdiction: 'EU' },
    { id: 'dsgvo', label: 'GDPR / DSGVO', jurisdiction: 'EU' },
    { id: 'lksg', label: 'Lieferkettensorgfaltspflichtengesetz', jurisdiction: 'DE' },
    // AI Act / Data Act are split per language (en/de rows) because the canonical
    // regulationKey is `source:paragraph`; a shared key would let the DE crawl
    // overwrite the EN one on upsert (mirrors the dsgvo=de / nis2=en pattern).
    { id: 'ai-act-en', label: 'AI Act (EU) 2024/1689 — English', jurisdiction: 'EU' },
    { id: 'ai-act-de', label: 'KI-Verordnung (EU) 2024/1689 — Deutsch', jurisdiction: 'EU' },
    { id: 'data-act-en', label: 'Data Act (EU) 2023/2854 — English', jurisdiction: 'EU' },
    { id: 'data-act-de', label: 'Datenverordnung (EU) 2023/2854 — Deutsch', jurisdiction: 'EU' },
    // THE-511: language completeness — a DE-only law scores poorly against an EN
    // architecture profile (cross-lingual retrieval gap, proven on the DSGVO
    // blindspot 2026-07-19). Adds the missing language for the demo laws.
    { id: 'dsgvo-en', label: 'GDPR (EU) 2016/679 — English', jurisdiction: 'EU' },
    { id: 'nis2-de', label: 'NIS2-Richtlinie (EU) 2022/2555 — Deutsch', jurisdiction: 'EU' },
    { id: 'dora-de', label: 'DORA (EU) 2022/2554 — Deutsch', jurisdiction: 'EU' },
    // THE-511: rule-less laws — the corpus-discovery value of UC-LAW-002 (laws
    // Stage-A rules do NOT cover). DE+EN each (regulationKey = source:paragraph).
    { id: 'cra-en', label: 'Cyber Resilience Act (EU) 2024/2847 — English', jurisdiction: 'EU' },
    { id: 'cra-de', label: 'Cyber Resilience Act (EU) 2024/2847 — Deutsch', jurisdiction: 'EU' },
    { id: 'mdr-en', label: 'Medical Device Regulation (EU) 2017/745 — English', jurisdiction: 'EU' },
    { id: 'mdr-de', label: 'Medizinprodukte-Verordnung (EU) 2017/745 — Deutsch', jurisdiction: 'EU' },
    { id: 'psd2-en', label: 'Payment Services Directive 2 (EU) 2015/2366 — English', jurisdiction: 'EU' },
    { id: 'psd2-de', label: 'Zahlungsdiensterichtlinie 2 (EU) 2015/2366 — Deutsch', jurisdiction: 'EU' },
    { id: 'eprivacy-en', label: 'ePrivacy Directive 2002/58/EC — English', jurisdiction: 'EU' },
    { id: 'eprivacy-de', label: 'ePrivacy-Richtlinie 2002/58/EG — Deutsch', jurisdiction: 'EU' },
    { id: 'eidas-en', label: 'eIDAS Regulation (EU) 910/2014 — English', jurisdiction: 'EU' },
    { id: 'eidas-de', label: 'eIDAS-Verordnung (EU) 910/2014 — Deutsch', jurisdiction: 'EU' },
    { id: 'iso27001', label: 'ISO/IEC 27001' },
    // THE-413: PolicySource collapse — modeling-framework sources become data
    // rows so Policy.source validates against the same registry as regulations.
    { id: 'togaf', label: 'TOGAF Standard (The Open Group)' },
    { id: 'archimate', label: 'ArchiMate Specification (The Open Group)' },
    { id: 'custom', label: 'User-curated' },
  ],
} as const;

export type NormOntology = typeof NORM_ONTOLOGY;
