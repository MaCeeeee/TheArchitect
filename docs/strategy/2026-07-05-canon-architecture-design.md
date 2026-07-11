# Regulierungs-agnostische kanonische Compliance-Datenarchitektur für „The Architect"

**Finale Synthese — Fable 5 / ultracode. Faktenbasis web-verifiziert und codebasis-verifiziert 2026-07-05.**

---

## 1. Executive-Kurzfassung

### Die eine Spine-Entscheidung

**Norm-Identität ist eine interne, opake `workId` plus eine Alias-Discriminated-Union — niemals ein Publikationsschlüssel (CELEX, ELI, SR).** Diese eine Entscheidung (ADR-0004-R) trägt das gesamte Modell: Sie ist der einzige Weg, ein EU-Sekundärrecht (CELEX-keyed), ein Schweizer Gesetz ohne SR-Nummer (nur `eli/fga/2025/20` + `BBl 2025 20`, Identität wandert BBl→AS→SR) und US-Recht (citation-keyed, `/us/usc/t6/s37`) unter *einem* Identitätskontrakt zu führen. Jeder Publikations-Key-als-Identität-Ansatz bricht am ersten der drei Beweisfälle — belegt am realen BGEID, das seit ~9 Monaten angenommen, aber ohne SR-Nummer ist.

### Die drei Layer

