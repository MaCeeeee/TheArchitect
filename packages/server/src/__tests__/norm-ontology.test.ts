/**
 * THE-429 — E6 Norm-Ontology file: validity, ingestion boundary, OntoLearner export.
 * Lives here because shared has no test runner; imports the built @thearchitect/shared.
 */
import {
  NORM_ONTOLOGY,
  NORM_KIND_IDS,
  RELATION_TYPE_IDS,
  NORM_SOURCE_IDS,
  assertOntologyValid,
  NormKindSchema,
  RelationTypeSchema,
  isInferredRelation,
  exportForOntoLearner,
  isNormSource,
  isJurisdiction,
  LANGUAGE_IDS,
  isLanguage,
  isNormKind,
  OBLIGATION_KIND_IDS,
  isObligationKind,
  ObligationKindSchema,
  PROVISION_KIND_IDS,
  isProvisionKind,
  ProvisionKindSchema,
} from '@thearchitect/shared';

describe('E6 Norm-Ontology (THE-429)', () => {
  // AC-1 foundation: the shipped file is well-formed + internally consistent.
  it('ships a valid, self-consistent ontology', () => {
    expect(() => assertOntologyValid()).not.toThrow();
    expect(NORM_ONTOLOGY.ontologyVersion).toMatch(/^\d+\.\d+\.\d+$/); // AC-4: semver present
  });

  // AC-1 / ingestion boundary: string validated against the file, OOV rejected.
  it('accepts in-ontology values and drops out-of-vocabulary ones', () => {
    expect(NormKindSchema.safeParse('legislation').success).toBe(true);
    expect(NormKindSchema.safeParse('not_a_kind').success).toBe(false);
    expect(RelationTypeSchema.safeParse('DEROGATED_BY').success).toBe(true);
    expect(RelationTypeSchema.safeParse('INVENTED_REL').success).toBe(false);
  });

  // AC-2: allowed sets are DERIVED from data, not a hand-maintained enum —
  // adding a row changes the set with no code edit.
  it('derives allowed-value sets from the data (no parallel enum)', () => {
    expect(NORM_KIND_IDS).toEqual(NORM_ONTOLOGY.normKinds.map((k) => k.id));
    expect(RELATION_TYPE_IDS.length).toBe(NORM_ONTOLOGY.relationTypes.length);
    // THE-396 regression: AI Act / Data Act are data rows, not enum values.
    const sources = NORM_ONTOLOGY.normSources.map((s) => s.id);
    expect(sources).toEqual(expect.arrayContaining(['ai-act-en', 'ai-act-de', 'data-act-en', 'data-act-de']));
  });

  // THE-433 AC-5 boundary contract: parser-derived edges are not LLM-proposable.
  it('separates metadata (parser) from inferred (LLM) relations', () => {
    expect(isInferredRelation('AMENDS')).toBe(false); // ELI/CELLAR metadata
    expect(isInferredRelation('REPEALS')).toBe(false);
    expect(isInferredRelation('DEROGATED_BY')).toBe(true); // text-inferred, human-confirmed
    expect(isInferredRelation('INTERPRETS')).toBe(true);
  });

  // AC-3: OntoLearner export is JSON-roundtrippable and covers every vocabulary id.
  it('exports an OntoLearner-loadable dataset that roundtrips', () => {
    const exported = exportForOntoLearner();
    const roundtripped = JSON.parse(JSON.stringify(exported));
    expect(roundtripped).toEqual(exported);

    expect(roundtripped.version).toBe(NORM_ONTOLOGY.ontologyVersion);
    expect(roundtripped.termTypes.normKind).toEqual(NORM_ONTOLOGY.normKinds.map((k) => k.id));
    expect(roundtripped.nonTaxonomicRelations).toEqual(NORM_ONTOLOGY.relationTypes.map((r) => r.id));
    // Norm hierarchy is per-norm @eId (ADR-0004 E2), not vocabulary taxonomy.
    expect(roundtripped.taxonomy).toEqual([]);
  });

  // Guard the consistency checks actually bite (a broken clone must fail).
  it('rejects an inconsistent ontology', () => {
    const broken = {
      ...NORM_ONTOLOGY,
      normKinds: [{ id: 'x', label: 'X', bindingnessDefault: 'no-such-bindingness' }],
    };
    expect(() => assertOntologyValid(broken)).toThrow();
  });
});

