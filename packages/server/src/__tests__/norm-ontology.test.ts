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
  isMechanicalRelation,
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
  PARTY_ROLE_IDS,
  PartyRoleSchema,
  findDisplacement,
  DISPLACEMENTS,
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

  // THE-433 AC-5 boundary contract, extended by THE-529: three derivation paths.
  // metadata = parser (ELI/CELLAR), inferred = LLM-proposed, mechanical =
  // deterministic detector (INTERPRETS via interpretsAudit.ts) — never the LLM.
  it('separates metadata (parser) from inferred (LLM) from mechanical (detector) relations', () => {
    expect(isInferredRelation('AMENDS')).toBe(false); // ELI/CELLAR metadata
    expect(isInferredRelation('REPEALS')).toBe(false);
    expect(isInferredRelation('DEROGATED_BY')).toBe(true); // text-inferred, human-confirmed
    // THE-529: INTERPRETS left the LLM path — it is mechanical now.
    expect(isInferredRelation('INTERPRETS')).toBe(false);
    expect(isMechanicalRelation('INTERPRETS')).toBe(true);
    expect(isMechanicalRelation('CONCRETIZES')).toBe(false);
    expect(isMechanicalRelation('AMENDS')).toBe(false); // metadata stays metadata
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

  // Versions-agnostisch: der Test prüft, DASS die additiven Zeilen einen Bump
  // hinter sich haben, nicht WELCHE Version gerade ausgeliefert wird. Die eine
  // bewusste Festlegung auf die aktuelle Version steht unten (partyRoles-Block).
  it('bumped ontologyVersion for the additive rows', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(NORM_ONTOLOGY.ontologyVersion).not.toBe('1.0.0');
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
  // Versions-agnostisch (siehe oben): die Facette muss existieren, die konkrete
  // Versionsnummer ist hier nicht der Prüfgegenstand.
  it('bumped past the version that introduced the languages facet', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(NORM_ONTOLOGY.ontologyVersion).not.toBe('1.1.0');
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
  // Versions-agnostisch (siehe „source registry"): geprüft wird der Bump, nicht
  // die Nummer.
  it('ontology version is bumped', () => {
    expect(NORM_ONTOLOGY.ontologyVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(NORM_ONTOLOGY.ontologyVersion).not.toBe('1.4.0');
  });
});

/**
 * THE-421 / THE-430 — Regime-Erweiterung der `partyRole`-Facette.
 *
 * Anlass: Der Zwei-Prüfer-Lauf ergab auf `partyRole` Kappa 0,597 (Tor: 0,6). Die
 * Analyse der 24 Abweichungen zeigte KEINE unklare Rubrik, sondern eine Lücke im
 * Werteraum: Für eine NIS2- oder DORA-Vorschrift passte weder das DSGVO- noch das
 * KI-VO-Vokabular, also griffen die Prüfer zu beliebig verschiedenen Ersatzrollen.
 * Diese Tests halten den erweiterten Raum + seine Reihenfolge fest.
 *
 * THE-515 (1.7.0) setzt das fort: vier weitere belegte Adressaten, weil `partyRole`
 * out-of-sample auf 0,668 fiel (Golden v2) — wieder eine Lücke im Werteraum, keine
 * Modellschwäche.
 */
describe('partyRoles facet — Regime-Erweiterung (THE-421 / THE-430 / THE-515)', () => {
  it('ships one addressee role per regulated regime, in the documented order', () => {
    expect(PARTY_ROLE_IDS).toEqual([
      // DSGVO
      'controller', 'processor', 'data_subject',
      // KI-VO
      'provider', 'deployer', 'importer', 'distributor', 'authorized_representative',
      // NIS2 / DORA / CRA / LkSG
      'essential_important_entity', 'financial_entity', 'ict_third_party_provider',
      'manufacturer', 'obligated_enterprise',
      // THE-515 — vier belegte Adressaten (CAB ist regime-übergreifend, aber regulierter Akteur)
      'conformity_assessment_body', 'trust_service_provider', 'data_holder', 'ecs_provider',
      // Nicht-Regulierte (regime-übergreifend) — bleiben die letzten zwei
      'member_state', 'supervisory_authority',
    ]);
    expect(PARTY_ROLE_IDS).toHaveLength(19);
  });

  // Die ECHTE Positions-Invariante (seit 1.6.0): die beiden NICHT-regulierten
  // Akteure schließen die Liste ab. Sie lautet NICHT „alle origin:'cross' zuletzt" —
  // siehe den Test darunter.
  it('keeps member_state and supervisory_authority as the LAST TWO entries', () => {
    expect(PARTY_ROLE_IDS.slice(-2)).toEqual(['member_state', 'supervisory_authority']);
  });

  // Bewusste Ausnahme (THE-515): `conformity_assessment_body` trägt origin 'cross',
  // weil der Akteur in vier Rechtsakten vorkommt — er ist aber ein REGULIERTER
  // Akteur und gehört deshalb zu den Regime-Rollen, nicht ans Listenende. Wer die
  // Sortierung „aufräumt", bricht die Semantik.
  it('places conformity_assessment_body among the regulated roles although its origin is cross', () => {
    const cab = NORM_ONTOLOGY.partyRoles.find((p) => p.id === 'conformity_assessment_body');
    expect(cab?.origin).toBe('cross');
    expect(PARTY_ROLE_IDS.indexOf('conformity_assessment_body')).toBeLessThan(
      PARTY_ROLE_IDS.indexOf('member_state')
    );
    expect(PARTY_ROLE_IDS[PARTY_ROLE_IDS.length - 1]).not.toBe('conformity_assessment_body');
  });

  it('tags every role with its origin regime', () => {
    const origins = NORM_ONTOLOGY.partyRoles.map((p) => p.origin);
    for (const o of origins) expect(o.length).toBeGreaterThan(0);
    expect(origins).toEqual(
      expect.arrayContaining([
        'gdpr', 'ai-act', 'nis2', 'dora', 'cra', 'lksg', 'cross',
        'eidas', 'data-act', 'eprivacy',
      ])
    );
  });

  it('tags the four THE-515 roles with their measured regime of origin', () => {
    const byId = new Map(NORM_ONTOLOGY.partyRoles.map((p) => [p.id as string, p]));
    expect(byId.get('conformity_assessment_body')?.origin).toBe('cross');
    expect(byId.get('trust_service_provider')?.origin).toBe('eidas');
    expect(byId.get('data_holder')?.origin).toBe('data-act');
    expect(byId.get('ecs_provider')?.origin).toBe('eprivacy');
  });

  // Terminologie-Falle: derselbe Akteur heißt je Rechtsakt „Benannte Stelle",
  // „notifizierte Stelle" oder „Konformitätsbewertungsstelle". Das Label muss alle
  // Varianten nennen, sonst ordnet das Modell nach Wortlaut statt nach Akteur zu.
  it('names all terminology variants of the conformity assessment body in its label', () => {
    const cab = NORM_ONTOLOGY.partyRoles.find((p) => p.id === 'conformity_assessment_body');
    expect(cab?.label).toContain('Notified Body');
    expect(cab?.label).toContain('Konformitätsbewertungsstelle');
    expect(cab?.label).toContain('notifizierte');
    expect(cab?.label).toContain('Benannte Stelle');
  });

  it('PartyRoleSchema gates the new ids (membership + exact case)', () => {
    expect(PartyRoleSchema.safeParse('essential_important_entity').success).toBe(true);
    expect(PartyRoleSchema.safeParse('ict_third_party_provider').success).toBe(true);
    expect(PartyRoleSchema.safeParse('obligated_enterprise').success).toBe(true);
    expect(PartyRoleSchema.safeParse('member_state').success).toBe(true);
    expect(PartyRoleSchema.safeParse('Member_State').success).toBe(false);
    expect(PartyRoleSchema.safeParse('essential_entity').success).toBe(false);
  });

  it('PartyRoleSchema accepts the four THE-515 ids and rejects fantasy/wrong-case ones', () => {
    expect(PartyRoleSchema.safeParse('conformity_assessment_body').success).toBe(true);
    expect(PartyRoleSchema.safeParse('trust_service_provider').success).toBe(true);
    expect(PartyRoleSchema.safeParse('data_holder').success).toBe(true);
    expect(PartyRoleSchema.safeParse('ecs_provider').success).toBe(true);
    expect(PartyRoleSchema.safeParse('notified_body').success).toBe(false);
    expect(PartyRoleSchema.safeParse('payment_institution').success).toBe(false);
    expect(PartyRoleSchema.safeParse('Data_Holder').success).toBe(false);
    expect(PartyRoleSchema.safeParse('data_holder ').success).toBe(false);
  });

  it('derives the OntoLearner partyRole facet from the data (no parallel list)', () => {
    expect(exportForOntoLearner().termTypes.partyRole).toEqual(PARTY_ROLE_IDS);
    expect(PARTY_ROLE_IDS).toEqual(NORM_ONTOLOGY.partyRoles.map((p) => p.id));
  });

  it('exports all 19 roles incl. the four new ones to OntoLearner', () => {
    const partyRole = exportForOntoLearner().termTypes.partyRole;
    expect(partyRole).toHaveLength(19);
    expect(partyRole).toEqual(
      expect.arrayContaining([
        'conformity_assessment_body', 'trust_service_provider', 'data_holder', 'ecs_provider',
      ])
    );
  });

  it('pins the shipped ontology version (deliberate gate, mirrors the CHANGELOG)', () => {
    // 1.10.0 — ESG-Rating-VO als normSources (THE-614). Bewusst mit dem CHANGELOG bewegt.
    expect(NORM_ONTOLOGY.ontologyVersion).toBe('1.10.0');
  });
});

/**
 * Verdrängungs-Kanten — v1.9.0 (THE-545, ADR-0007 E6).
 *
 * Die Relationstypen PREVAILS_OVER/DEROGATED_BY existieren seit v1.0 als
 * TYPEN; es gab nur nie eine konkrete Kante. Ohne sie waren am 2026-08-01
 * ZEHN VON SECHZEHN Harmonisierungs-Kandidaten rechtlich gegenstandslos —
 * DORA und NIS2 treffen denselben Adressaten nie gleichzeitig.
 */
describe('displacements facet (THE-545, ADR-0007 E6)', () => {
  it('records DORA-over-NIS2 with citations from BOTH sides', () => {
    const d = DISPLACEMENTS.find((x) => x.id === 'dora-prevails-nis2');
    expect(d).toBeDefined();
    expect(d!.prevailing.source).toBe('dora');
    expect(d!.displaced.source).toBe('nis2');
    expect(d!.addresseeClass).toBe('financial_entity');
    // Beide Seiten der Herleitung: DORA erklaert sich zur lex specialis,
    // NIS2 zieht die Konsequenz und nennt DORA ausdruecklich.
    const cites = d!.citations.join(' ');
    expect(cites).toMatch(/Art\.\s?1\s?Abs\.\s?2/);
    expect(cites).toMatch(/Art\.\s?4/);
  });

  it('findDisplacement fires only for the addressee class recorded on the edge', () => {
    // Dieselbe Klasse, die die Paar-Pruefung die "vorrangige Seite" nennt:
    // die Kante traegt die Klasse, FUER die die Verdraengung beisst.
    expect(findDisplacement('nis2', 'financial_entity')).toBeTruthy();
    // Eine wesentliche Einrichtung, die KEIN Finanzunternehmen ist, bleibt
    // unter NIS2 — die Kante ist adressaten-scharf, kein Pauschalausschluss.
    expect(findDisplacement('nis2', 'essential_important_entity')).toBeNull();
    // Die DSGVO wird nicht verdraengt, sie gilt daneben (DORA ErwG 16).
    expect(findDisplacement('dsgvo', 'financial_entity')).toBeNull();
    // Und die Richtung zaehlt: DORA wird von NIS2 nicht verdraengt.
    expect(findDisplacement('dora', 'financial_entity')).toBeNull();
  });

  it('returns the citation with the hit — an audit needs the WHY', () => {
    const hit = findDisplacement('nis2', 'financial_entity');
    expect(hit!.citations.length).toBeGreaterThanOrEqual(2);
    expect(hit!.scope.length).toBeGreaterThan(5);
  });

  it('reuses the existing PREVAILS_OVER relation type — no new type invented', () => {
    for (const d of DISPLACEMENTS) {
      expect(RELATION_TYPE_IDS).toContain(d.relationType);
    }
  });

  it('references only known sources and party roles', () => {
    for (const d of DISPLACEMENTS) {
      expect(isNormSource(d.prevailing.source)).toBe(true);
      expect(isNormSource(d.displaced.source)).toBe(true);
      expect(PARTY_ROLE_IDS).toContain(d.addresseeClass);
    }
  });

  // Die Verdrängungs-Facette kam mit 1.9.0 und bleibt gültig, während die
  // Ontologie weiterwächst — deshalb eine Untergrenze statt eines zweiten
  // Gleichheits-Tors. Das eigentliche Versions-Tor steht oben (partyRoles) und
  // wandert dort bewusst mit dem CHANGELOG; hier interessiert nur, dass
  // displacements nicht hinter ihren Einführungsstand zurückfallen.
  it('ships displacements from 1.9.0 onwards and keeps the ontology valid', () => {
    const [major, minor] = NORM_ONTOLOGY.ontologyVersion.split('.').map(Number);
    expect(major > 1 || (major === 1 && minor >= 9)).toBe(true);
    expect(() => assertOntologyValid()).not.toThrow();
  });
});