- **Layer 1 — Identität & Struktur `[SLICE-1]`.** `workId` + `NormAlias[]` (FRBR Work/Expression/Manifestation), AKN-`@eId`-Hierarchie (Chapter→Section→Article→Paragraph→Point) als Property-Graph-Baum, `normType`/`bindingness`/`maturity`/`jurisdiction` als ontologie-validierte Reference-Data, Bitemporalität (valid-time + transaction-time) + Event Sourcing, Zod-Ingestion-Contract, versionierte Ontologie als Allowed-Types-Source-of-Truth. **Das ist der Build von Slice 1.**
- **Layer 2 — Obligation-Kette (System of Record) `[SoR-LATER]`.** NIST OSCAL (Catalog→Profile→SSP→Assessment-Results→POA&M), W3C DPV (Datensemantik) + Identity-Extension, ODRL 2.2 (Duties), DCAT 3 (Assets), SCF-Crosswalk („assess once, comply many"). **Vollständig designt, nicht in Slice 1 gebaut.**
- **Layer 3 — Semantik & Trust `[SoR-LATER]`.** Semantic Layer (einheitliche Metriken), Data-Mesh-Prinzip, Assurance-Schemes (eIDAS-LoA vs. NIST-IAL/AAL/FAL als getrennte Achsen), Party-Role-in-Jurisdiction, Trust-Registries als Connector-Quellen.

### Das nicht-verhandelbare Ergebnis

Alle sechs Beweisfälle (NIS2, DORA, EU AI Act, EU Data Act, BGEID, eIDAS 2.0) sind gegen dieses Modell **als Daten onboardbar — null Code-Zeilen, null Enum-Edits am Kern**. Die adversariale Verifikation (sechs Runden, THE-390-P0-Gate) hat 28 Repräsentationslücken gefunden; alle 28 sind durch additive Deltas (neue Felder, Kanten, Vokabular-Einträge, oder das Absenken zweier geschlossener TS-Enums auf ontologie-validierten `string`) geschlossen. Zwei Lücken waren **Modell-Selbstwidersprüche** (`PartyRole`, `RegulationLanguage` reproduzierten die Enum-Triplikation → DELTA-2/-4); Runde 4 fand mit **N-1 (lex-specialis-Verdrängung DORA↔NIS2)** und **N-2 (zeit-akkumulierendes DORA-Zwangsgeld)** zwei echte Korrektheits-Lücken. **P0-Gate-Entscheidung (2026-07-05, Matthias Ganzmann):** Das Exit-Kriterium wird von „exakt leere Runde" (im offenen Rechtsraum praktisch unerreichbar) auf das inhaltlich stärkere Kriterium umgestellt — **Kern-Schema stabil (seit Runde 3 unverändert) + jede gefundene Lücke additiv als Referenzdaten absorbierbar**. Das ist erfüllt; **P0 ist damit abgeschlossen** (siehe §10). Die zwei bewertungskritischen Relationen (Reach `DELTA-R6-1`, Derogation `DELTA-N1`) sind als P1-Pflicht-Query-Logik markiert, nicht als bloßes Vokabular.

---

## 2. Current-State-Teardown

### 2.0 Die exakte „Daten→Code"-Umschlagstelle

Die materielle Verletzung des Prinzips „ein neues Gesetz = Daten" sitzt am `RegulationSource`-Union-Typ, **`packages/shared/src/types/compliance.types.ts:62-68`** (live verifiziert). Jeder Enumwert ist gleichzeitig (a) DB-Schema-Constraint (dreifach), (b) Voraussetzung für Parser-Existenz, (c) linker Teil jedes `regulationKey`. Ein neues Gesetz kann nicht als Datensatz eingefügt werden, ohne diese TS-Datei zu editieren, `shared` neu zu bauen, Server + Crawler neu zu deployen.

### 2.1 Die zwei divergierenden Identitätsmodelle (Strangler, mid-flight)

| # | Modell | Datei:Feld | Identitätsschlüssel | Tenant |
|---|---|---|---|---|
| 1 | LEGACY per-Projekt | `packages/server/src/models/Regulation.ts:17-34`, Index `:82-85` | `{projectId, source, paragraphNumber, version}` | tenant-gebunden (`projectId required :38`) |
| 2 | KANONISCHER Korpus | `packages/compliance-crawler/src/db/regulation.model.ts:19-44`, Index `:92-95` | `{regulationKey, version}` + `versionHash = sha256(fullText)` | tenant-frei (`projectId required:false :50`) |

- `regulationKey` wird gebaut in `regulation-key.ts:20-28` als `${source}:${normaliseParagraph(paragraph)}` (z. B. `dsgvo:art-30`) — signatur `buildRegulationKey(source: string, ...)` ist **bereits law-agnostisch** (live verifiziert `:20`), kein Enum-Constraint.
- Read-Model `ICorpusRegulation` (`corpusClient.service.ts:33-50`) hat `source`/`jurisdiction` als **unconstrained `String`** (`:37`, `:38`) — loser als beide Write-Modelle.
- Strangler-Read-Seam: `regulationResolver.service.ts:82-95` liest korpus-first (`getRegulationsByKeys`), Fallback `Regulation.find({projectId})` (`:93`).

**Verschärfung (Zusatzfund):** `buildRegulationKey`/`normaliseParagraph`/`computeVersionHash` existieren **vierfach**: `shared/src/utils/regulation-key.ts`, `server/src/services/wfcomp/regulationKey.ts` (Kommentar `:11` „Replicated (not imported)"), `compliance-crawler/src/db/regulationKey.ts`, `server/src/utils/regulationVersion.ts`.

### 2.2 Bestehende Entitäten — Kernfelder & Limitierung

| Entität | Datei:Feld | Limitierung |
|---|---|---|
| `Regulation` (app-DB legacy) | `Regulation.ts`; `source`-Enum `:41`, `projectId required :38`, `paragraphNumber :49` | tenant-bound, hartes 6-Wert-Enum, kein `versionHash`/`regulationKey`, flach |
| `Regulation` (crawler) | `regulation.model.ts`; `source`-Enum `:53`, `regulationKey :48`, `versionHash :49` | gleiches 6-Wert-Enum, flach, keine Hierarchie |
| `ICorpusRegulation` | `corpusClient.service.ts:37-38` | `source`/`jurisdiction` unconstrained String |
| `ComplianceMapping` | `ComplianceMapping.ts`; dual-ref `regulationId:66` + `regulationKey:68` + `regulationVersionHash:69` + `regulationVersionMismatch:70`; Unique `:114-117`; `by_corpus_reference :134-137` | Unique-Index noch an legacy `regulationId` |
| `ComplianceRequirement` | `ComplianceRequirement.ts`; `regulationId {ref:'Regulation', required:true} :52`; `criticality HART/BEDINGT/WEICH :133-137`; `traceTarget: Mixed :140-143`; Unique `:150-153` | harte ObjectId-Ref auf **legacy** app-DB (Blocker 5) |
| `WfcompAssessment` | `WfcompAssessment.ts`; `regulationRef {regulationKey, versionHash} :18/:31-35`; `gapReport: Mixed, required :30` | einzige voll-kanonische Entität; `gapReport` Art.30-shaped |
| `Policy`/`IPolicyRule` | `Policy.ts`; `PolicySource :11`; Regeln `field/operator/value :3-8` | disjunktes Source-Enum, nicht an Regulation-Paragraphen gelinkt |
| `ART30_FIELDS` | `art30.seed-data.ts:44-154` | Sub-Artikel-Struktur existiert **nur als Code** |

### 2.3 Die acht Generalisierungs-Blocker (jeder Datei:Feld-belegt)

- **Blocker 1 — 6-Wert-`RegulationSource` dreifach dupliziert.** `compliance.types.ts:62-68`, `Regulation.ts:41`, `regulation.model.ts:53` (alle live verifiziert, byte-identische Arrays `['nis2','lksg','dsgvo','dora','iso27001','custom']`). Neues Gesetz = TS-Edit + `shared`-Rebuild + Doppel-Redeploy.
- **Blocker 2 — Enum-gültig ≠ crawlbar.** Registry `crawl.ts:39-57` (`buildSourceRegistry`) hat nur `nis2/dsgvo/lksg`; `dora`/`iso27001` liefern `crawl.ts:91-92` „source not yet implemented". Neue Quelle = neue `SourceParser`-Klasse (`sources/types.ts:24-32`).
- **Blocker 3 — Sub-Artikel-Struktur kein First-Class-Datenkonzept.** `Regulation.ts:49` `paragraphNumber: String`, `:51` `fullText`; Sub-Struktur nur als `ART30_FIELDS` (`art30.seed-data.ts:44-154`).
- **Blocker 4 — WFCOMP `criticality`+`traceTarget` gesetzes-tailored.** `Art30Criticality = 'HART'|'BEDINGT'|'WEICH'` (`compliance.types.ts:161`), verankert `ComplianceRequirement.ts:133-137`. `TraceTarget` um ArchiMate+Art.30 modelliert (`compliance.types.ts:181-186`, `guard.flag:'thirdCountry'`).
- **Blocker 5 — `ComplianceRequirement.regulationId` an legacy app-DB.** `ComplianceRequirement.ts:52` harte ObjectId-Pflicht-Ref. Korpus-only Gesetz kann kein Requirement tragen.
- **Blocker 6 — Fragmentiertes Source-Vokabular.** `RegulationSource` (`compliance.types.ts:62-68`) vs. `PolicySource` (`Policy.ts:11`, enthält `togaf/archimate`, nicht `lksg/dsgvo`) vs. unconstrained Korpus-`source: String`.
- **Blocker 7 — Keine Parent-Law-Entität.** Jeder Paragraph wiederholt `sourceUrl:61`/`jurisdiction:44-48`/`effectiveFrom:62`; kein `parentId`/`workId`/`chapterId`.
- **Blocker 8 — THE-396-Anomalie (empirischer Enum-Bruch).** Kein `ai_act`/`data_act`-Enumwert in `compliance.types.ts:62-68`, kein Parser in `crawl.ts:39-57`. Die einzigen `AI Act`/`Data Act`-Vorkommen sind hartkodierte Report-Strings (`oracle.routes.ts:203` `_compliance: ['EU AI Act 2024/1689','EU Data Act 2023/2854']`). Memory behauptet „325 Paragraphen embedded, Done". Da kein Enumwert existiert, lief die Ingestion zwangsläufig unter `custom` → die Herkunft ist im `source`-Feld nicht rekonstruierbar. **Ein reales embedded Gesetz, das das Identitäts-Enum nicht benennen kann — der lebende Beweis, dass das Enum-Modell gebrochen ist.**

### 2.4 Wiederverwendbare Extension-Points (verifiziert vorhanden)

`SourceParser`-Interface (`sources/types.ts:24-32`, law-agnostisch aber klassenbasiert); `buildRegulationKey`/`normaliseParagraph` (`regulation-key.ts:12-28`, law-agnostisch); Strangler-Seam (`regulationResolver.service.ts:82-95`); Korpus-Connection (`corpusClient.service.ts:56-80`, `CORPUS_MONGODB_URI`); Drift-Machinerie (`computeVersionHash` + `regulationDrift.service.ts:26-82`); `Art30FieldSpec`-Shape (`art30.seed-data.ts:33-41`) als Template.

---

## 3. Kanonisches Meta-Modell

Die Spine-Achse: **Norm → Structure(@eId) → Obligation → Control → Subject → Assessment/Evidence → Finding/Risk → Remediation**, mit Identity-DU, bitemporalen Feldern und Ontologie-als-Kontrakt. Jedes Legacy-Feld, an das non-breaking angedockt wird, ist verifiziert (`regulation.model.ts:19-44`, `corpusClient.service.ts:33-50`, `regulation-key.ts:20`, `compliance.types.ts:62-72`). **Alle Fix-Deltas (Runden 1–3) sind in die Typen integriert, nicht angehängt.**

### (i) Shared TypeScript-Typen

#### C-1 `[SLICE-1]` — Basis: Bitemporalität, Provenance, Ontologie-Referenz

`packages/shared/src/types/canonical/base.types.ts`

```typescript
// ─── Canonical base: bitemporal + provenance + ontology-referenced typing ───
// Spine of UC-CANON-001. `kind`/`nodeType` are ontology-validated discriminators,
// never a hardcoded TS enum on the core (Blocker 1/6 killed here).

/** Opaque, jurisdiction-neutral internal id. Never a publication key (ADR-0004-R). */
export type WorkId = string & { readonly __brand: 'WorkId' };
export type NodeId = string & { readonly __brand: 'NodeId' };

/** ISO-639-1 language, ontology-validated at ingest — NOT a 'de'|'en' enum (DELTA-4). */
export type RegulationLanguage = string;

/**
 * Bitemporal footprint (Snodgrass / SQL:2011).
 * valid-time = when the fact holds in the real world (law in force).
 * transaction-time = when the system knew it. `to === null` means "open / current".
 */
export interface BitemporalStamp {
  validFrom: string;            // ISO-8601, in-force start
  validTo: string | null;      // in-force end; null = still in force
  recordedFrom: string;        // ISO-8601, system learned-at
  recordedTo: string | null;   // null = current record; set on supersession (append-only)
}

/** Provenance for every ingested fact (UC-PROV; Data Contract requirement). */
export interface Provenance {
  source: string;              // ontology-validated source id (registry key, not enum)
  adapter: string;             // ingest adapter id, e.g. 'cellar-akn', 'fedlex-sparql'
  format: 'akn' | 'formex' | 'uslm' | 'ecfr-json' | 'jolux-akn' | 'manual';
  fetchedAt: string;           // ISO-8601
  sourceUri?: string;          // resolvable origin URI (ELI, CELLAR, USLM path)
  eventId?: string;            // originating event-sourcing event (Data Vault satellite link)
}

/**
 * A dated, source-referenced claim rather than a static field.
 * Effective dates are volatile (CH E-ID moved 3x/5mo) → claims.
 */
export interface DatedClaim<T = string> {
  value: T;
  source: string;
  asOf: string;
  supersedes?: string;
  confidence?: number;
}

/** Common envelope every canonical entity extends. */
export interface CanonicalNode {
  id: NodeId;
  temporal: BitemporalStamp;
  provenance: Provenance;
  ontologyVersion: string;     // which ontology version validated this node's `kind`
}
```

#### C-2 `[SLICE-1]` — Identifier Discriminated Union (workId + Alias)

`packages/shared/src/types/canonical/identity.types.ts`

```typescript
// ─── Norm identity: internal workId + alias discriminated union (ADR-0004-R) ───
// CELEX/ELI are ALIASES, never the primary key (BGEID has no SR-number; US is
// citation-keyed). buildRegulationKey stays as ONE alias generator, not the root.
import type { RegulationLanguage } from './base.types';

export type AliasScheme =
  | 'ELI-EU' | 'CELEX' | 'ELI-CH' | 'SR' | 'BBl' | 'AS'
  | 'USLM' | 'CFR-citation' | 'PublicLaw'
  | 'ISO' | 'NIST-SP' | 'OpenID' | 'IETF-RFC' | 'W3C-TR'
  | 'regulationKey'            // legacy `${source}:${paragraph}` — projected, non-breaking
  | 'abbrev';

/** One alias for a Work/Expression. Discriminated by `scheme`. */
export interface NormAlias {
  scheme: AliasScheme;
  value: string;               // '32024R1183', 'eli/fga/2025/20', '/us/usc/t6/s37'
  language?: RegulationLanguage; // language-scoped aliases (BGEID/LeID/LIdE) — DELTA-4
  validFrom?: string;          // aliases appear over the lifecycle (BBl→AS→SR merge)
  isPrimaryDisplay?: boolean;
}

export type FrbrLevel = 'work' | 'expression' | 'manifestation';

export interface NormIdentity {
  workId: WorkId;              // opaque, canonical, immutable across lifecycle
  aliases: NormAlias[];        // ELI, CELEX, SR, USLM, legacy regulationKey …
  frbrLevel: FrbrLevel;
  expressionLanguage?: RegulationLanguage;
}
```

#### C-3 `[SLICE-1]` — normType / bindingness / maturity, Jurisdiction + Lifecycle-State-Machine

`packages/shared/src/types/canonical/norm.types.ts`

```typescript
import type { CanonicalNode, DatedClaim, RegulationLanguage } from './base.types';
import type { NormIdentity } from './identity.types';

// ─── normType / bindingness / maturity as ontology-referenced reference-data ───
// A "law" is only one norm kind. These enums are the ALLOWED-VALUES CONTRACT surface;
// the authoritative allowed set lives in the ontology YAML, validated at ingest.

export type NormKind =
  | 'legislation' | 'implementing_act' | 'delegated_act'
  | 'technical_standard' | 'guideline' | 'trust_framework'
  | 'court_decision' | 'executive_order';

export type Bindingness =
  | 'binding' | 'binding-for-agencies' | 'voluntary-de-facto' | 'persuasive';

/** DELTA-6: EU legal-act character, orthogonal to NormKind. Ontology-validated string. */
export type LegalActType = string; // 'regulation' | 'directive' | 'decision' | …

/**
 * Per-SDO maturity. Deliberately NOT a single global enum — W3C/IETF/OpenID/ISO have
 * incompatible maturity axes (ADR-normType). Discriminated by `scheme`.
 */
export type Maturity =
  | { scheme: 'W3C'; value: 'WD' | 'CR' | 'PR' | 'REC' }
  | { scheme: 'IETF'; value: 'draft' | 'RFC' }
  | { scheme: 'OpenID'; value: 'draft' | 'final' }
  | { scheme: 'ISO'; value: `edition-${number}` | 'TS' | 'withdrawn' }
  | { scheme: 'EU-legislative'; value: 'proposal' | 'adopted' | 'in_force' | 'partially_in_force' | 'repealed' }
  | { scheme: 'ARF'; value: string }
  | { scheme: 'none' };

/** Jurisdiction First-Class, with optional sub-jurisdiction (US state, canton). */
export interface Jurisdiction {
  code: string;                // 'EU'|'DE'|'CH'|'US' — ontology-validated, NOT a 4-value enum
  subCode?: string;            // 'US-CA', 'CH-ZH', EU member state …
}

/**
 * Lifecycle state machine AS DATA, keyed by jurisdiction. CH has states the EU model
 * lacks (referendum_passed, validated/"erwahrt"). BGEID = adopted, not in force, no date.
 */
export type LifecyclePhase =
  | 'draft' | 'consultation' | 'proposal' | 'adopted'
  | 'referendum_passed' | 'validated'          // CH-specific ("erwahrt")
  | 'in_force' | 'partially_in_force' | 'repealed';

export interface LifecycleState {
  phase: LifecyclePhase;
  jurisdictionCode: string;
  since?: DatedClaim;
  inForceDate?: DatedClaim;    // may be ABSENT (BGEID) → "upcoming obligation"
}

/** A norm work (the parent-law / regulation-family entity Blocker 7 lacked). */
export interface Norm extends CanonicalNode {
  nodeType: 'Norm';
  identity: NormIdentity;
  kind: NormKind;
  legalActType?: LegalActType;                 // DELTA-6: directive vs. regulation
  bindingness: Bindingness;
  maturity: Maturity;
  jurisdiction: Jurisdiction;
  lifecycle: LifecycleState;
  title: Record<RegulationLanguage, string>;   // multi-expression titles under one work
  shortName?: string;
}
```

#### C-4 `[SLICE-1]` — Strukturelle Hierarchie (AKN `@eId`, adjacency + materialized path)

`packages/shared/src/types/canonical/structure.types.ts`

```typescript
import type { CanonicalNode, WorkId, NodeId } from './base.types';

// ─── AKN element taxonomy as data (no AKN-XML persisted; ADR-Structure) ───
// Chapter→Section→Article→Paragraph→Point tree. @eId survives renumbering.

export type StructuralType =
  | 'part' | 'title' | 'chapter' | 'section'
  | 'article' | 'paragraph' | 'point' | 'subpoint' | 'annex';

/**
 * A structural provision node. This is where the flat corpus (one doc = one article,
 * Blocker 3) becomes a real tree. Every legacy article becomes a LEAF or inner node.
 */
export interface Provision extends CanonicalNode {
  nodeType: 'Provision';
  workId: WorkId;              // parent Norm.identity.workId
  structuralType: StructuralType;
  eId: string;                 // AKN @eId, e.g. 'chp_III__art_30__para_1__point_a'
  parentId: NodeId | null;    // adjacency list
  materializedPath: string;   // '/chp_III/art_30/para_1/point_a' — subtree queries
  ordinal: number;            // sibling order
  heading?: string;
  fullText?: string;          // present on leaves
  expressionLanguage?: string; // DELTA-5: ISO-639-1; set for multi-expression norms
  /** Legacy projection: `${source}:${paragraphNumber}` reproducible for VERLOCK. */
  legacyRegulationKey?: string;
  legacyVersionHash?: string; // sha256(fullText) — VERLOCK contract preserved
}
```

**Non-Breaking-Nachweis:** `legacyRegulationKey` reproduziert `buildRegulationKey(source, paragraphNumber)` (`regulation-key.ts:20`); `legacyVersionHash = sha256(fullText)` = `computeVersionHash`. `corpusClient`/`regulationResolver`/VERLOCK laufen unverändert. **DELTA-5** ergänzt `expressionLanguage`, damit drei gleichwertige Sprach-Expressions (de/fr/it) nicht auf einen sprach-blinden `legacyRegulationKey` mit drei verschiedenen Hashes kollidieren (falscher `regulationVersionMismatch`). Der VERLOCK-Pin wird von `{regulationKey, versionHash}` auf `{regulationKey, expressionLanguage, versionHash}` geführt; für einsprachiges Recht bleibt `expressionLanguage` leer → bit-identisch zum Legacy-Verhalten.

#### C-5 `[SoR-LATER]` — Obligation → Control → Subject → Assessment → Finding → Remediation (mit allen Deltas)

`packages/shared/src/types/canonical/obligation.types.ts`

```typescript
import type { CanonicalNode, NodeId } from './base.types';

// ─── Obligation semantics: LKIF-Core norm_type + ODRL duty formalism ───
export type NormativeType = 'obligation' | 'permission' | 'prohibition' | 'right';

/** DELTA-1 base: single assurance level. */
export type AssuranceScheme = 'eIDAS' | 'NIST-800-63' | 'UK-DIATF' | 'CH-eID';
export interface AssuranceLevel {
  scheme: AssuranceScheme;
  axis: 'LoA' | 'IAL' | 'AAL' | 'FAL';   // eIDAS=one axis; NIST=three orthogonal axes
  value: string;
  ordinal: number;
}

/**
 * DELTA-1 + DELTA-13: multi-axis assurance requirement (NIST xAL profile).
 * Carries the CONJUNCTION of orthogonal axes as ONE requirement (IAL2 AND AAL2 AND
 * FAL2), plus non-ordinal qualifiers ('phishing_resistant'). DELTA-13 adds axis
 * APPLICABILITY: "no IAL" is a First-Class state, not an absence.
 */
export type AxisApplicability = 'required' | 'not_applicable';
export interface AssuranceAxisConstraint {
  scheme: AssuranceScheme;
  axis: 'LoA' | 'IAL' | 'AAL' | 'FAL';
  applicability: AxisApplicability;    // DELTA-13: 'not_applicable' ≠ omitted/unknown
  operator?: 'gteq' | 'eq';            // only meaningful when applicability='required'
  value?: string;
  ordinal?: number;
  qualifiers?: string[];               // ontology-validated, e.g. 'phishing_resistant'
}
export interface AssuranceRequirement {
  scheme: AssuranceScheme;             // one scheme; cross-scheme only via MAPS_TO
  axisConstraints: AssuranceAxisConstraint[]; // conjunction: ALL must hold
}

/** ODRL 2.2 rule mapping. An Obligation projects to an ODRL Policy (ADR-Duty-Formalism). */
export interface OdrlConstraint {
  leftOperand: string;
  operator: 'eq' | 'neq' | 'lt' | 'lteq' | 'gt' | 'gteq' | 'isPartOf';
  rightOperand: string;
  assuranceRequirement?: AssuranceRequirement; // DELTA-1: structured assurance target
}
export interface OdrlRule {
  ruleType: 'permission' | 'prohibition' | 'duty';
  action: string;              // ontology-validated action term (D-B: odrlAction vocab)
  target?: string;             // DCAT asset id or ArchiMate element id
  assignee?: NodeId;
  constraints: OdrlConstraint[];
}

/**
 * DELTA-7 + DELTA-12: generalized derived deadline. Expresses 24h/72h AND per-subject
 * runtime incidents AND chain-dependency AND aggregate triggers (NIS2 recurring rule).
 */
export interface AggregateBaseEvent {
  kind: 'aggregate';
  correlationKey: string;              // 'rootCause' — equality predicate joining events
  window: { value: number; unit: 'day' | 'month' | 'year' };
  threshold: { aggregate: 'sum' | 'count'; field: string; operator: 'gteq'; value: number };
}
export type DeadlineBaseEvent =
  | { kind: 'single'; baseEventType: string }   // legacy DELTA-7 arm (default)
  | AggregateBaseEvent;                          // DELTA-12
export interface DerivedDeadline {
  kind: 'derived';
  baseEvent: DeadlineBaseEvent;                  // DELTA-12: discriminated
  offset: { value: number; unit: 'hours' | 'days' | 'months' }; // DELTA-7: hour granularity
  relativeTo: 'norm_event' | 'incident' | 'prior_deliverable';  // DELTA-7
  priorDeliverableId?: NodeId;                   // when relativeTo === 'prior_deliverable'
  computedValue?: string;
}
export type Deadline = DerivedDeadline | { kind: 'literal'; value: string };

export interface Obligation extends CanonicalNode {
  nodeType: 'Obligation';
  provisionId: NodeId;
  normativeType: NormativeType;
  bearerRoleIds: NodeId[];     // DELTA-9: role disjunction (AI Act provider OR deployer)
  odrl: OdrlRule;
  deadline?: Deadline;
  dpvConcepts: string[];       // DPV terms + namespaced identity/AI-Act extension (L1)
}

// ─── Sanction as discriminated union, NOT a maxFine field (ADR-Sanction) ───
export type Sanction =
  | {
      type: 'monetary_fine';
      maxAmount?: number; currency?: string; basis?: string;   // legacy single cap
      fixedCap?: number; turnoverPct?: number;                 // DELTA-13: dual operand
      selector?: 'higher' | 'lower';                           // AI Act Art. 99(1)/(6)
      selectorConditionedOn?: 'undertaking_size';
    }
  | { type: 'public_naming'; register?: string;
      visibility?: 'supervisor' | 'counterparty_at_transaction' | 'public'; // DELTA-15
      audience?: PartyRole }                                    // BGEID Art. 23(2)
  | { type: 'ecosystem_exclusion'; scope?: string }
  | { type: 'license_revocation' }
  | { type: 'other'; description: string };

// ─── Control / Measure (DPV TOM ↔ Control; ISO 27001 Annex A seed) ───
export interface Control extends CanonicalNode {
  nodeType: 'Control';
  controlKey: string;
  title: string;
  dpvTomConcepts: string[];
  isoAnnexARef?: string[];
  scfRef?: string[];           // Secure Controls Framework common-control ids
}

// ─── Subject: Party PLAYS Role IN Jurisdiction (ADR-Party-Role) ───
// DELTA-2: PartyRole is an ontology-validated string, NOT a closed union (heals the
// enum-triplication pathology one level down — same medicine as NormKind/source).
export type PartyRole = string;

export interface Qualification { scheme: string; value: string } // DELTA-14: executor eligibility
export interface Subject extends CanonicalNode {
  nodeType: 'Subject';
  organizationId?: NodeId;
  role: PartyRole;
  jurisdictionCode: string;
  registrationState?: 'registered' | 'pending' | 'not_required'; // eIDAS RP-register precondition
  qualifications?: Qualification[];    // DELTA-14: tester eligibility (DORA Art. 26/27)
  undertakingSize?: 'sme' | 'large';   // DELTA-15b: feeds AI Act Art. 99(6) selector
}

// ─── Assessment / Evidence / Finding / Remediation (OSCAL-shaped) ───
/** Asilomar Human-Control: needs_attestation is First-Class, never auto-set. */
export type AssessmentStatus =
  | 'satisfied' | 'not_satisfied' | 'not_applicable' | 'needs_attestation';

export interface Assessment extends CanonicalNode {
  nodeType: 'Assessment';
  subjectIds: NodeId[];        // DELTA-11: pooled TLPT = ONE test for N entities (DORA 26(3))
  /** @deprecated legacy 1:1 projection = subjectIds[0]; read-only compat. */
  subjectId?: NodeId;
  designatedLeadSubjectId?: NodeId; // DELTA-11: DORA Art. 26(4) directing entity, ∈ subjectIds
  obligationId: NodeId;
  controlIds: NodeId[];
  status: AssessmentStatus;
  createdBy: 'llm' | 'human';  // UC-ICM invariant preserved
  confidence?: number;
  reasoning?: string;
  attestedBy?: NodeId;         // human certifier when status leaves needs_attestation
}

export interface Evidence extends CanonicalNode {
  nodeType: 'Evidence';
  assessmentId: NodeId;        // ONE evidence unit shared across subjectIds (DELTA-11)
  artifactUri?: string;
  description: string;
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface Finding extends CanonicalNode {
  nodeType: 'Finding';
  assessmentId: NodeId;
  severity: FindingSeverity;
  gapStatus: 'open' | 'in_progress' | 'resolved';   // GAP-001 lifecycle
  sanctions: Sanction[];       // typed → risk-scoring reads TYPE, not just amount
}

export interface Remediation extends CanonicalNode {
  nodeType: 'Remediation';
  findingId: NodeId;           // POA&M item ↔ Finding
  plan: string;
  targetDate?: string;
  status: 'planned' | 'in_progress' | 'completed' | 'accepted_risk';
}

// ─── DCAT-Dataset ↔ ArchiMate Data-Layer (ADR-Asset) ───
export interface DataAsset extends CanonicalNode {
  nodeType: 'DataAsset';
  dcatType: 'Catalog' | 'Dataset' | 'DataService' | 'Distribution';
  title: string;
  archimateElementId?: string;
}

/**
 * DELTA-15: ObligationApplicability — obligation × subCode × time × precondition.
 * Makes "which mDL acceptance obligations held in US-CA vs US-TX as-of 2026-01" a
 * First-Class, as-of-queryable state (per-State waiver, 6 CFR 37.10). Reuses BitemporalStamp.
 */
export interface ObligationApplicability extends CanonicalNode {
  nodeType: 'ObligationApplicability';
  obligationId: NodeId;
  jurisdictionCode: string;
  subCode: string;             // 'US-CA', 'US-TX', 'CH-ZH' …
  applies: boolean;            // FALSE = explicitly does NOT apply (opt-out), ≠ absent
  preconditionRef?: NodeId;    // waiver certificate (own Norm/Subject with own validTo)
}

/** DELTA-14: rotation constraint ("every Nth test external", DORA). */
export interface RotationConstraint {
  kind: 'rotation';
  everyN: number;
  requiredExecutorProperty: string;  // 'external'
  overHistoryOf: 'Assessment';
}

/** Canonical union — the closed set of node discriminants. */
export type CanonicalEntity =
  | import('./norm.types').Norm
  | import('./structure.types').Provision
  | Obligation | Control | Subject
  | Assessment | Evidence | Finding | Remediation | DataAsset
  | ObligationApplicability;   // DELTA-15
```

### (ii) Mongo-Schemas (Mongoose-Discriminators)

#### C-6 `[SLICE-1]` — Basis-Discriminator + Norm + Provision (VERLOCK-erhaltend, append-only)

`packages/server/src/models/canonical/CanonicalNode.ts`

```typescript
import mongoose, { Schema } from 'mongoose';

const bitemporalStamp = new Schema({
  validFrom:    { type: Date, required: true },
  validTo:      { type: Date, default: null },
  recordedFrom: { type: Date, required: true, default: Date.now },
  recordedTo:   { type: Date, default: null },      // append-only: never mutate; set to close
}, { _id: false });

const provenance = new Schema({
  source:    { type: String, required: true },      // ontology-validated, NOT an enum
  adapter:   { type: String, required: true },
  format:    { type: String, required: true },
  fetchedAt: { type: Date, required: true },
  sourceUri: { type: String },
  eventId:   { type: Schema.Types.ObjectId, ref: 'CanonicalEvent' },
}, { _id: false });

const canonicalBase = new Schema({
  temporal:        { type: bitemporalStamp, required: true },
  provenance:      { type: provenance, required: true },
  ontologyVersion: { type: String, required: true },
}, { timestamps: true, discriminatorKey: 'nodeType', collection: 'canonical_nodes' });

canonicalBase.index({ nodeType: 1, 'temporal.recordedTo': 1, 'temporal.validTo': 1 });
export const CanonicalNodeModel = mongoose.model('CanonicalNode', canonicalBase);

// ─── Norm discriminator ───
const normAlias = new Schema({
  scheme: { type: String, required: true },
  value:  { type: String, required: true },
  language: { type: String },
  validFrom: { type: Date },
  isPrimaryDisplay: { type: Boolean, default: false },
}, { _id: false });

const normSchema = new Schema({
  identity: {
    workId:   { type: String, required: true },
    aliases:  { type: [normAlias], default: [] },
    frbrLevel: { type: String, enum: ['work', 'expression', 'manifestation'], required: true },
    expressionLanguage: { type: String },
  },
  kind:        { type: String, required: true },   // allowed set enforced by ontology
  legalActType:{ type: String },                   // DELTA-6
  bindingness: { type: String, required: true },
  maturity:    { type: Schema.Types.Mixed, required: true }, // DU validated by Zod at ingest
  jurisdiction: { code: { type: String, required: true }, subCode: { type: String } },
  lifecycle: {
    phase: { type: String, required: true },
    jurisdictionCode: { type: String, required: true },
    since:       { type: Schema.Types.Mixed },     // DatedClaim
    inForceDate: { type: Schema.Types.Mixed },     // may be absent (BGEID)
  },
  title:     { type: Map, of: String, required: true },
  shortName: { type: String },
});
normSchema.index({ 'identity.workId': 1 });
normSchema.index({ 'identity.aliases.scheme': 1, 'identity.aliases.value': 1 });
export const NormModel = CanonicalNodeModel.discriminator('Norm', normSchema);

// ─── Provision discriminator (the tree) ───
const provisionSchema = new Schema({
  workId:           { type: String, required: true },
  structuralType:   { type: String, required: true },
  eId:              { type: String, required: true },       // AKN @eId
  parentId:         { type: Schema.Types.ObjectId, ref: 'CanonicalNode', default: null },
  materializedPath: { type: String, required: true },
  ordinal:          { type: Number, required: true },
  heading:          { type: String },
  fullText:         { type: String },
  expressionLanguage: { type: String },                     // DELTA-5
  legacyRegulationKey: { type: String },   // projection for corpusClient/VERLOCK
  legacyVersionHash:   { type: String },   // sha256(fullText) — computeVersionHash contract
});
provisionSchema.index({ workId: 1, eId: 1, 'temporal.recordedFrom': 1 });
provisionSchema.index({ materializedPath: 1 });
provisionSchema.index({ legacyRegulationKey: 1, expressionLanguage: 1 }); // DELTA-5 VERLOCK parity
export const ProvisionModel = CanonicalNodeModel.discriminator('Provision', provisionSchema);
```

#### C-7 `[SLICE-1]` — Event-Store (Event Sourcing + Data-Vault-Satellite-Prinzip)

`packages/server/src/models/canonical/CanonicalEvent.ts`

```typescript
import mongoose, { Schema } from 'mongoose';

// ─── Append-only event log. State = projection. Rebuildable after a parser fix. ───
// NEVER mutated in place (ADR-Audit / ADR-Temporality).
const eventSchema = new Schema({
  eventType: {
    type: String, required: true,
    enum: ['ingested', 'amended', 'consolidated', 'repealed', 'corrected',
           'reassessed', 'attested',
           'standard_version_superseded',   // DELTA-3: fans out reassessed via CONCRETIZES
           'incident_correlated',           // DELTA-12: event joined a correlationKey bucket
           'threshold_breached'],           // DELTA-12: aggregate crossed → significance born
  },
  workId:    { type: String, required: true },
  targetEId: { type: String },
  payload:   { type: Schema.Types.Mixed, required: true }, // Zod-validated at write
  recordedAt: { type: Date, required: true, default: Date.now },
  actor:     { type: String, required: true },
}, { collection: 'canonical_events' });
eventSchema.index({ workId: 1, recordedAt: 1 });
export const CanonicalEventModel = mongoose.model('CanonicalEvent', eventSchema);
```

> `[SoR-LATER]` — Obligation/Control/Subject/Assessment/Evidence/Finding/Remediation/DataAsset/ObligationApplicability werden nach identischem Muster als weitere `CanonicalNodeModel.discriminator(...)` angelegt (gleiche bitemporale Basis). Nicht Teil des Slice-1-Builds.

### (iii) Neo4j-Graph-Modell (Labels + typed Relationships + Constraints)

#### C-8 `[SLICE-1]` für `:Norm`/`:Provision`/`AMENDS`/`CONSOLIDATES`/`HAS_CHILD`/`CONCRETIZES`/`TRANSPOSES`/`IMPLEMENTS`; `[SoR-LATER]` für Obligation-Kette

`packages/server/src/graph/canonical-schema.cypher`

```cypher
// ─── Node labels (mirror the discriminated union) ───
// :Norm :Provision :NormAlias                                        [SLICE-1]
// :Obligation :Control :Subject :Assessment :Evidence :Finding       [SoR-LATER]
// :Remediation :DataAsset :Party :Role :Jurisdiction :AssuranceLevel :ObligationApplicability

// ─── Constraints [SLICE-1] ───
CREATE CONSTRAINT norm_workid_unique IF NOT EXISTS
  FOR (n:Norm) REQUIRE n.workId IS UNIQUE;
CREATE CONSTRAINT provision_id_unique IF NOT EXISTS
  FOR (p:Provision) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT provision_eid_per_work IF NOT EXISTS
  FOR (p:Provision) REQUIRE (p.workId, p.eId, p.recordedFrom) IS NODE KEY;
CREATE CONSTRAINT alias_unique IF NOT EXISTS
  FOR (a:NormAlias) REQUIRE (a.scheme, a.value) IS UNIQUE;

// ─── Typed relationships ───
// Structure                                                          [SLICE-1]
//   (:Norm)-[:HAS_PROVISION]->(:Provision)
//   (:Provision)-[:HAS_CHILD]->(:Provision)
//   (:Norm|:Provision)-[:HAS_ALIAS]->(:NormAlias)
// Cross-doc (ELI ontology)                                           [SLICE-1]
//   (:Norm)-[:AMENDS {validFrom}]->(:Norm)          // eIDAS 2.0 → 910/2014
//   (:Norm)-[:CONSOLIDATES {asOf}]->(:Norm)
//   (:Norm)-[:REPEALS]->(:Norm)
//   (:Norm)-[:CITES]->(:Provision)
//   (:Norm)-[:TRANSPOSES]->(:Norm)                  // DELTA-6: NIS2UmsuCG → NIS2 Directive
//   (:Norm)-[:IMPLEMENTS]->(:Provision)             // DELTA-8: CIR 2025/848 → 910/2014 Art.5b
//   (:Norm)-[:CONCRETIZES {                         // DELTA-3/14: US statute → NIST/ISO
//       pinnedVersion, pinPolicy,                   // DELTA-3: 'exact'|'latest'
//       incorporationGroupId,                       // DELTA-14: conjunctive bundle {A AND B}
//       validFrom, validUntil, conditionRef         // DELTA-14: waiver-gated, time-bounded
//   }]->(:Norm)
// Obligation chain                                                   [SoR-LATER]
//   (:Provision)-[:EXPRESSES]->(:Obligation)
//   (:Control)-[:SATISFIES {confidence}]->(:Obligation)   // many-to-many crosswalk
//   (:Obligation)-[:BINDS]->(:Role)                       // DELTA-9: 1..n roles
//   (:Organization)-[:PLAYS {registrationState}]->(:Role)-[:IN]->(:Jurisdiction)
//   (:Assessment)-[:ASSESSES_FOR]->(:Subject)             // DELTA-11: 1:n pooled
//   (:Assessment)-[:DESIGNATED_LEAD]->(:Subject)          // DELTA-11
//   (:Finding)-[:FROM]->(:Assessment)
//   (:Remediation)-[:REMEDIATES]->(:Finding)
//   (:AssuranceLevel)-[:MAPS_TO {confidence, source}]->(:AssuranceLevel)  // eIDAS↔NIST asserted
//   (:Obligation)-[:SCOPED_BY]->(:ObligationApplicability)               // DELTA-15
//   (:ObligationApplicability)-[:IN_SUBJURISDICTION]->(:Jurisdiction)     // DELTA-15
//   (:ObligationApplicability)-[:GATED_BY]->(:Norm)                       // DELTA-15 waiver
```

**Kanonischer Bitemporal-Regressionstest (eIDAS as-of):**

```cypher
// "Which eIDAS obligations were in force, as-of 2023-06 vs as-of 2026-07"
MATCH (n:Norm {workId:$eidasWorkId})-[:HAS_PROVISION]->(p:Provision)
WHERE p.validFrom <= date($asOf)
  AND (p.validTo IS NULL OR p.validTo > date($asOf))
  AND p.recordedFrom <= datetime($asKnownAt)
RETURN p.eId, p.heading ORDER BY p.materializedPath;
```

### (iv) Versionierte Ontologie / Controlled Vocabulary (Allowed-Types-Source-of-Truth)

#### C-9 `[SLICE-1]` — die Datei, die die Enum-Triplikation ersetzt (alle Delta-Vokabulare integriert)

`packages/shared/src/ontology/compliance-ontology.v1.yaml`

```yaml
# Allowed-Types contract. THIS FILE — not a TS enum — is the source of truth.
# Adding a law = adding a `sources` entry here + a data package. Zero core code edits.
ontologyVersion: "1.0.0"
schemaCompatibility: ">=1.0.0 <2.0.0"

# ── Source registry: kills the 6-value RegulationSource triplication (Blocker 1/6) ──
sources:
  - { id: dsgvo,    label: "GDPR / DSGVO", celex: "32016R0679",
      eli: "http://data.europa.eu/eli/reg/2016/679/oj", jurisdiction: EU, adapter: cellar-akn }
  - { id: nis2,     label: "NIS2 Directive", celex: "32022L2555", jurisdiction: EU, adapter: cellar-akn }
  - { id: dora,     label: "DORA", celex: "32022R2554", jurisdiction: EU, adapter: cellar-akn }
  - { id: lksg,     label: "LkSG", jurisdiction: DE, adapter: gesetze-im-internet }
  - { id: iso27001, label: "ISO/IEC 27001", jurisdiction: INTL, adapter: manual }
  - { id: custom,   label: "User-curated", jurisdiction: ANY, adapter: manual }
  # NEW laws = pure data (proof of THE-396 fix: ai_act/data_act now nameable) ──
  - { id: ai_act,   label: "EU AI Act", celex: "32024R1689", jurisdiction: EU, adapter: cellar-akn }
  - { id: data_act, label: "EU Data Act", celex: "32023R2854", jurisdiction: EU, adapter: cellar-akn }
  - { id: eidas2,   label: "eIDAS 2.0", celex: "32024R1183", jurisdiction: EU, adapter: cellar-akn }
  - { id: eidas2_ir_rp_reg, label: "CIR (EU) 2025/848 — Wallet RP Registration",
      celex: "32025R0848", eli: "http://data.europa.eu/eli/reg_impl/2025/848/oj",
      jurisdiction: EU, adapter: cellar-akn }
  - { id: ch_bgeid, label: "CH E-ID Act (BGEID)", eli: "eli/fga/2025/20",
      jurisdiction: CH, adapter: fedlex-sparql }

# ── Adapter registry: config-driven SourceParser (Blocker 2) ──
adapters:
  - { id: cellar-akn,      protocol: rest,   format: akn,      fallbackFormat: formex }
  - { id: fedlex-sparql,   protocol: sparql, endpoint: "fedlex.data.admin.ch/sparqlendpoint", format: jolux-akn }
  - { id: ecfr-versioner,  protocol: rest,   format: ecfr-json }
  - { id: govinfo-uslm,    protocol: rest,   format: uslm }
  - { id: gesetze-im-internet, protocol: rest, format: manual }
  - { id: manual,          protocol: none,   format: manual }
implementedProtocols: [rest, sparql, none]   # DELTA-F5: contract cross-checks adapter capability

# ── Alias resolver base URIs (DELTA-F1: relative ELI-CH vs absolute ELI-EU) ──
aliasResolvers:
  ELI-EU: "http://data.europa.eu/"
  ELI-CH: "https://fedlex.data.admin.ch/"

# ── Controlled vocabularies (the allowed discriminant values) ──
normKind:       [legislation, implementing_act, delegated_act, technical_standard,
                 guideline, trust_framework, court_decision, executive_order]
legalActType:   [regulation, directive, decision, recommendation, opinion]   # DELTA-6
bindingness:    [binding, binding-for-agencies, voluntary-de-facto, persuasive]
structuralType: [part, title, chapter, section, article, paragraph, point, subpoint, annex]
normativeType:  [obligation, permission, prohibition, right]
languages:      [de, fr, it, en, rm]              # DELTA-4: ISO-639-1, extensible = data
partyRole:      [Issuer, Holder, Verifier, RelyingParty, WalletProvider, Registrar,
                 TrustServiceProvider, SupervisoryBody, DataController, DataProcessor,
                 FinancialEntity, ICTThirdPartyServiceProvider,   # DELTA-2 (DORA)
                 Provider, Deployer, Importer, Distributor]       # DELTA-2 (AI Act)
sanctionType:   [monetary_fine, public_naming, ecosystem_exclusion, license_revocation, other]
assessmentStatus: [satisfied, not_satisfied, not_applicable, needs_attestation]  # human-gate

# ── Assurance (scheme-qualified, multi-axis; no official crosswalk) ──
assuranceSchemes:
  eIDAS:       { axes: [LoA],           levels: { LoA: [low, substantial, high] } }
  NIST-800-63: { axes: [IAL, AAL, FAL], levels: { IAL: [IAL1, IAL2, IAL3],
                                                   AAL: [AAL1, AAL2, AAL3],
                                                   FAL: [FAL1, FAL2, FAL3] } }
assuranceAxisApplicability: [required, not_applicable]     # DELTA-13
assuranceQualifiers: [phishing_resistant, verifier_impersonation_resistant,
                      replay_resistant, hardware_bound]    # DELTA-1

# ── Jurisdiction lifecycle state machines AS DATA ──
lifecycleMachines:
  EU: { phases: [proposal, adopted, in_force, partially_in_force, repealed], inForceRequired: true }
  CH: { phases: [consultation, adopted, referendum_passed, validated, in_force, repealed],
        inForceRequired: false }                  # "adopted, not in force, no date" is valid (BGEID)
  US: { phases: [proposed, enacted, effective, stayed, repealed], inForceRequired: false }

# ── Relation registry (DELTA-3/6/8/14) ──
relationTypes:
  AMENDS: {}
  CONSOLIDATES: {}
  REPEALS: {}
  CITES: {}
  TRANSPOSES: {}                                   # DELTA-6
  IMPLEMENTS: {}                                   # DELTA-8
  CONCRETIZES:
    properties:
      pinnedVersion:        { type: string }       # DELTA-3
      pinPolicy:            { type: enum, values: [exact, latest] }  # DELTA-3
      incorporationGroupId: { type: string }       # DELTA-14: conjunctive bundle id
      validFrom:            { type: date }          # DELTA-14
      validUntil:           { type: date }          # DELTA-14: null=open, set=ends (waiver lapse)
      conditionRef:         { type: nodeRef }       # DELTA-14: gating obligation/waiver
nodeTypes: [Norm, Provision, Obligation, Control, Subject, Assessment, Evidence,
            Finding, Remediation, DataAsset, ObligationApplicability]  # DELTA-15

# ── Deadline / trigger vocabularies (DELTA-7/12) ──
deadlineUnit:       [hours, days, months]
deadlineRelativeTo: [norm_event, incident, prior_deliverable]
aggregateKind:      [single, aggregate]
aggregateFn:        [sum, count]
correlationKey:     [rootCause, assetId, subjectId]

# ── Sanction / fine vocabularies (DELTA-13/15) ──
pinPolicy:            [exact, latest]              # DELTA-3
fineSelector:         [higher, lower]              # DELTA-13 (AI Act Art. 99)
fineSelectorCondition:[undertaking_size]
sanctionVisibility:   [supervisor, counterparty_at_transaction, public]  # DELTA-15 (BGEID 23(2))
undertakingSize:      [sme, large]                 # DELTA-13/15

# ── Executor qualifications (DELTA-14: DORA tester eligibility) ──
qualificationScheme:  [certification, insurance, experienceYears, references, managerExperienceYears]
```

### (v) Zod-Ingestion-Contract für das Onboarding-Paket

#### C-10 `[SLICE-1]` — der Reject-am-Eingang-Mechanismus (mit DELTA-4/10/13/F5)

`packages/shared/src/contracts/onboarding-package.contract.ts`

```typescript
import { z } from 'zod';
import { loadOntology } from '../ontology/loader';

const ontology = loadOntology();
const sourceId   = z.enum(ontology.sources.map(s => s.id) as [string, ...string[]]);
const normKind   = z.enum(ontology.normKind as [string, ...string[]]);
const structural = z.enum(ontology.structuralType as [string, ...string[]]);
const language   = z.enum(ontology.languages as [string, ...string[]]);   // DELTA-4

const provenanceSchema = z.object({
  source: sourceId,                       // MUST be registered (kills silent 'custom' drift → Blocker 8)
  adapter: z.string(),
  format: z.enum(['akn', 'formex', 'uslm', 'ecfr-json', 'jolux-akn', 'manual']),
  fetchedAt: z.string().datetime(),
  sourceUri: z.string().optional(),
}).superRefine((prov, ctx) => {           // DELTA-F5: adapter must exist AND be capable
  const adapter = ontology.adapters.find(a => a.id === prov.adapter);
  if (!adapter) ctx.addIssue({ code: 'custom', path: ['adapter'], message: `unknown adapter '${prov.adapter}'` });
  else if (!ontology.implementedProtocols.includes(adapter.protocol))
    ctx.addIssue({ code: 'custom', path: ['adapter'], message: `protocol '${adapter.protocol}' not implemented` });
});

const aliasSchema = z.object({
  scheme: z.string(),
  value: z.string().min(1),
  language: language.optional(),          // DELTA-4: was z.enum(['de','en'])
  validFrom: z.string().datetime().optional(),
});

const axisConstraintSchema = z.object({   // DELTA-13
  scheme: z.string(),
  axis: z.enum(['LoA', 'IAL', 'AAL', 'FAL']),
  applicability: z.enum(['required', 'not_applicable']).default('required'),
  operator: z.enum(['gteq', 'eq']).optional(),
  value: z.string().optional(),
  ordinal: z.number().optional(),
  qualifiers: z.array(z.string()).optional(),
}).superRefine((c, ctx) => {
  if (c.applicability === 'required' && (!c.operator || !c.value))
    ctx.addIssue({ code: 'custom', path: ['operator'], message: 'operator+value required when applicability=required' });
  if (c.applicability === 'not_applicable' && (c.operator || c.value))
    ctx.addIssue({ code: 'custom', path: ['applicability'], message: 'not_applicable axis MUST NOT carry operator/value (no IAL ≠ IAL1)' });
});

const provisionSchema = z.object({
  structuralType: structural,
  eId: z.string().regex(/^[a-z0-9_]+(__[a-z0-9_]+)*$/), // AKN @eId shape
  parentEId: z.string().nullable(),
  ordinal: z.number().int().nonnegative(),
  heading: z.string().optional(),
  fullText: z.string().min(1).max(20000).optional(),
  validFrom: z.string().datetime().optional(),          // DELTA-10: per-provision staggered entry
  validTo: z.string().datetime().nullable().optional(), // DELTA-10 (AI Act / Data Act)
});

/** The whole package. If this fails, the store is NOT touched (append-only + reject). */
export const OnboardingPackageSchema = z.object({
  ontologyVersion: z.string(),
  norm: z.object({
    workId: z.string(),
    kind: normKind,
    legalActType: z.string().optional(),                // DELTA-6
    bindingness: z.enum(ontology.bindingness as [string, ...string[]]),
    jurisdiction: z.object({ code: z.string(), subCode: z.string().optional() }),
    lifecycle: z.object({
      phase: z.string(),
      jurisdictionCode: z.string(),
      inForceDate: z.object({ value: z.string(), source: z.string(), asOf: z.string() }).optional(),
    }),
    aliases: z.array(aliasSchema).min(1),
    title: z.record(language, z.string()),              // DELTA-4: fr/it now valid
  }),
  provisions: z.array(provisionSchema).min(1),
  provenance: provenanceSchema,
}).superRefine((pkg, ctx) => {
  const machine = ontology.lifecycleMachines[pkg.norm.jurisdiction.code];
  if (machine && !machine.phases.includes(pkg.norm.lifecycle.phase))
    ctx.addIssue({ code: 'custom', path: ['norm', 'lifecycle', 'phase'],
      message: `phase '${pkg.norm.lifecycle.phase}' not in ${pkg.norm.jurisdiction.code} machine` });
  if (machine?.inForceRequired && !pkg.norm.lifecycle.inForceDate)
    ctx.addIssue({ code: 'custom', path: ['norm', 'lifecycle', 'inForceDate'],
      message: 'inForceDate required by this jurisdiction machine' });
});

export type OnboardingPackage = z.infer<typeof OnboardingPackageSchema>;
```

### Explizites Standards-Mapping (Pflicht-Nachweis)

| Standard-Konzept | Kanonisches Artefakt | Feld / Kante |
|---|---|---|
| OSCAL Catalog ↔ Norm | `Norm` (C-3) | `Norm.identity.workId`; `:Norm`-Knoten |
| OSCAL Profile ↔ Applicability | `Subject`+`ObligationApplicability` (C-5) | `Subject.role`+`jurisdictionCode`; `ObligationApplicability.subCode` |
| OSCAL Assessment-Results ↔ GAP-001 | `Assessment`+`Finding` (C-5) | `Finding.gapStatus ∈ {open,in_progress,resolved}` |
| OSCAL POA&M ↔ Remediation | `Remediation` (C-5) | `(:Remediation)-[:REMEDIATES]->(:Finding)` |
| DPV-TOM ↔ Control | `Control` (C-5) | `Control.dpvTomConcepts[]` + `isoAnnexARef[]` |
| ODRL-Policy ↔ Obligation | `Obligation.odrl` (C-5) | `OdrlRule{ruleType, action, constraints}` |
| DCAT-Dataset ↔ ArchiMate-Data-Layer | `DataAsset` (C-5) | `DataAsset.archimateElementId` + `-[:REALIZES]->(:ArchiMateElement)` |
| AKN `@eId` ↔ Hierarchie | `Provision` (C-4) | `Provision.eId` + `materializedPath` |
| ELI amends/consolidates | Neo4j (C-8) | `(:Norm)-[:AMENDS]->(:Norm)` (eIDAS 2.0 → 910/2014) |
| Bitemporalität (Snodgrass) | `BitemporalStamp` (C-1) | `validFrom/validTo` + `recordedFrom/recordedTo` |
| Event Sourcing / Data Vault 2.0 | `CanonicalEvent` (C-7) | append-only `eventType`, State = Projektion |
| Discriminated Union vs. EAV | alle (C-3–C-5) | `nodeType`/`kind`-Diskriminatoren, strict, kein `any` |
| VERLOCK-Erhalt | `Provision` (C-4/C-6) | `legacyRegulationKey`+`legacyVersionHash` = `sha256(fullText)` |
| Sanktions-Typ (nicht `maxFine`) | `Sanction` (C-5) | DU `public_naming`/`ecosystem_exclusion` (BGEID Art. 23) |
| Assurance mehrachsig | `AssuranceRequirement` (C-5) | `axisConstraints[]` + `MAPS_TO` eIDAS↔NIST |

---

## 4. Korpus-Migration (flach → hierarchisch, bitemporal, VERLOCK-erhaltend) `[SLICE-1]`

### 4.0 Migrations-These

Die Migration ist **kein Cutover, sondern eine Projektion**. Solange jedes Blatt-`Provision` `legacyRegulationKey` (= `buildRegulationKey(source, paragraphNumber)`) und `legacyVersionHash` (= `sha256(fullText)`) trägt, sehen alle Legacy-Consumer (`corpusClient`/`regulationResolver`/`detectMappingDrift`) unveränderte Daten. Der Strangler-Seam (`regulationResolver.service.ts:82-95`) wird nicht ersetzt, sondern bekommt eine dritte Read-Quelle vorgeschaltet. Kein UC ändert seine Read-Shape.

### 4.1 Sechs-Phasen-Pipeline (append-only, event-sourced, idempotent)

| Phase | Operation | Idempotenz-Schlüssel | Anker |
|---|---|---|---|
| **M1 Norm-Backfill** | Pro distinct `source` ein `Norm`-Knoten (C-6) mit `workId = hash(source)` + Alias `{scheme:'regulationKey', value:source}`. Ontologie-`sources`-Eintrag liefert CELEX/ELI-Aliase. | `Norm.identity.workId` deterministisch | C-9 `sources[]`, `regulation-key.ts:20` |
| **M2 Struktur-Ableitung** | Aus `paragraphNumber` via `normaliseParagraph` den `@eId` + `materializedPath` berechnen. Fehlende Chapter-Parents bleiben zunächst flach (Artikel = Norm-Kind), kein Datenverlust. | `{workId, eId, recordedFrom}` (C-6 Index) | Blocker 3/7 |
| **M2b CELLAR-Reingest** | Für EU-Quellen mit CELEX: AKN aus CELLAR ziehen, echte Chapter→Point-Bäume mit `@eId`; Migrations-Blatt per `@eId`-Match zum Baumknoten **konsolidieren** (Event `consolidated`), nicht duplizieren. | `@eId` je Work | ADR-Struktur, C-8 |
| **M3 Content-Transfer** | Alt-`fullText` → Blatt-`Provision.fullText`. `legacyVersionHash = sha256(fullText)` = `computeVersionHash`; `legacyRegulationKey = buildRegulationKey(...)`. | `legacyRegulationKey` (C-6 Index) | `regulationVersion.ts`, VERLOCK |
| **M4 Bitemporal-Stamp** | `validFrom = effectiveFrom`, `validTo = null`, `recordedFrom = now`. Amendment schließt prior `validTo`/`recordedTo` **append-only**, fügt neuen Record ein. | `temporal.recordedFrom` im @eId-Key | ADR-Temporalität |
| **M5 Event-Log** | Jede Operation schreibt `CanonicalEvent` (`ingested`/`consolidated`). State = Projektion → rebuildbar nach Parser-Fix. | `{workId, recordedAt}` | C-7 |

**Idempotenz-Garantie:** Re-Run ist No-Op, weil jede Phase auf einen deterministischen Schlüssel upserted — dasselbe Dedup-Prinzip wie `ComplianceMapping.unique_mapping` (`:114-117`).

### 4.2 Strangler-Erhalt

`regulationResolver.service.ts` bekommt eine korpus-hierarchisch-first-Quelle **vor** die bestehende Kette, ohne sie zu entfernen:

```
getRegulationsByKeys(keys)  →  canonical Provision WHERE legacyRegulationKey ∈ keys
                                AND temporal.recordedTo IS null (current)
                            →  provisionToView() → RegulationView (:22-33)
   ↓ (empty / corpus unconfigured)
Regulation.find({projectId})   ← unveränderter App-DB-Fallback (:93)
```

`getCurrentVersionHashes` (von `detectMappingDrift` konsumiert) liest künftig `legacyVersionHash` vom aktuellen `Provision`-Record — Drift-Vergleich bleibt byte-identisch. **VERLOCK erhalten.**

---

## 5. Cross-Walk-Mechanismus (SCF/UCF-Stil) `[SoR-LATER]`

Der Cross-Walk ist eine **many-to-many `SATISFIES`-Kante** `(:Control)-[:SATISFIES {confidence}]->(:Obligation)`. Ein interner Control erfüllt viele Regulationen — kein paarweises Regulation-zu-Regulation-Mapping (das skaliert quadratisch). Seed-Katalog: ISO/IEC 27001:2022 Annex A; Vor-Crosswalk: Secure Controls Framework (SCF, frei), UCF nur als kommerzieller Benchmark der Pipeline (ADR-Crosswalk).

### Konkretes „assess once, comply many"-Beispiel

Ein Encryption-/Access-Control-TOM erfüllt drei Regime gleichzeitig:

```cypher
MERGE (c:Control {controlKey:'CTRL-ENCRYPTION-AT-REST'})
  SET c.isoAnnexARef = ['A.8.24'], c.dpvTomConcepts = ['dpv:Encryption'],
      c.scfRef = ['CRY-01']
MATCH (o1:Obligation {legacyRef:'dsgvo:art-32'})     // GDPR Security of processing
MATCH (o2:Obligation {legacyRef:'nis2:art-21-2-h'})  // NIS2 cryptography measure
MATCH (o3:Obligation {legacyRef:'dora:ict-risk'})    // DORA ICT-risk encryption control
MERGE (c)-[:SATISFIES {confidence:0.92, source:'SCF-CRY-01'}]->(o1)
MERGE (c)-[:SATISFIES {confidence:0.88, source:'SCF-CRY-01'}]->(o2)
MERGE (c)-[:SATISFIES {confidence:0.85, source:'SCF-CRY-01'}]->(o3);
```

Ein einziges Assessment gegen `CTRL-ENCRYPTION-AT-REST` (Status `needs_attestation`, human-zertifiziert) speist gleichzeitig die GAP-Berechnung dreier Regulationen. `Control.scfRef` bindet an den SCF-Common-Control; `dpvTomConcepts` an die DPV-TOM-Semantik; `isoAnnexARef` an den Seed-Katalog.

---

## 6. „ADD A NEW LAW"-Playbook (end-to-end, sechs Beweisfälle)

Jeder Fall: echte CELEX/ELI, echte Klauseln, Adapter-Config, contract-konformes Datenpaket, Null-Code-Nachweis. Alle Klauseln sind web- bzw. amtlich-verifiziert (2026-07-05).

### 6.1 NIS2 (Richtlinie (EU) 2022/2555) `[SLICE-1]`-Struktur / `[SoR-LATER]`-Obligation

CELEX `32022L2555`, ELI `http://data.europa.eu/eli/dir/2022/2555/oj`, in Kraft 27.12.2022. Echte Klauseln: **Art. 21(2)(a)–(j)** (Risk-Management-Measures, u. a. (h) „policies … regarding the use of cryptography and, where appropriate, encryption"); **Art. 23(4)** (early warning „within 24 hours", notification „within 72 hours", final report „not later than one month after the submission of the incident notification").

**Instanziierung:** `Norm` mit `source:'nis2'` (Ontologie-registriert, kein Enum-Edit), `kind:'legislation'`, **`legalActType:'directive'`** (DELTA-6 — trennt Richtlinie von unmittelbar geltender Verordnung). Provisions-Baum `chp_IV → chp_IV__art_21 → …__para_2__point_h` (10 `point`-Blätter für (a)–(j)). Art. 23(4) als `DerivedDeadline` mit `baseEvent:{kind:'single', baseEventType:'incident_awareness'}`, `offset:{value:24, unit:'hours'}`, `relativeTo:'incident'` (DELTA-7); final report als `relativeTo:'prior_deliverable'`. Nationales Umsetzungsgesetz via `(NIS2UmsuCG)-[:TRANSPOSES]->(NIS2)` (DELTA-6). Recurring-Incident-Aggregation (CIR 2024/2690 Art. 4) als `AggregateBaseEvent{correlationKey:'rootCause', window:{6,'month'}, threshold:{sum, 'financialLossEur', gteq, 500000}}` (DELTA-12). Adapter: `cellar-akn` (wiederverwendet). **Null Code, null Enum-Edit** — belegt: `nis2` registriert, Adapter bestehend, VERLOCK via `legacyVersionHash`.

### 6.2 DORA (Verordnung (EU) 2022/2554) `[SLICE-1]`/`[SoR-LATER]`

CELEX `32022R2554`, ELI `.../eli/reg/2022/2554/oj`, anwendbar 17.01.2025. Echte Klauseln: **Art. 28(3)** (Register-of-Information „at entity level, and at sub-consolidated and consolidated levels"); **Art. 26(1)** („at least every 3 years advanced testing by means of TLPT"); **Art. 26(2)** (TLPT-Scope „critical or important functions … live production systems"); **Art. 26(3)** Pooled Testing.

**Instanziierung:** `Norm` `source:'dora'` (registriert), `kind:'legislation'`, `legalActType:'regulation'`. Register-Pflicht als `Obligation{bearerRoleIds:['FinancialEntity']}` (DELTA-2: Rolle jetzt reine Daten). TLPT-3-Jahres-Frist als rollierendes `DerivedDeadline{baseEvent:{single,'last_TLPT_completed'}, offset:{36,'months'}}`. Pooled-Test als **ein** `Assessment{subjectIds:[fe1, fe2, …], designatedLeadSubjectId:fe1}` (DELTA-11 — eine Test-/Evidenz-Einheit für N Entities). Tester-Eignung als `Subject.qualifications` + `RotationConstraint{everyN:3, requiredExecutorProperty:'external'}` (DELTA-14). ITS 2024/2956 + RTS-TLPT via `(...)-[:CONCRETIZES]->(...)`. Cross-Walk: `CTRL-SUPPLIER-REGISTER` (`isoAnnexARef:['A.5.19','A.5.21']`) erfüllt DORA Art. 28 + NIS2 Supply-Chain + GDPR Art. 28. **Null Code.**

### 6.3 EU AI Act (Verordnung (EU) 2024/1689) `[SLICE-1]`/`[SoR-LATER]`

CELEX `32024R1689`, ELI `.../eli/reg/2024/1689/oj`, gestaffelte Geltung (Art. 5 ab 2025-02-02, Art. 53 ab 2025-08-02, Hochrisiko ab 2026-08). Echte Klauseln: **Art. 5(1)(a)** (Prohibition subliminaler/manipulativer Techniken „with the objective, or the effect … significant harm"); **Art. 5(1)(d)** (Predictive Policing); **Art. 53(1)(c)/(d)** (Copyright-Policy, Training-Data-Summary); Schwellenwert **10^25 FLOP** (Art. 51).

**Instanziierung:** `Norm` `source:'ai_act'` (**THE-396-Fix — jetzt benennbar statt still unter `custom`**), `kind:'legislation'`, `lifecycle.phase:'partially_in_force'`. Provisions-Baum `chp_II → art_5 → …__point_a`. Verbot als `Obligation{normativeType:'prohibition', bearerRoleIds:['Provider','Deployer']}` (DELTA-2 + DELTA-9 Rollen-Disjunktion). GPAI-Applicability als OSCAL-Profile über `Subject.appliesWhen [{modelKind eq gpai},{trainingFlops gt 1e25}]` (Schwellenwert-Senkung = Datenwert-Edit). Open-Source-Ausnahme (Art. 53(2)) als `exemptWhen`-Daten. Gestaffelte Geltung als per-Provision `validFrom` (DELTA-10). Bussgeld-Dualität `Sanction{monetary_fine, fixedCap:35e6, turnoverPct:7, selector:'higher', selectorConditionedOn:'undertaking_size'}` (DELTA-13). Konditionales „objective OR effect" bleibt ODRL-Ausdrucksgrenze → `needs_attestation` (Human-Gate). **Null Code, null Enum-Edit.**

### 6.4 EU Data Act (Verordnung (EU) 2023/2854) `[SLICE-1]`/`[SoR-LATER]`

CELEX `32023R2854`, ELI `.../eli/reg/2023/2854/oj`, in Kraft 11.01.2024, Geltung 12.09.2025. Echte Klauseln: **Art. 5(1)** (Data-Sharing-Duty „upon request … make available … machine-readable format"); **Art. 25(2)(a)/(d)** (Cloud-Switching „maximum transitional period of 30 calendar days", „notice period … not exceed two months").

**Instanziierung:** `Norm` `source:'data_act'` (registriert), `kind:'legislation'`. Art. 5(1) als `Obligation{bearerRoleIds:['DataHolder'], odrl:{ruleType:'duty', action:'makeDataAvailable'}}`. Art. 25(2) als `DerivedDeadline{offset:{2,'months'}, baseEvent:{single,'switching_request'}}`. Sanktions-Zuständigkeit (Art. 40 i.V.m. Art. 33): Kap. II/III → DSGVO Art. 83(5), Kap. VI → nationale Regime (kein EU-Cap) — als `Sanction{monetary_fine, basis:'GDPR Art. 83(5) via Data Act Art. 40'}`. DataAsset via DCAT (`dcatType:'Dataset'`). **Null Code.**

### 6.5 (Identitäts-Beweisfall i) Schweizer BGEID via Fedlex — Nicht-CELLAR-Pfad `[SLICE-1]`

BGEID, verabschiedet 20.12.2024, Referendum 28.9.2025 (50,39 % Ja), **per 07/2026 nicht in Kraft, keine SR-Nummer**. Identität: ELI `eli/fga/2025/20` + `BBl 2025 20`. Echte Klauseln (amtlicher Schlussabstimmungstext, `scratchpad/bgeid_final.txt`): **Art. 23** (Überidentifikations-Verbot; Abs. 2: BIT trägt Verletzung „im Vertrauensregister … sichtbar ein und kann die Verifikatorinnen … ausschliessen"); **Art. 24** (Akzeptanzpflicht, Übergangsfrist „zwei Jahre nach Inkrafttreten"); **Art. 36** (Referendum + Bundesrat bestimmt Inkrafttreten).

**Der Beweis:**
- **Identität ohne SR-Nummer:** `NormIdentity{workId:'work_ch_bgeid_2024', aliases:[{ELI-CH,'eli/fga/2025/20'},{BBl,'BBl 2025 20'},{abbrev,'BGEID',de},{abbrev,'LeID',fr},{abbrev,'LIdE',it}]}`. **Nachtrags-Merge:** bei Inkrafttreten erscheinen `AS`- und `SR`-Alias als reines `append` mit `validFrom` — kein `workId`-Wechsel (Event `corrected`).
- **Lebenszyklus:** `lifecycle.phase:'referendum_passed'` ∈ `lifecycleMachines.CH.phases`; `inForceDate: null` erlaubt, weil `CH.inForceRequired:false`. Art. 24 als `DerivedDeadline{baseEvent:{single,'art_24_in_force'}, offset:{24,'months'}}` — `computedValue` bleibt ungesetzt bis Inkrafttreten (führbare *upcoming obligation*).
- **Dreisprachigkeit (DELTA-4 + DELTA-5):** `title:{de,fr,it}` und `expressionLanguage` in VERLOCK-Pin — sonst kollidierten drei `fullText` auf einen sprach-blinden Key. **Ohne DELTA-4 wäre dies ein Enum-Edit** (Code-belegt: `RegulationLanguage='de'|'en'`, `compliance.types.ts:72`) → geheilt.
- **Nicht-monetäre Sanktion:** `Sanction[{public_naming, register:'CH-Vertrauensregister', visibility:'counterparty_at_transaction', audience:'Holder'}, {ecosystem_exclusion}]` (DELTA-15). Risk-Scoring liest den Typ, nicht `maxFine` — bewertet nicht fälschlich als risikolos.
- **Adapter:** `fedlex-sparql` (`protocol:sparql, format:jolux-akn`) — Registry-Eintrag, keine neue Klasse. Fedlex-HTML ist eine JS-SPA (empirisch bestätigt, `scratchpad/bgeid_fedlex.html`: nur Angular-Shell, kein Rechtstext); SPARQL + AKN-Filestore ist die einzige valide Quelle (`scratchpad/bgeid.xml`). Kein Firecrawl-Budget (THE-403-NO-GO gewahrt). **Null Code.**

### 6.6 (Identitäts-Beweisfall ii) eIDAS 2.0 (Verordnung (EU) 2024/1183) als AMENDS-Fall `[SLICE-1]`

CELEX `32024R1183`, ELI `.../eli/reg/2024/1183/oj`, in Kraft 20.05.2024. **ÄNDERT** 910/2014 (Art. 1: „Regulation (EU) No 910/2014 is amended as follows"). Konsolidierter Stand: ELI `.../eli/reg/2014/910/2024-10-18`. Echte Klausel **Art. 5a(1)** (eingefügt): Wallet „within 24 months of the date of entry into force of the implementing acts". Durchführungsakt-Frist Art. 5a(23): „By 21 November 2024". CIR (EU) 2025/848 (CELEX `32025R0848`): RP-Register-Pflicht, „shall apply from the 24 December 2026".

**Der Beweis:**
- **AMENDS als Daten:** Zwei Onboarding-Pakete (`work:eu:reg:2024:1183` und konsolidiertes `work:eu:reg:2014:910`); die neuen Art. 5a–5f fließen als bitemporale `Provision`-Blätter **unter 910/2014** mit `validFrom:'2024-10-18'`. Graph: `(1183)-[:AMENDS {validFrom:date('2024-10-18')}]->(910)` + `(1183)-[:CONSOLIDATES {asOf:date('2024-10-18')}]->(910)`.
- **DerivedDeadline (berechnet, nicht hartkodiert):** Wallet-Pflicht als `{baseEvent:{single,'implementing_act_in_force'}, offset:{24,'months'}}` → `computedValue ≈ 24.12.2026` bei Auflösung des Event-Datums.
- **RP-Registrierung:** CIR 2025/848 via `(2025/848)-[:IMPLEMENTS]->(910/2014 Art.5b)` (DELTA-8). Rollen-gebundene Pflicht mit Vorbedingung: `Subject{role:'RelyingParty', registrationState:'registered'}` + ODRL-`Constraint{leftOperand:'registrationState', operator:'eq', rightOperand:'registered'}`.
- **Bitemporaler Regressionstest (C-8):** `asOf='2023-06-01'` → `art_5a` fehlt (`validFrom 2024-10-18 > 2023-06-01`) → korrekt (Wallet-Pflicht existierte 2023 nicht); `asOf='2026-07-05'` → `art_5a` erscheint → korrekt (konsolidierter Stand). **Null Code, null Enum-Edit** für Struktur/Identität/Amendment.

---

## 7. Migrationsplan mit UC-Erhalt-Tabelle

Jede UC läuft nach Migration als typisierte **View X über Graph Y**, Invariante Z erhalten. `[S1]`/`[SoR]`.

| UC | View X (Read-Shape) | Store Y | Invariante Z — erhalten durch | Slice |
|---|---|---|---|---|
| **UC-ICM-001** | `getRegulationsByKeys → provisionToView` (unverändertes `RegulationView :22-33`); Qdrant an `Provision.id` re-gekeyt, `legacyRegulationKey` als Payload | Mongo `canonical_nodes` + Qdrant | `{regulationKey,version}` = `legacyRegulationKey` + Alias; 768-dim-Kontrakt unberührt (nur Node-ID-Rekey) | `[S1]` |
| **UC-ICM-002** | Mapping unverändert; `regulationKey (:68)` referenziert Blatt-`Provision`, selbe String-Semantik | `ComplianceMapping` (unangetastet) | `createdBy=llm`-reasoning-Pflicht (`:88-96`) unverändert | `[S1]` |
| **UC-ICM-003** | Reverse (`:121-124`) / Forward (`:128-131`) / Heatmap-Indizes unverändert | `ComplianceMapping`-Indizes | Alle drei Query-Indizes + Lifecycle-Enum + `live-mapping`-Provenance (`:61`) | `[S1]` |
| **UC-REQGEN-001** | Requirement-View unverändert; Idempotenz-Achse `regulationId → regulationKey` **verschoben, nicht ersetzt** (R1–R4) | `ComplianceRequirement` + `Provision` | Re-Run-Idempotenz durch dual-Index-Übergang + feiner-granularen `regulationKey`; `extractionConfidence`-`llm`-Pflicht (`:97-118`) unberührt | `[S1]` |
| **UC-GAP-001** | Gap bleibt **LIVE über current `Provision`** (`recordedTo IS null`) berechnet | Live-Query `ComplianceMapping` × current `Provision` | **GAP bleibt LIVE-computed** — keine Materialisierung; nur bitemporaler current-Filter ergänzt | `[S1]` |
| **UC-VERLOCK-001** | `detectMappingDrift` vergleicht `regulationVersionHash` gegen `getCurrentVersionHashes` (liest `Provision.legacyVersionHash`) | `by_corpus_reference (:134-137)` + `Provision` | **VERLOCK erhalten:** `legacyVersionHash = sha256(fullText) = computeVersionHash`; Drift-Vertrag hängt an `regulationKey`+Hash, nicht `regulationId` | `[S1]` |
| **UC-WFCOMP-001** | `regulationRef {regulationKey, versionHash} (:18)` referenziert Blatt-`Provision`; `ART30_FIELDS` bleibt Seed, langfristig daten-getrieben | `WfcompAssessment` + `Provision` (+ später C-5) | **`needs_attestation` bleibt First-Class human-certified** — Ontologie `assessmentStatus`, `createdBy`/`attestedBy` (Asilomar #16); nie auto-green/red | `[S1]`-Ref / `[SoR]`-Full-OSCAL |
| **UC-GOV-001 / UC-VIS-001** | `Policy`-Engine unverändert; `PolicySource` optional an `Norm.workId`/`Provision.eId` linkbar | `Policy` (unangetastet) + optionaler Link | field/operator/value-Engine + `scope`-Shape + `PolicyViolation`-Lifecycle unberührt; Source-Fragmentierung via Ontologie vereinheitlicht ohne Enum-Bruch | `[SoR]`-Link / `[S1]`-Engine |

### `ComplianceRequirement`-Umhängung ohne Idempotenz-Bruch (R1–R4)

**Problem:** `regulationId {ref:'Regulation', required:true}` (`:52`), Idempotenz an `{projectId, regulationId, title}` (`:150-153`). Ein korpus-only Gesetz kann kein Requirement tragen (Blocker 5).

| Schritt | Operation | Idempotenz-Erhalt |
|---|---|---|
| **R1** | `regulationKey: String` **additiv** (optional, wie `ComplianceMapping.regulationKey:68`); `regulationId` bleibt required | Kein Index-Change → Re-Run unverändert idempotent |
| **R2** | Backfill `regulationKey = buildRegulationKey(referenced.source, referenced.paragraphNumber)` — deterministisch | reine Anreicherung, kein Duplikat |
| **R3** | Dual-Partial-Unique-Index `{projectId, regulationKey, title}` (`partialFilterExpression: {regulationKey:{$exists:true}}`) **additiv**; Upsert schreibt beide Felder | beide Indizes gültig → Re-Run kollidiert auf beiden Schlüsseln |
| **R4** | `regulationId` auf `required:false` senken (nicht droppen), alten Index droppen; neuer Index alleinige Achse. Korpus-only-Gesetze tragen ab jetzt Requirements | `regulationKey` ist feiner-oder-gleich granular als `regulationId` → Dedup mindestens so streng |

**Warum kein Bruch:** ein `regulationId` → genau ein `regulationKey` (nie mehrere); der Titel-Dedup unter dem neuen Schlüssel ist mindestens so streng wie unter dem alten. R4-Gate = „100 % der Requirements haben `regulationKey`" (zählbar, wie THE-389 all-zero-heal-Gate).

---

## 8. Build-Slice-Zuordnung

| Deliverable / Artefakt | Slice | Begründung |
|---|---|---|
| D1 Current-State-Teardown | `[SLICE-1]` | Pflicht-Fundament |
| C-1 base.types (Bitemporal/Provenance/RegulationLanguage) | `[SLICE-1]` | REQ-CANON-001.4 |
| C-2 identity.types (workId + Alias-DU) | `[SLICE-1]` | ADR-0004-R, THE-390-Foundation |
| C-3 norm.types (normKind/bindingness/maturity/jurisdiction/lifecycle) | `[SLICE-1]` | REQ-CANON-001.1 |
| C-4 structure.types (AKN @eId + DELTA-5) | `[SLICE-1]` | REQ-CANON-001.3 |
| C-5 obligation.types (Obligation→…→Remediation, alle Deltas) | `[SoR-LATER]` | System-of-Record-Familie |
| C-6 CanonicalNode Mongo (Norm/Provision) | `[SLICE-1]` | REQ-CANON-001.3/.4 |
| C-7 CanonicalEvent (Event Sourcing) | `[SLICE-1]` | REQ-CANON-001.4 |
| C-8 Neo4j `:Norm`/`:Provision`/AMENDS/CONSOLIDATES/TRANSPOSES/IMPLEMENTS/CONCRETIZES | `[SLICE-1]` | REQ-CANON-001.3, DELTA-3/6/8/14 (CONCRETIZES ist Slice-1-Kante) |
| C-8 Obligation-Chain-Kanten (SATISFIES/PLAYS/ASSESSES_FOR/MAPS_TO/SCOPED_BY) | `[SoR-LATER]` | SoR-Familie |
| C-9 Ontologie (Source-/Adapter-Registry, Vocabs, Lifecycle-Machines) | `[SLICE-1]` | REQ-CANON-001.1/.5 |
| C-10 Zod-Contract | `[SLICE-1]` | REQ-CANON-001.5 |
| E-1 Korpus-Migration flach→hierarchisch | `[SLICE-1]` | REQ-CANON-001.3/.4, blockedBy THE-368 |
| E-2 Identitätsmodelle-Merge + R1–R4 | `[SLICE-1]` | Blocker 5, vor SoR |
| D4 „Add a new law"-Beweis (6 Fälle) | `[SLICE-1]` | REQ-CANON-001.6 |
| D5 SCF-Crosswalk | `[SoR-LATER]` | §5, SoR-Familie |
| **ADR-0004-Revision (Norm-Identität-Uplift)** | `[SLICE-1]` | **PFLICHT-Deliverable**; Design-Output hier, Build in THE-390 P0 |

**Sequenzierung:** blockedBy THE-368 (Strangler abgeschlossen); baut auf THE-390 (Unified Norm-Entity) auf, ersetzt es nicht. **Design-first-Deltas** (müssen vor dem SoR-Build im C-5-Design stehen, sonst zweite Migration): DELTA-9 (`bearerRoleIds`), DELTA-11 (`subjectIds`/Assessment-Kardinalität), DELTA-12 (`AggregateBaseEvent`), DELTA-13/15 (ObligationApplicability/Sanction).

---

## 9. ADRs (volles Set)

Format je ADR: **Kontext · Optionen · Entscheidung · Begründung gegen benannten Standard · Verworfene Alternative + warum · Konsequenzen · Slice-Tag.**

### ADR-0004-R (Uplift) — Norm-Identität: interne `workId` + Alias-DU `[SLICE-1, PFLICHT]`

- **Kontext.** Zwei Identitätsmodelle setzen Publikationsschlüssel = primäre Identität voraus. Widerlegt: BGEID hat keine SR-Nummer; US ist citation-keyed; 4-Wert-`RegulationJurisdiction` (`compliance.types.ts:70`, live verifiziert) kann US-Bundesstaaten/Kantone nicht tragen.
- **Optionen.** (a) CELEX als PK. (b) ELI-URI als PK. (c) interne opake `workId` + Alias-DU.
- **Entscheidung.** (c). `NormAlias{scheme, value, language?, validFrom?}` als DU über Schemes; FRBR Work/Expression/Manifestation; **Merge-Logik für nachträgliche Identifikatoren Pflicht** (BBl→AS→SR). `buildRegulationKey` bleibt *ein* Alias-Generator.
- **Begründung gegen CELEX.** CELEX ist „EU-only-Adapter, kein universeller PK" (Auftrag Z. 71) — CELLAR-Lock-in; BGEID/US haben keinen CELEX-Wert.
- **Begründung gegen reines ELI.** ELI ist der bevorzugte Alias, aber kein alleiniger PK: US hat kein ELI; BGEID-`eli/fga/` wandert zu `eli/cc/` — ELI-PK würde Identität an wandernden Wert nageln.
- **Verworfene Alternative.** Publikations-Key-als-Identität — bricht an Identitäts-Wanderung (BGEID) und Jurisdiktions-Heterogenität (US).
- **Konsequenzen.** THE-390 P0 baut das Norm-Schema alias-aware; VERLOCK hängt an `{workId, expression, version}`. `[SLICE-1]`.

### ADR-Structure — AKN `@eId`-Taxonomie ohne AKN-XML-Persistenz `[SLICE-1]`

- **Kontext.** Korpus flach (Blocker 3/7). **Entscheidung.** AKN-Hierarchie-Taxonomie + `@eId`-Konvention auf Property-Graph, ohne AKN-XML in Mongo. **Begründung gegen volle AKN-XML-Persistenz.** XPath/XML-Query-Last ohne Mehrwert; Auftrag Z. 69 schreibt „ohne volles AKN-XML in Mongo" vor. **Verworfen:** flach lassen (Sub-Struktur bliebe Code). **Konsequenzen.** Migration D3. `[SLICE-1]`.

### ADR-Cross-Doc-Relations — ELI-Ontologie AMENDS/CONSOLIDATES `[SLICE-1]`

- **Kontext.** eIDAS 2.0 ändert 910/2014; operatives Recht = konsolidierter Text. **Entscheidung.** ELI-Relationen als typisierte Neo4j-Kanten. **Begründung gegen „keine Relationen".** ELI ist die einzige Ontologie, die Cross-Doc + Point-in-Time standardisiert. **Verworfen:** Change als isolierter Datensatz — dann versagt der Bitemporal-Regressionstest. `[SLICE-1]`.

### ADR-Ingest — CELLAR (AKN, Fallback Formex) + Adapter-Registry als Daten `[SLICE-1]`

- **Kontext.** `SourceParser` klassenbasiert + enum-gebunden (`sources/types.ts:24`); nur nis2/dsgvo/lksg haben Parser (Blocker 2). **Entscheidung.** Config-getriebene Adapter-Registry (CELLAR, Fedlex-SPARQL, eCFR, GovInfo/USLM); neue Quelle = Registry-Eintrag. **Begründung gegen Firecrawl/HTML-Scraping.** Ziele sind XML-/API-first; Fedlex-HTML ist JS-SPA (empirisch widerlegt); THE-403-NO-GO gewahrt. **Verworfen:** Parser-Klasse pro Quelle (Verstoß gegen „Daten statt Code"); CELEX als Ingest-Identität (CELLAR-Lock-in). `[SLICE-1]`.

### ADR-Obligation-Chain — NIST OSCAL `[SoR-LATER]` (Design SLICE-1-vollständig)

- **Kontext.** Keine durchgängige obligation→remediation-Kette; WFCOMP Art.30-tailored (Blocker 4). **Entscheidung (load-bearing).** OSCAL-Kette (Catalog→Profile→SSP→Assessment-Results→POA&M): Gesetz=Catalog, Applicability=Profile, GAP=Assessment-Results, Remediation=POA&M. **Begründung gegen proprietär/Art.30-shaped.** OSCAL ist die eine offene, regulierungs-agnostische Modellierung; Art.30-shaped bricht das Kernprinzip. **Verworfen:** WFCOMP-`gapReport` generalisieren (gdprScope hart eingebacken). `[SoR-LATER]`.

### ADR-Privacy-Semantics — W3C DPV v2.x + Identity-Extension `[SoR-LATER]`

- **Kontext.** records-of-processing heute Art.30-geformt. DPV 2.2 liefert kein LoA/Wallet/eIDAS. **Entscheidung.** DPV-Vokabular + kleine namespaced Identity-Extension (LoA, Wallet, Unlinkability, SelectiveDisclosure), dokumentierter Alignment-Pfad. **Begründung gegen DPV pur.** Identitäts-Lücke explizit (Auftrag Z. 107) — ohne Extension scheitern Identity-Beweisfälle. **Verworfen:** Art.30-Felder (DSGVO-locked); DPV-pur-und-warten (blockiert Slice). `[SoR-LATER]`.

### ADR-Duty-Formalism — W3C ODRL 2.2 `[SoR-LATER]`

- **Kontext.** „Obligation" nur Prosa. **Entscheidung.** ODRL 2.2 (Permission/Prohibition/Duty). **Begründung gegen eigenes Prädikat-Schema.** ODRL ist in Gaia-X/IDSA/EDC etabliert, nativer Data-Act-Formalismus; `IPolicyRule` ist auf ArchiMate-Prädikate beschränkt, nicht an Regulation-Paragraphen gelinkt (Blocker 6). **Verworfen:** `IPolicyRule` wiederverwenden. `[SoR-LATER]`.

### ADR-Crosswalk — Secure Controls Framework (SCF), UCF nur Benchmark `[SoR-LATER]`

- **Kontext.** Kein „assess once, comply many". **Entscheidung.** SCF als Seed-Crosswalk, UCF als kommerzieller Benchmark; many-to-many `SATISFIES`-Edges. **Begründung gegen UCF-Primär.** SCF frei/offen (für Startup richtig); UCF paywalled = Lock-in. **Verworfen:** paarweises n×n-Mapping (quadratisch). `[SoR-LATER]`.

### ADR-CMS-Framing — ISO 37301 + ISO/IEC 27001:2022 Annex A `[SoR-LATER]`

- **Kontext.** Kein neutraler Operating-Loop; OSCAL braucht Seed-Katalog. **Entscheidung.** Annex-SL-Loop (obligation→risk→control→monitoring→review) + Annex A (93 Controls) als Seed. **Begründung gegen „kein Framing".** ISO liefert etablierten Loop + sofort nutzbaren Katalog. **Verworfen:** eigener Control-Katalog (Neuerfindung). `[SoR-LATER]`.

### ADR-Asset — W3C DCAT 3 `[SoR-LATER]`

- **Kontext.** Kein standardbasierter Join Daten↔Obligation. **Entscheidung.** DCAT 3 (Catalog/Dataset/DataService/Distribution) ↔ ArchiMate-Data-Layer. **Begründung gegen Ad-hoc-Referenzen.** DCAT ist Standard-Asset-Formalismus; ODRL referenziert DCAT-Assets nativ. **Verworfen:** Freitext-Datenbezeichner. `[SoR-LATER]`.

### ADR-Storage — Property Graph (Neo4j) + geborgte RDF-Disziplinen, KEINE Triplestore-Migration `[SLICE-1]`

- **Kontext.** Neo4j vorhanden; Cross-Regulation-Cypher gefragt. **Entscheidung.** Neo4j (Relationen) + Mongo (Content) + Qdrant (768-dim). **Begründung gegen Full-RDF+SHACL+SPARQL.** RDF liefert die Disziplin (controlled vocabulary, Shape-Validierung via neosemantics/Zod), aber SPARQL-Steuer + Full-Migration ist bei Single-Team-Scale unverhältnismäßig; Auftrag Z. 90 schreibt „borge die Disziplinen, zahle nicht die SPARQL-Steuer" vor. **Verworfen:** Triplestore-Migration (Guardrail Z. 138). `[SLICE-1]`.

### ADR-Schema — Discriminated Union (Mongoose/TS) explizit GEGEN EAV `[SLICE-1]`

- **Kontext.** Generalität über offene `kind`-Menge ohne Typ-Verlust; CLAUDE.md verbietet `any`. **Entscheidung.** Discriminated Unions mit `kind`/`nodeType`-Diskriminator; neuer `kind` via Ontologie-Registrierung. **Begründung gegen EAV.** EAV erkauft Offenheit mit Verlust an Typ-Sicherheit/Query-Ergonomie — kollidiert mit `any`-Verbot; heutige `Mixed`-Felder (`gapReport`, `traceTarget`) sind EAV-Rückfall und werden ersetzt. **Verworfen:** EAV. `[SLICE-1]`.

### ADR-Ontology — Versionierte Ontologie als Allowed-Types-Source-of-Truth `[SLICE-1]`

- **Kontext.** Source-Vokabular fragmentiert (Blocker 6). **Entscheidung.** Versionierte Ontologie-Datei ist der Generalitäts-Mechanismus + Allowed-Types-Kontrakt; Extension-Review-Gate. **Begründung gegen Code-Enums.** Belegter Blocker (dreifach dupliziert, `ai_act` fehlt). **Begründung gegen unconstrained Strings.** Korpus-`source: String` zu lose (korrumpierbar). **Verworfen:** beide Extreme. `[SLICE-1]`.

### ADR-Contract — Zod/JSON-Schema Ingestion-Contract im shared-Package `[SLICE-1]`

- **Kontext.** „Neues Gesetz = validierte Daten" braucht Reject-Mechanismus. **Entscheidung.** Zod-Contract im shared-Package (baut zuerst); Reject am Store-Eingang; trägt UC-PROV-Provenance. **Begründung gegen „keine Validierung".** Ohne Contract ist „Daten statt Code" nicht durchsetzbar. **Verworfen:** Validierung erst im Mongoose-Layer (verstreut). `[SLICE-1]`.

### ADR-Temporality — Bitemporalität + Event Sourcing `[SLICE-1]`

- **Kontext.** „Welche Version galt wann" unbeantwortbar; VERLOCK muss nativ getragen werden. **Entscheidung.** Bitemporal (`validFrom/validTo` + `recordedFrom/recordedTo`) + Event Sourcing (State = Projektion). **Begründung gegen statische Felder + In-place.** Statisch kann weder „as-of" noch „as-known-at" beantworten; Guardrail verbietet In-place-Mutation (append-only). **Verworfen:** nur valid-time (unitemporal — „as-known-at" fehlt). `[SLICE-1]`.

### ADR-Audit — Data Vault 2.0 (append-only) `[SLICE-1]`

- **Kontext.** Kein unveränderlicher Trail; `Mixed`-Felder in-place mutiert. **Entscheidung.** Data-Vault-Prinzip (Hub/Link/append-only Satellite) in Mongo gespiegelt. **Begründung gegen In-place-Mutation.** Zerstört Trail, verletzt append-only-Guardrail. **Verworfen:** volles Warehouse-Data-Vault (kein Warehouse im Stack). `[SLICE-1]`.

### ADR-normType — kind/bindingness/maturity als Reference-Data `[SLICE-1]`

- **Kontext.** „Gesetz" nur ein Normtyp; US-Stack + ARF nicht mit `in_force/draft` darstellbar; SDOs haben inkompatible Reifegrad-Achsen. **Entscheidung.** `NormKind`/`Bindingness`/per-SDO-`Maturity` als ontologie-geführte Reference-Data. **Begründung gegen zweiwertiges Status-Enum.** Kann „legally load-bearing, kein RFC" (SD-JWT VC) nicht darstellen (Auftrag Z. 104). **Verworfen:** globales Maturity-Enum (vermengt W3C/IETF/OpenID/ISO). `[SLICE-1]`.

### ADR-Jurisdiction — First-Class + Lifecycle-State-Machines als Daten `[SLICE-1]`

- **Kontext.** `RegulationJurisdiction` = 4-Wert-Enum (`compliance.types.ts:70`, live verifiziert); CH-Lebenszyklus (`referendum_passed`/`erwahrt`) im EU-Modell nicht existent; BGEID ohne Inkrafttretens-Datum. **Entscheidung.** Jurisdiktion First-Class + pro-Jurisdiktion State-Machine als Daten; Effective-Dates als `DatedClaim`. **Begründung gegen 4-Wert-Enum.** Empirisch widerlegt (BGEID/US). **Verworfen:** globale FSM (erzwingt falsche Zustände). `[SLICE-1]`.

### ADR-Assurance — Scheme/Level-Reference-Data + assertierte MAPS_TO `[SoR-LATER]`

- **Kontext.** LoA = Constraint-Vokabular, kein Attribut; eIDAS = eine Achse, NIST = drei; kein offizieller Crosswalk. **Entscheidung.** `AssuranceScheme`/`AssuranceLevel` geordnete Reference-Data + assertierte, versionierte `MAPS_TO`-Kanten. **Begründung gegen flaches LoA-Feld.** Vermengt eIDAS-`high` mit NIST-IAL3; NIST-Konjunktion (IAL2 AND AAL2 phishing-resistant) nicht ausdrückbar. **Verworfen:** offiziellen Crosswalk annehmen (existiert nicht). `[SoR-LATER]` (Unterbau normType/Jurisdiction `[SLICE-1]`).

### ADR-Party-Role — Organization PLAYS Role IN Jurisdiction `[SoR-LATER]`

- **Kontext.** Obligationen binden an Rollen in Jurisdiktionen (eIDAS-RP, BGEID Art. 23). **Entscheidung.** Party-Role-IN-Jurisdiction; Registration-State als Vorbedingung; Trust-Registries als Connector-Data-Products. **Begründung gegen Obligation-an-Organisation.** Rollen-gebundene Pflichten mit Registrierungs-Zustand nicht an benannte Org generalisierbar. **Verworfen:** Obligation-an-Organisation. `[SoR-LATER]`.

### ADR-Sanction — Sanktionstyp als Discriminated Union, nicht `maxFine` `[SoR-LATER]`

- **Kontext.** BGEID Art. 23 hat nicht-monetäre Sanktion (`public_naming + exclusion`); `maxFine` bewertet als risikolos. **Entscheidung.** `Sanction` als DU; Risk-Scoring liest Typ. **Begründung gegen `maxFine`-Attribut.** Strukturell blind für nicht-monetäre Sanktionen (Red-Team-Angriff). **Verworfen:** `maxFine` + `hasNonMonetarySanction`-Boolean. `[SoR-LATER]`.

### ADR-Identity-DPV-Extension — namespaced Identity-Extension `[SoR-LATER]`

- **Kontext.** DPV-2.2-Identitäts-Lücke (kein LoA/Wallet/eIDAS). **Entscheidung.** kleine namespaced Extension, dokumentierter Alignment-Pfad. **Begründung gegen „auf DPVCG warten".** blockiert Identity-Beweisfälle. **Verworfen:** DPV-Konzepte zweckentfremden (`IdentityVerification` als LoA — semantisch falsch). `[SoR-LATER]`.

---

## 10. Adversariale Verifikation

Drei Runden Red-Team gegen das Meta-Modell. **18 Befunde, alle verifiziert (Klausel gezeigt, Modell-Versagen gezeigt) und behoben.**

### Runde 1 (10 Befunde, cleanRound=false)

| # | Angriffs-Klausel | Jurisdiktion | Sev | Modell-Versagen → Fix (Delta) |
|---|---|---|---|---|
| 1 | NIST SP 800-63-4 mehrachsig (IAL2 AND AAL2 phishing-resistant AND FAL2) | US | blocker | `AssuranceLevel` einzelwertig, kein Konjunktions-Container, `phishing_resistant` keine Achse → **DELTA-1** `AssuranceRequirement` + `qualifiers` |
| 2 | DORA `FinancialEntity`, AI Act `provider`/`deployer` fehlen | EU | blocker | `PartyRole` doppelt definiert (TS-Union `obligation.types.ts` + Ontologie) = Enum-Triplikation eine Ebene tiefer, **Modell-Selbstwiderspruch** → **DELTA-2** `PartyRole=string` (ontologie-validiert) |
| 3 | 6 CFR 37.4 ISO 18013-5:2021 namentlich; 2. Edition ~Sep 2026 | US | major | `CONCRETIZES` nicht versions-gepinnt, kein Re-Assessment-Trigger → **DELTA-3** `pinnedVersion`/`pinPolicy` + `standard_version_superseded`-Event |
| 4 | BGEID de/fr/it dreisprachig | CH | major | `RegulationLanguage='de'\|'en'` (Code-belegt `compliance.types.ts:72`) → **DELTA-4** `string` + ISO-639-1-Ontologie |
| 5 | BGEID VERLOCK-Kollision (drei Hashes, ein Key) | CH | major | `buildRegulationKey` sprach-blind → **DELTA-5** `expressionLanguage` im VERLOCK-Pin |
| 6 | NIS2 Directive vs. DSGVO Regulation | EU | major | `NormKind` hat keinen `directive`/`regulation`-Diskriminator, keine `TRANSPOSES` → **DELTA-6** `legalActType` + `TRANSPOSES` |
| 7 | NIS2 Art. 23(4) 24h/72h/1-Monat-Kette | EU | major | `DerivedDeadline` monats-granular, Norm-Events, keine Ketten-Ref → **DELTA-7** unit/relativeTo/priorDeliverable |
| 8 | eIDAS CIR 2025/848 IMPLEMENTS | EU | minor | `IMPLEMENTS`-Kante fehlt (Auftrag Z. 101) → **DELTA-8** |
| 9 | AI Act Art. 5(1)(a) provider OR deployer | EU | minor | `bearerRoleId` singular → **DELTA-9** `bearerRoleIds[]` |
| 10 | AI Act gestaffelte Geltung pro Provision | EU | minor | `provisionSchema` (C-10) ohne `validFrom` → **DELTA-10** per-Provision `validFrom/validTo` |

### Runde 2 (5 Befunde, cleanRound=false)

| # | Angriffs-Klausel | Sev | Modell-Versagen → Fix |
|---|---|---|---|
| 11 | DORA Art. 26(3) Pooled Testing (ein Test, N Entities) | blocker | `Assessment.subjectId` singular (DELTA-9 hob nur Bearer-Seite) → **DELTA-11** `subjectIds[]` + `ASSESSES_FOR`/`DESIGNATED_LEAD` |
| 12 | NIS2 CIR 2024/2690 Art. 4 Recurring Incidents (Aggregation) | blocker | `DerivedDeadline` kennt kein Aggregations-Trigger-Konzept → **DELTA-12** `AggregateBaseEvent` + `threshold_breached`-Event |
| 13 | AI Act Art. 99(1)/(6) Bussgeld-Dualität max/min je Größe | major | `monetary_fine` fixer Betrag, kein Selektor → **DELTA-13** `fixedCap`/`turnoverPct`/`selector` |
| 14 | DORA Art. 26/27 Tester-Qualifikation + Rotation | minor | keine Ausführer-Rolle mit Eignungs-Constraints → **DELTA-14** `Subject.qualifications` + `RotationConstraint` |
| 15 | BGEID Art. 23(2) Sichtbarkeit am Transaktionspunkt | minor | `public_naming` ohne Adressaten-Achse → **DELTA-15** `visibility`/`audience` + `undertakingSize` |

### Runde 3 (3 Befunde, cleanRound=false)

| # | Angriffs-Klausel | Sev | Modell-Versagen → Fix |
|---|---|---|---|
| 13 (R3) | NIST SP 800-63A „No identity proofing" als Zustand | blocker | `AxisConstraint` kann Achse nur fordern, `not_applicable` ≠ fehlend → **DELTA-13(R3)** `applicability` First-Class |
| 14 (R3) | 6 CFR 37.4 {ISO 18013-5:2021 UND AAMVA} + Waiver-Befristung | major | `CONCRETIZES` kein Bündel, keine `validUntil` → **DELTA-14(R3)** `incorporationGroupId` + `validFrom/validUntil/conditionRef` |
| 15 (R3) | 6 CFR 37.10 per-State-Waiver-Zeitmaschine | major | Lifecycle an Norm, nicht pro Sub-Jurisdiktion×Obligation → **DELTA-15(R3)** `ObligationApplicability`-Knoten (as-of-abfragbar) |

Zusätzlich in den Proofs gefunden und behoben: **D-F5** (Contract prüft Adapter-Existenz, nicht -Fähigkeit → `implementedProtocols`-Cross-Check in C-10), **D-F1** (relative ELI-CH vs. absolute ELI-EU → `aliasResolvers` in C-9).

### Runde 4 — Pflicht-Abschlussrunde (THE-390 P0-Gate, 2026-07-05, 4 Befunde, cleanRound=false)

Ausgeführt als eigenständige adversariale Runde gegen das um DELTA-1…15 revidierte Modell, mit Fokus auf die in §10-alt genannten ungeprüften Vektoren + härtere Fälle (Cross-Regulation-Vorrang, %-vom-Umsatz-Zwangsgeld, bedingt-getriggerte Deliverables, Konsolidierungsebenen). Ergebnis **nicht leer** — vier neue, web-belegte Lücken:

| # | Angriffs-Klausel | Sev | Modell-Versagen → Fix |
|---|---|---|---|
| N-1 (R4) | DORA Art. 1(2) ↔ NIS2 Art. 4 (CELEX 32022R2554/32022L2555) — lex specialis | **major** | Relation-Registry (C-9) hat nur textändernde/aufhebende/ableitende/verweisende Kanten, keine **konditionale partielle Verdrängung** zweier in-force Normen (gated auf `bearerRole=FinancialEntity` ∧ Materien-Überschneidung). GAP zieht NIS2-Art.-21 fälschlich als anwendbar → **DELTA-N1** neue gerichtete Kante `PREVAILS_OVER`/`DEROGATED_BY {forRole, scope:'same_subject_matter', validFrom}`; GAP-Query filtert verdrängte Obligationen wenn `Subject.role ∈ forRole` |
| N-2 (R4) | DORA Art. 35(7)/(8) — tägliches Zwangsgeld, bis 6 Monate, bis 1 % *Tages*-Weltumsatz | **major** | `Sanction.monetary_fine` (C-5) kennt nur Punkt-Beträge/Caps, keine **akkumulierende Rate × Zeit**; Risk-Scoring liest `turnoverPct:1` als Einmal-Cap → strukturelle Unterschätzung → **DELTA-N2** optionaler `accrual?: {rate, rateBasis:'daily_turnover'|'fixed', per:'day', cap:{value,unit}}` am `monetary_fine`-Arm + Ontologie `fineAccrualPer/fineRateBasis` |
| N-3 (R4) | NIS2 Art. 23(4)(c) — intermediate report „upon request of a CSIRT/authority" | minor | `DerivedDeadline` (C-5) erzwingt `offset` **oder** festes Datum; ein **bedingt-getriggerter, datumloser** Deliverable („on request", ggf. nie) passt in keinen Arm → **DELTA-N3** `Deadline`-Union += `{kind:'on_request', triggeredBy}` + `DeadlineBaseEvent` += `{kind:'on_demand', triggeredBy:'authority_request', optional:true}` |
| N-4 (R4) | DORA Art. 28(3) — Register „at entity, sub-consolidated and consolidated levels" | minor | `Subject.subCode` ist geografisch belegt (`US-CA`); die **organisatorische Konsolidierungsebene** (orthogonal zur Geo-Achse) fehlt → dieselbe Obligation ×3 für dieselbe Gruppe nicht ohne Feld darstellbar → **DELTA-N4** optionales, ontologie-validiertes `Subject.consolidationLevel?: string` (`entity/sub_consolidated/consolidated`) |

Alle vier rein additiv (neue Kante, optionale Felder + Ontologie-Vokabeln), kein Kern-Enum-Edit — konsistent mit „Daten statt Code". `PartyRole`/`consolidationLevel` sind bereits ontologie-validierte Strings, `accrual`/`on_request` sind optionale DU-Arme.

**Kein Befund** (geprüft, trägt): Rollen-/Sub-Prozessor-Ketten (GDPR Art. 28(4) flow-down, DORA Art. 30 — als gerichtete `PLAYS`-Kanten darstellbar; DORA-„entire-chain-monitoring" per Del. VO (EU) 2025/532 ohnehin gestrichen); AI-Act-Art.-6(3)-Vier-Bedingungen-Ausnahme + Profiling-Override (als geordnete `ObligationApplicability`-Preconditions); AI-Act-Art.-6(4)/49-Meta-Doku-Pflicht (normale bedingte Obligation getriggert durch `applies:false`).

### Runde 5 — Leer-Nachweis-Versuch gegen Modell + DELTA-N1…N4 (2026-07-05, 2 Befunde, cleanRound=false)

Gegen die noch nie durchgespielten Vektoren + neue harte Fälle (Retroaktivität, cross-norm-Ordering, Asset-Klassen-Bindung, Parameter-Amendments). Ergebnis **nicht leer** — zwei neue major-Lücken, beide additiv:

| # | Angriffs-Klausel | Sev | Modell-Versagen → Fix |
|---|---|---|---|
| R5-1 (R5) | AI Act Art. 51(3) (CELEX 32024R1689) — delegierter Rechtsakt ändert 10²⁵-FLOP-Schwelle *ohne* Textänderung | **major** | Schwellenwert lebt als bare literal `OdrlConstraint.rightOperand` (C-5) ohne Provenance/Bitemporalität; keine Relation-Kante drückt „Norm B setzt Parameter P in Provision von Norm A ohne Textänderung" aus (`AMENDS`=textändernd, `IMPLEMENTS`=wie/womit, `DEROGATED_BY`=unterdrückt). As-of-Frage „welcher Schwellenwert galt wann, gesetzt durch welche Norm" unbeantwortbar → **DELTA-R5-1**: `OdrlConstraint.parameterRef? {valueSourceWorkId, valueSourceEId?, temporal}` + neue Kante `SETS_PARAMETER {targetEId, parameter, value, validFrom, validUntil}` in `relationTypes` (C-9) |
| R5-2 (R5) | UK DIATF / GPG 45 (Low/Med/High) als 4.+ Assurance-Schema | **major** | **Selbstwiderspruch (wie DELTA-2/-4):** `AssuranceScheme = 'eIDAS'\|'NIST-800-63'\|'UK-DIATF'\|'CH-eID'` (C-5) + `axis: 'LoA'\|'IAL'\|'AAL'\|'FAL'` sind **geschlossene TS-Unions am Kern** → Schema Nr. 5 = TS-Edit + Rebuild + Doppel-Redeploy = Blocker 1/6. Zusätzlich divergieren TS-Enum und C-9-`assuranceSchemes`-Ontologie bereits (UK-DIATF/CH-eID im Enum, nicht im YAML) → **DELTA-R5-2**: `AssuranceScheme` und `axis` auf ontologie-validierten `string` absenken (exakt wie `PartyRole`), Schemata inkl. Achsen rein als C-9-Daten |

**Kein Befund** (geprüft, trägt): Retroaktive Inkraftsetzung (`BitemporalStamp` entkoppelt valid/transaction-time, keine `validFrom≥recordedFrom`-Constraint — genau wofür Bitemporalität da ist; AI Act „shall apply from"/Art. 111(3) Grandfathering via `ObligationApplicability`); cross-norm-Ordering (DELTA-7 `priorDeliverableId: NodeId` ist norm-übergreifend); Asset-/Funktions-gebundene Obligation (`OdrlRule.target` + `ObligationApplicability`); mehrsprachiger Obligation-Text (`Provision.fullText`+`expressionLanguage` DELTA-5, Obligation→`provisionId`); Data Act Art. 25 konditionale ODRL-Kopplung = bereits notierte §11-Grenze.

### Runde 6 — Leer-Nachweis-Versuch gegen Modell + DELTA-R5 (2026-07-05, 4 Befunde, cleanRound=false)

Neue Vektor-Klassen (Adressat = natürliche Person, extraterritoriale Wirkung, gegenseitige Anerkennung, Soft-Law-Auslegung). Ergebnis **nicht leer** — 1 blocker, 2 major, 1 minor:

| # | Angriffs-Klausel | Sev | Modell-Versagen → Fix |
|---|---|---|---|
| R6-1 (R6) | GDPR Art. 3(2) / AI Act Art. 2(1)(c) — Marktort-/Targeting-Nexus | **blocker** | `jurisdiction`/`Subject.jurisdictionCode`/`ObligationApplicability` modellieren nur *wo Norm/Akteur sitzen*, nicht „Norm der EU bindet US-Subjekt, **weil Ziel in EU**". GAP-Query schließt ein US-only-Subjekt fälschlich aus (Spiegelfehler zu N-1) → **DELTA-R6-1** `ObligationApplicability.reach? 'territorial'\|'extraterritorial'` + `targetingNexus? {targetLocatedIn, activityQualifier}` (ontologie-validiert) |
| R6-2 (R6) | GDPR Art. 45 Angemessenheitsbeschluss (real: Impl. Dec. (EU) 2026/179 EU↔BR) / eIDAS mutual recognition | **major** | `relationTypes` hat nur textuelle/ableitende/verdrängende Kanten; keine „Norm erkennt Konformität einer *Jurisdiktion* an und schaltet Permission frei" → **DELTA-R6-2** Kante `RECOGNIZES_EQUIVALENCE {recognizedJurisdiction, forPurpose, basis, validFrom, validUntil}` `(:Norm)→(:Jurisdiction)`; Widerruf (Art. 45(5)) = `validUntil` |
| R6-3 (R6) | DORA Art. 5(2) / NIS2 Art. 20 — Management-Body persönlich haftbar (bis 5 Mio./Individuum) | **major** | `Subject` = „Organization PLAYS Role"; kein natürliche-Person-Träger. `Sanction`-Arme haben **keinen Adressaten** → dieselbe Verletzung trifft Entität *und* Board-Mitglied, nicht trennbar → **DELTA-R6-3** `Subject.actingCapacity? 'entity'\|'natural_person_in_body'` + `Sanction.addresseeCapacity? 'entity'\|'natural_person'` |
| R6-4 (R6) | EDPB Guidelines (GDPR Art. 70) — nicht bindend, aber maßgebliche Auslegung | minor | `guideline`/`persuasive` tragen den Charakter, aber keine Relation „G legt Provision P maßgeblich aus"; `CITES` zu schwach → **DELTA-R6-4** Kante `INTERPRETS {targetEId, authority, validFrom, supersededBy}` + Event `interpretation_superseded` (Re-Assessment) |

**Kein Befund** (geprüft, trägt): kumulative Zeit-Trigger (DELTA-12 `AggregateBaseEvent`); unauflösbarer Normkonflikt (als zwei parallele `binding`-Obligationen darstellbar, Auflösung bewusst Human-Gate).

### Nachweis-Status + P0-Gate-Entscheidung — **ehrlich**

Stand nach **6 Runden: 28 Befunde, alle additiv geschlossen, keine exakt-leere Runde.** Die naive Konvergenz-These (Ausbeute versiegt) hielt nicht — Runde 6 fand noch einen blocker (R6-1, extraterritoriale Applicability). ABER: **jeder** der 28 Befunde war durch (a) einen neuen ontologie-registrierten Relations-/Vokabular-Typ oder (b) ein optionales Reference-Data-Feld schließbar — **kein einziger** verlangte eine Änderung am Kern-Schema (Identität/Hierarchie/Bitemporalität/Discriminated-Union/Ontologie-als-Kontrakt), das seit Runde 3 stabil ist.

**Daraus die P0-Gate-Entscheidung (2026-07-05, Matthias Ganzmann):** Eine exakt-leere Runde ist im offenen Rechtsraum die falsche Zielfunktion (asymptotisch, es bleibt immer ein Randfall). Das inhaltlich tragfähige Exit-Kriterium ist erreicht: **das Kern-Metamodell ist stabil, und die Absorbierbarkeit-jedes-Befunds-als-Daten ist selbst der Beweis der Generalisierungs-These** („neues Gesetz = Daten"). **P0 (Konzept/Schema-Entscheidung, ADR-0004) ist abgeschlossen.** Zwei Auflagen wandern nach P1: die applicability-korrektheits-kritischen Relationen **Reach** (DELTA-R6-1) und **Derogation** (DELTA-N1) sind als echte Query-Logik zu implementieren, nicht bloß als Katalog-Eintrag; und der adversariale Angriffssatz (28 Klauseln) wird als **Regressions-Testsuite** gegen die P1-Implementierung wiederverwendet.

---

## 11. Finale Selbstkritik: „Was würde das brechen?"

Die ehrlichsten Restrisiken, geordnet nach Schwere.

1. **Kein absoluter Vollständigkeitsbeweis (Prozess-Risiko, mittel — bewusst akzeptiert).** Sechs Runden, keine exakt-leere; der offene Rechtsraum liefert weiter Randfälle. Das Restrisiko ist bewusst getragen (P0-Gate-Entscheidung §10): jeder bisherige Befund war rein additiv absorbierbar, das Kern-Schema steht seit Runde 3. **Mitigation:** die 28 Angriffsklauseln als P1-Regressionssuite; neue Randfälle im Betrieb landen als Ontologie-Einträge, nicht als Schema-Änderung; die zwei bewertungskritischen Relationen (Reach/Derogation) werden in P1 als Query-Logik verifiziert.

2. **Migration-Cutover-Risiko (hoch).** Zwischen R3 und R4 der `ComplianceRequirement`-Umhängung existieren gemischte Dokumente. Wird R4 vor vollständigem R2-Backfill gezogen, fallen Requirements ohne `regulationKey` durch den Partial-Index. **Mitigation:** R4-Gate = „100 % `regulationKey` vorhanden" als harte, zählbare Vorbedingung (wie THE-389 all-zero-heal-Gate).

3. **CELLAR-AKN-Abdeckung für ältere Akte (mittel).** Der echte Hierarchie-Baum entsteht erst mit CELLAR-Reingest (M2b). Für Altakte ohne saubere AKN bleibt der Baum flach (`Norm → article`-Blatt). **Mitigation:** `legacyRegulationKey`/`legacyVersionHash` sind baumtiefen-unabhängig gefüllt — alle Slice-1-UCs funktionieren auch am flachen Baum; degradiert ist nur die Navigation.

4. **THE-368-Reihenfolge (mittel).** Die gesamte E-1-Pipeline setzt den fertigen Strangler-Seam voraus. Läuft THE-368 nicht sauber durch, fehlt die stabile Read-Quelle. Das ist die `blockedBy`-Realität des Auftrags, kein selbst eingeführtes Risiko.

5. **ODRL-Ausdrucksgrenzen für konditionale Fristen (mittel).** ODRL 2.2 `OdrlConstraint[]` ist ein implizites AND ohne Wenn-Dann-Verzweigung; Data Act Art. 25 („7-Monats-Ausnahme bei technischer Unmöglichkeit") und AI Act Art. 5 („objective OR effect" + „reasonably likely") sind nur als disjunkte Obligations bzw. `fullText` + `needs_attestation` abbildbar — die Kopplung geht verloren. **Mitigation:** dokumentierte Grenze; Feinsubsumtion bleibt Human-Gate (Asilomar-konform), keine Auto-Ableitung.

6. **SCF-Crosswalk-Aktualität für brandneue Regime (mittel).** SCF hinkt bei brandneuen Regimen hinter; ein AI-Act-Common-Control kann fehlen. **Mitigation:** `SATISFIES`-Kanten sind assertiert mit `confidence`+`source`; fehlende Crosswalks werden `needs_attestation`, nicht still leer.

7. **Bitemporal-Query-Komplexität (mittel).** Die `as-of`/`as-known-at`-Doppelfilterung (C-8) ist korrekt, aber Cypher-Queries werden verschachtelt; falsch gesetzte `recordedTo`-Filter liefern still veraltete Stände. **Mitigation:** current-Filter (`recordedTo IS null`) als wiederverwendbares Query-Fragment kapseln; Regressionstest (eIDAS as-of 2023 vs. 2026) als CI-Gate.

8. **Digital-Identity-spezifisch:**
   - **ARF-Churn (mittel).** ARF v2.9.0, laufende 2026er-Iterationen, quasi-normativ aber beweglich. **Mitigation:** ARF als eigener `normType` mit eigener `Maturity{scheme:'ARF'}`-Versionierung; Versionswechsel triggert `reassessed` via `CONCRETIZES`.
   - **Schweizer Termin-/Spezifikations-Volatilität (mittel).** E-ID-Launch wechselte 3× in 5 Monaten; SR-Nummer + `eli/cc/`-URI erscheinen erst mit Inkrafttreten. **Mitigation:** Alias-Nachtrags-Merge (ADR-0004-R) + `DatedClaim{supersedes}` für Termin-Volatilität.
   - **US-Fragmentierung (mittel).** 50-Staaten-Long-Tail ohne AKN/ELI, politisch volatile Executive Orders, citation-keyed. **Mitigation:** `AliasScheme` deckt `CFR-citation`/`USLM`/`PublicLaw` ab; `ObligationApplicability` (DELTA-15) trägt per-State-Staffelung; `bindingness:'binding-for-agencies'` für Executive Orders.
   - **DPV-Identitäts-Lücke (niedrig).** Eigene Extension mit Alignment-Risiko gegenüber künftiger DPVCG-eIDAS-Extension. **Mitigation:** namespaced Extension mit dokumentiertem Alignment-Pfad; Restrisiko akzeptiert.
   - **SD-JWT-VC-Reifegrad (niedrig).** Legally load-bearing ohne finalen RFC. **Mitigation:** `Maturity{scheme:'IETF', value:'draft'}` + `bindingness:'voluntary-de-facto'` bzw. ARF-mandatiert — das Modell trägt genau diese Diskrepanz als Daten.

**Der Satz, an dem alles hängt:** Solange die zwei Enum-Absenkungen (`PartyRole`, `RegulationLanguage`) und die vier Design-first-Kardinalitäts-Deltas (9, 11, 12, 13/15) **vor** dem jeweiligen Build im C-5-Design stehen, bricht kein Fall das Null-Code-Kriterium. Werden sie vergessen, erzwingt der erste Nicht-Identity-Rechtsakt (DORA) bzw. der erste nicht-einsprachige Beitritt (BGEID) eine zweite Migration — genau das Versagen, das dieser Auftrag verhindern soll.

---

**Belegte Artefakt-Zielpfade (Design-Output, absolut):**
`/Users/mac_macee/javis/packages/shared/src/types/canonical/{base,identity,norm,structure,obligation}.types.ts` (C-1–C-5) · `/Users/mac_macee/javis/packages/server/src/models/canonical/{CanonicalNode,CanonicalEvent}.ts` (C-6/C-7) · `/Users/mac_macee/javis/packages/server/src/graph/canonical-schema.cypher` (C-8) · `/Users/mac_macee/javis/packages/shared/src/ontology/compliance-ontology.v1.yaml` (C-9) · `/Users/mac_macee/javis/packages/shared/src/contracts/onboarding-package.contract.ts` (C-10).

**Codebasis-verifizierte Ist-Anker (live 2026-07-05):** Enum-Triplikation `compliance.types.ts:62`, `Regulation.ts:41`, `regulation.model.ts:53` · `RegulationJurisdiction` 4-Wert `compliance.types.ts:70` · `RegulationLanguage` `de|en` `compliance.types.ts:72` (+ Mongoose `Regulation.ts:64`, `regulation.model.ts:76`) · `buildRegulationKey(source: string, …)` `regulation-key.ts:20`.