describe('source registry (THE-413)', () => {
  it('covers every legacy RegulationSource and PolicySource value as data', () => {
    const legacyRegulationSources = [
      'nis2', 'lksg', 'dsgvo', 'dora', 'iso27001',
      'ai-act-en', 'ai-act-de', 'data-act-en', 'data-act-de', 'custom',
    ];
    const legacyPolicySources = ['custom', 'dora', 'nis2', 'togaf', 'archimate', 'iso27001'];
    for (const s of [...legacyRegulationSources, ...legacyPolicySources]) {
      expect(NORM_SOURCE_IDS).toContain(s);
    }
  });

  it('bumped ontologyVersion for the additive rows', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.5.0');
  });

  it('isNormSource accepts ontology rows, rejects everything else', () => {
    expect(isNormSource('nis2')).toBe(true);
    expect(isNormSource('togaf')).toBe(true);
    expect(isNormSource('not-a-source')).toBe(false);
    expect(isNormSource('')).toBe(false);
  });

  it('isJurisdiction accepts ontology jurisdictions, rejects everything else', () => {
    expect(isJurisdiction('EU')).toBe(true);
    expect(isJurisdiction('CH')).toBe(true);
    expect(isJurisdiction('XX')).toBe(false);
  });
});

describe('languages facet + kind coverage (THE-417)', () => {
  it('languages facet covers the legacy RegulationLanguage values', () => {
    expect(LANGUAGE_IDS).toEqual(expect.arrayContaining(['de', 'en']));
  });
  it('isLanguage: membership + exact-case', () => {
    expect(isLanguage('de')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage('DE')).toBe(false);
    expect(isLanguage('')).toBe(false);
  });
  it('every kind the norm facade produces is an ontology normKind', () => {
    // kindFromStandardType produces: technical_standard/framework/custom/…;
    // kindFromCorpusSource produces: technical_standard/legislation.
    for (const k of ['legislation', 'technical_standard', 'framework', 'custom']) {
      expect(NORM_KIND_IDS).toContain(k);
      expect(isNormKind(k)).toBe(true);
    }
  });
  it('bumped to 1.2.0', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.5.0');
  });
});

describe('obligationKinds facet (THE-430 / THE-432)', () => {
  it('ships the deontic triple as the closed typing label space', () => {
    expect(OBLIGATION_KIND_IDS).toEqual(['obligation', 'prohibition', 'permission']);
  });
  it('isObligationKind: membership + OOV rejection (exact case)', () => {
    expect(isObligationKind('obligation')).toBe(true);
    expect(isObligationKind('prohibition')).toBe(true);
    expect(isObligationKind('duty')).toBe(false);
    expect(isObligationKind('Obligation')).toBe(false);
    expect(isObligationKind('')).toBe(false);
  });
  it('ObligationKindSchema gates ingested/suggested values', () => {
    expect(ObligationKindSchema.safeParse('permission').success).toBe(true);
    expect(ObligationKindSchema.safeParse('exemption').success).toBe(false);
  });
  it('OntoLearner export covers the obligationKind facet', () => {
    const exported = exportForOntoLearner();
    expect(exported.termTypes.obligationKind).toEqual(OBLIGATION_KIND_IDS);
  });
});

describe('provisionKinds facet (THE-421 G-0)', () => {
  it('ships the closed provision-kind space', () => {
    expect(PROVISION_KIND_IDS).toEqual([
      'scope-applicability', 'definition', 'obligation',
      'enforcement-supervision', 'procedural', 'other',
    ]);
  });
  it('accepts in-ontology values and rejects OOV + wrong case', () => {
    expect(isProvisionKind('scope-applicability')).toBe(true);
    expect(isProvisionKind('Scope-Applicability')).toBe(false);
    expect(isProvisionKind('nonsense')).toBe(false);
  });
  it('ProvisionKindSchema gates membership', () => {
    expect(ProvisionKindSchema.safeParse('obligation').success).toBe(true);
    expect(ProvisionKindSchema.safeParse('obligation ').success).toBe(false);
  });
  it('OntoLearner export covers the new facet', () => {
    expect(exportForOntoLearner().termTypes.provisionKind).toEqual(PROVISION_KIND_IDS);
  });
  it('ontology version is bumped', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.5.0');
  });
});
