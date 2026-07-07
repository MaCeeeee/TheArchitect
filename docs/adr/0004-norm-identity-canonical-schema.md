# ADR-0004: Norm-Identität & kanonisches Norm-Schema — interne `workId` + Alias-Union, hierarchie- und standards-aware

- **Status:** Accepted (2026-07-05, Matthias Ganzmann)
- **Datum:** 2026-07-05
- **Entscheider:** Matthias Ganzmann (Enterprise Architect)
- **Baut auf:** `docs/strategy/2026-07-05-canon-architecture-design.md` (das volle Design, adversarial gehärtet in 3 Runden) · `docs/strategy/2026-07-05-regulation-agnostic-data-architecture-prompt.md` (Auftrag v2) · ADR-0001/0002 (kanonischer Korpus) · ADR-0003 (Conformance-IA) · THE-390 P0 (UC-NORM-001, „Norm-Schema entscheiden")

## Kontext

THE-390 P0 ließ vier Fragen offen: **Section-Granularität, corpusRef-Semantik, NormMapping-Vereinigung, Policy/Snapshot/Checklist-FKs.** Ohne diese ADR würde THE-390 das Norm-Schema **flach** bauen — und UC-CANON-001 müsste danach ein zweites Mal migrieren.

Gleichzeitig ist das heutige Identitätsmodell empirisch widerlegt:

- **Publikationsschlüssel als Identität bricht real.** Das Schweizer BGEID ist seit 28.9.2025 angenommen, per 07/2026 **nicht in Kraft und ohne SR-Nummer** — die Identität *wandert* über den Lebenszyklus (BBl 2025 20 → AS → SR). US-Recht ist citation-keyed (`/us/usc/t6/s37`, „6 CFR 37.10"), hat weder CELEX noch ELI.
- **Das 6-Wert-`RegulationSource`-Enum ist dreifach dupliziert** (`shared/src/types/compliance.types.ts:62-68`, `server/src/models/Regulation.ts:41`, `compliance-crawler/src/db/regulation.model.ts:53`) — neues Gesetz = Code-Edit + shared-Rebuild + Doppel-Redeploy. THE-396 (AI Act/Data Act ohne Enumwert, unter `custom` ingested) ist der lebende Beweis des Bruchs.
- **Sub-Artikel-Struktur existiert nur als Code** (`ART30_FIELDS`, `art30.seed-data.ts:44-154`), nicht als Daten; der Korpus ist flach, artikelgranular.
- **`RegulationJurisdiction` = 4-Wert-Enum** (`compliance.types.ts:70`) kann US-Bundesstaaten/Kantone nicht tragen; ein zweiwertiges `in_force/draft` kann den CH-Zustand `referendum_passed` (erwahrt, nicht in Kraft) nicht darstellen.
- **Zusatzfund:** `buildRegulationKey`/`normaliseParagraph`/`computeVersionHash` existieren **vierfach** (shared, `server/src/services/wfcomp/regulationKey.ts`, crawler, `server/src/utils/regulationVersion.ts`).

## Entscheidung

**E1 — Identität (die Spine-Entscheidung):** Norm-Identität ist eine **interne, opake `workId`** plus eine **Alias-Discriminated-Union** — niemals ein Publikationsschlüssel.

```typescript
export type AliasScheme =
  | 'ELI-EU' | 'CELEX' | 'ELI-CH' | 'SR' | 'BBl' | 'AS'
  | 'USLM' | 'CFR-citation' | 'PublicLaw'
  | 'ISO' | 'NIST-SP' | 'OpenID' | 'IETF-RFC' | 'W3C-TR'
  | 'regulationKey'            // legacy `${source}:${paragraph}` — projiziert, non-breaking
  | 'abbrev';

export interface NormAlias {
  scheme: AliasScheme;
  value: string;               // '32024R1183', 'eli/fga/2025/20', '/us/usc/t6/s37'
  language?: RegulationLanguage; // sprach-gebundene Aliase (BGEID/LeID/LIdE)
  validFrom?: string;          // Aliase erscheinen über den Lebenszyklus (BBl→AS→SR)
  isPrimaryDisplay?: boolean;
}

export interface NormIdentity {
  workId: WorkId;              // opak, kanonisch, unveränderlich über den Lebenszyklus
  aliases: NormAlias[];
  frbrLevel: 'work' | 'expression' | 'manifestation'; // FRBR: BGEID/LeID/LIdE = 1 Work, 3 Expressions
  expressionLanguage?: RegulationLanguage;
}
```

**Merge-Logik für nachträglich erscheinende Identifikatoren ist Pflicht** (SR-Nummer entsteht erst mit Inkrafttreten). `buildRegulationKey` bleibt erhalten — degradiert zum *einen* Alias-Generator (`scheme: 'regulationKey'`), nicht die Wurzel.

**E2 — Section-Granularität (THE-390-Frage 1):** AKN-`@eId`-Hierarchie als Property-Graph-Baum — `Chapter → Section → Article → Paragraph → Point` mit stabilen Fragment-IDs (`chp_III__art_30__para_1__point_a`), **ohne** AKN-XML-Persistenz in Mongo. `NormSection` ist ein Baum-Knoten (adjacency + materialized path), kein flaches Array. Bestehende flache Artikel werden Blätter; CELLAR-Reingest konsolidiert sie per `@eId`-Match in echte Bäume.

**E3 — corpusRef-Semantik (THE-390-Frage 2):** `corpusRef = { workId, expression?, versionHash }` — Referenz, keine Kopie (ADR-0001-Prinzip). VERLOCK hängt künftig an `{workId, expression, version}`; `versionHash`/`computeVersionHash`/`regulationVersionMismatch` bleiben kontraktidentisch erhalten. Bitemporale Stempel (`validFrom/validTo` + `recordedFrom/recordedTo`, append-only) tragen „as-of"- und „as-known-at"-Fragen nativ.

**E4 — NormMapping-Vereinigung (THE-390-Frage 3):** `NormMapping` ersetzt `StandardMapping` + `ComplianceMapping` und referenziert `{ normId: workId, sectionEId?, versionHash }`. Die ICM-Invarianten (confidence, reasoning, `createdBy: llm|human|live-mapping`, auto→confirmed/rejected-Lifecycle, Heatmap-/Reverse-Lookup-Indizes) werden unverändert übernommen; der Unique-Index wandert von legacy `regulationId` auf `{projectId, normId, sectionEId, elementId}`.

**E5 — FKs für Policy/Snapshot/Checklist (THE-390-Frage 4):** `Policy.standardId`, `ComplianceSnapshot.standardId`, `AuditChecklist.standardId` → `normId` (+ optional `sectionEId`). `PolicySource`-Enum entfällt zugunsten der Source-Registry (E6). `ComplianceRequirement.regulationId` (legacy ObjectId-Ref, `ComplianceRequirement.ts:52`) wird auf `corpusRef` umgehängt — mit Erhalt der `{projectId, …, title}`-Idempotenz.

**E6 — Typisierung als Reference-Data statt Code-Enums:** `NormKind` (legislation | implementing_act | delegated_act | technical_standard | guideline | trust_framework | court_decision | executive_order), `Bindingness` (binding | binding-for-agencies | voluntary-de-facto | persuasive), per-SDO-`Maturity` (W3C: WD→REC; IETF: draft→RFC; ISO: editionsbasiert; EU-legislative: proposal→in_force→repealed) und **Jurisdiction mit per-Jurisdiktion-Lebenszyklus-State-Machine als Daten** (CH: `consultation → adopted → referendum_passed → validated → in_force`). Die erlaubten Werte leben in der **versionierten Ontologie-Datei** (Allowed-Types-Source-of-Truth, Extension-Review-Gate), validiert am Zod-Ingestion-Contract — nicht in TS-Enums am Kern. Effective-Dates als `DatedClaim { value, source, asOf, supersedes }`, nicht als statische Felder.

**E7 — Cross-Doc- und Cross-Norm-Relationen als First-Class-Kanten:** ELI-Relationen `AMENDS` / `CONSOLIDATES` / `REPEALS` / `CITES`, ableitend `TRANSPOSES` / `IMPLEMENTS` / `CONCRETIZES` (Statute → Guideline/Standard, US-Muster „commercially reasonable" → NIST/ISO), aus Abschlussrunde 4 die **derogierende** Kante `PREVAILS_OVER`/`DEROGATED_BY { forRole, scope:'same_subject_matter', validFrom }` für lex specialis zwischen zwei *gleichzeitig in-force* Normen (DORA Art. 1(2) verdrängt NIS2 für Finanzentitäten, soweit gleiche Materie — ohne NIS2 aufzuheben), aus Runde 5 die **parameter-setzende** Kante `SETS_PARAMETER` (delegierter Rechtsakt ändert einen Schwellenwert ohne Textänderung, s. E8), und aus Runde 6 `RECOGNIZES_EQUIVALENCE` `(:Norm)→(:Jurisdiction)` (Angemessenheits-/Anerkennungsbeschluss, GDPR Art. 45) sowie `INTERPRETS` `(:Norm{guideline})→(:Provision)` (nicht-bindende maßgebliche Auslegung, EDPB Art. 70). Alle als typisierte Neo4j-Kanten aus der ontologie-geführten `relationTypes`-Registry. eIDAS 2.0 (2024/1183 ÄNDERT 910/2014) ist der `AMENDS`-Regressionstest; DORA↔NIS2 der `DEROGATED_BY`-Regressionstest.

**E8 — Additive Deltas aus den Abschlussrunden 4+5 (für P1-Build verbindlich):** Das Norm-/Obligation-Schema trägt zusätzlich (rein additiv, ontologie-validiert, keine Kern-Enum-Edits):
- *(Runde 4)* (a) `Sanction.monetary_fine.accrual?` für zeit-akkumulierende Zwangsgelder (DORA Art. 35: Rate × Zeit, Cap in Tagen/Monaten — sonst unterschätzt Risk-Scoring strukturell); (b) `Deadline`-Arm `{ kind:'on_request', triggeredBy }` für behörden-getriggerte, datumlose Deliverables (NIS2 Art. 23(4)(c)); (c) `Subject.consolidationLevel?` (`entity/sub_consolidated/consolidated`) als zur Geografie orthogonale Aggregationsachse (DORA Art. 28(3)).
- *(Runde 5)* (d) `OdrlConstraint.parameterRef? { valueSourceWorkId, valueSourceEId?, temporal }` + gerichtete Kante `SETS_PARAMETER { targetEId, parameter, value, validFrom, validUntil }` — ein delegierter Rechtsakt kann einen Schwellenwert in einer anderen Provision *ohne Textänderung* setzen (AI Act Art. 51(3): 10²⁵-FLOP-Schwelle; DORA-RTS-Kalibrierungen folgen demselben Muster). Schwellenwerte liegen damit als bitemporale, quell-referenzierte Claims statt als eingefrorene Literale. (e) **`AssuranceScheme` und `AssuranceAxis` sind ontologie-validierte `string`** (NICHT geschlossene TS-Unions) — dieselbe E6-Disziplin wie `PartyRole`/`RegulationLanguage`; ein viertes/fünftes Schema (UK DIATF/GPG 45, Singpass, TDIF, PCTF) ist ein Ontologie-Eintrag, kein Kern-Edit. Schema-Achsen (`LoA`/`IAL`/`AAL`/`FAL`/GPG-45-confidence) leben als Daten im Schema-Eintrag.

- *(Runde 6)* (f) `ObligationApplicability.reach? 'territorial'|'extraterritorial'` + `targetingNexus? {targetLocatedIn, activityQualifier}` — extraterritoriale Bindung über Marktort/Targeting (GDPR Art. 3(2), AI Act Art. 2); **applicability-korrektheits-kritisch → braucht echte Query-Logik in P1, nicht nur Vokabular.** (g) `Subject.actingCapacity? 'entity'|'natural_person_in_body'` + `Sanction.addresseeCapacity? 'entity'|'natural_person'` — persönliche Haftung des Leitungsorgans getrennt von der Entität (DORA Art. 5(2), NIS2 Art. 20).

Belege + Herleitung: Design §10 Runden 4–6 (DELTA-N1…N4, R5-1/R5-2, R6-1…R6-4). **P0-Gate: ABGESCHLOSSEN (2026-07-05, Matthias Ganzmann).** 6 adversariale Runden, 28 Befunde, alle rein additiv absorbiert; Kern-Schema seit Runde 3 unverändert. Exit-Kriterium (bewusst) = „Kern stabil + jede Lücke additiv absorbierbar", nicht „exakt leere Runde" (asymptotisch unerreichbar). P1-Auflagen: (1) Reach `DELTA-R6-1` + Derogation `DELTA-N1` als echte Query-Logik implementieren; (2) die 28 Angriffsklauseln als Regressionssuite gegen P1 wiederverwenden.

## Betrachtete Optionen (Identitäts-Kern)

| | Option | Bewertung |
|---|---|---|
| A | CELEX als Primary Key | verworfen: EU-only-Adapter → CELLAR-Lock-in; BGEID und US-Recht haben keinen CELEX-Wert |
| B | ELI-URI als Primary Key | verworfen: bevorzugter *Alias*, aber kein PK — US hat kein ELI; BGEID-`eli/fga/` wandert zu `eli/cc/`, ein ELI-PK nagelt Identität an einen wandernden Wert |
| C | Interne opake `workId` + Alias-DU (FRBR Work/Expression) | **gewählt** — einziger Identitätskontrakt, der EU (CELEX/ELI), CH (BBl→AS→SR-Wanderung) und US (citations) gleichzeitig trägt |
| D | Legacy `regulationKey` beibehalten und erweitern | verworfen: `${source}:` koppelt die Identität ans Enum (Blocker 1); bleibt als projizierter Alias erhalten |

## Konsequenzen

**Positiv**
- THE-390 P0 baut das Norm-Schema **einmal richtig** — hierarchie-, jurisdiktions- und standards-aware; keine zweite Migration durch UC-CANON-001.
- „Neues Gesetz = Daten": Registry-Eintrag + contract-konformes Paket statt Enum-Edit + Doppel-Redeploy. Bewiesen im Design an sechs Fällen (NIS2, DORA, AI Act, Data Act, BGEID, eIDAS 2.0) mit null Code-Zeilen.
- VERLOCK, ICM, REQGEN, GAP, WFCOMP laufen als typisierte Views weiter (UC-Erhalt-Tabelle im Design §7); `needs_attestation` bleibt human-certified.
- Die Vierfach-Duplikation der Key-Utilities kollabiert auf eine shared-Implementierung.

**Negativ / Aufwand**
- Alias-Merge-Logik (nachträgliche SR-Nummer) ist neue, testpflichtige Kernmechanik.
- Bitemporale Queries sind komplexer als `findOne({version})`; braucht Query-Helper + Index-Disziplin.
- Ontologie-Datei wird deploy-kritisches Artefakt (Versionierung + Review-Gate nötig).
- Migration der FKs (E4/E5) berührt Produktionsdaten (BSH-Demo-Mappings) — Rollback-Plan Pflicht (bereits in THE-390 vermerkt).

**Nicht-Ziele**
- Keine RDF-/Triplestore-Migration (Property-Graph + geborgte Disziplinen, ADR-Storage im Design §9).
- Kein Build der OSCAL/DPV/ODRL-Schichten in Slice 1 — Design vollständig, Build `[SoR-LATER]`.
- Der Crawler auf Server B bleibt Corpus-Feeder; Schreibpfad-Architektur (ADR-0001/0002) unverändert.

## Auswirkung auf Tickets

- **THE-390 P0**: diese ADR *ist* der geforderte Entscheid — die vier offenen Fragen sind E2/E3/E4/E5. Build des Norm-Schemas bleibt in THE-390.
- **UC-CANON-001** (Pre-Flight 2026-07-05, Score 74,3, blockedBy THE-368): REQ .1 (Source-Registry) = E6-Registry, .3 (Hierarchie) = E2, .4 (Bitemporal) = E3, .5 (Contract+Ontologie) = E6. Issues noch nicht angelegt.
- **THE-306 (VERLOCK)**: Kontrakt bleibt; Schlüssel wandert auf `{workId, expression, version}`.
- **THE-308 (REGDIFF)**: bekommt mit `AMENDS`/`CONSOLIDATES` (E7) sein natives Datenmodell.

## Verwandt

`docs/strategy/2026-07-05-canon-architecture-design.md` (§3 Meta-Modell, §9 volles ADR-Set, §10 adversariale Verifikation) · `docs/strategy/2026-07-05-regulation-agnostic-data-architecture-prompt.md` · ADR-0001/0002/0003 · THE-390 · THE-368 · THE-306 · THE-308
