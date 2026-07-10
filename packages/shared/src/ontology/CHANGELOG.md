# Norm-Ontology — CHANGELOG

Versioned reference-data (ADR-0004 E6). Every change is a PR with an entry here and
a semver bump of `ontologyVersion` in `norm-ontology.v1.ts`. AI-suggestion records
and traces carry the `ontologyVersion` they were produced against (THE-384 join).

**Bump rules:** additive value (new id) → MINOR · rename/remove (breaking) → MAJOR +
migration note · label/metadata-only fix → PATCH.

## 1.0.0 — 2026-07-07 (THE-429)

Initial ontology. Seeds the E6/E7/E8-R5 vocabularies from ADR-0004:

- **normKinds** (8): legislation, implementing_act, delegated_act, technical_standard,
  guideline, trust_framework, court_decision, executive_order.
- **bindingness** (4): binding, binding-for-agencies, voluntary-de-facto, persuasive.
- **relationTypes** (12, E7) with `derivation` (metadata|inferred) — the parser-vs-LLM
  boundary (THE-433 AC-5). Metadata: AMENDS, CONSOLIDATES, REPEALS, CITES. Inferred:
  TRANSPOSES, IMPLEMENTS, CONCRETIZES, DEROGATED_BY, PREVAILS_OVER, SETS_PARAMETER,
  RECOGNIZES_EQUIVALENCE, INTERPRETS.
- **partyRoles** (9): GDPR + AI Act addressee roles.
- **maturityScales** (4): W3C, IETF, ISO, EU-legislative.
- **jurisdictions** (4): EU, DE, AT, CH — CH carries the full lifecycle incl.
  `referendum_passed` (BGEID showcase).
- **assuranceSchemes** (3, E8-R5): eIDAS (LoA), NIST SP 800-63 (IAL/AAL/FAL), UK GPG 45.
- **normSources** (10): collapse target for the triplicated `RegulationSource` enum;
  AI Act / Data Act (THE-396) present as data rows, proving "new law = data, not code".

## 1.1.0 — 2026-07-09 (THE-413)
- normSources: + `togaf`, + `archimate` (PolicySource enum collapse; The Open Group framework sources become registry data). Additive — no id changed or removed.

## 1.2.0 — 2026-07-10 (THE-417)
- **languages** (2, new facet): `de`, `en` — collapse target for the closed `RegulationLanguage` TS union + the `enum: ['de','en']` model fields (Regulation, crawler Regulation).
- normKinds: + `framework`, + `custom` — the two kinds `kindFromStandardType` (norm.service.ts) already produces for upload-world norms that were missing from the ontology. Additive — no id changed or removed.
