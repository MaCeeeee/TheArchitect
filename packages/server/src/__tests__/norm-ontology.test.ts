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
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.1.0');
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
