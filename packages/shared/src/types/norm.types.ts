// ─── Norm — quellenagnostische kanonische Sicht auf eine externe Vorgabe ───
//
// UC-CANON-001 / THE-390 P1 (Model + Facade). ADR-0004:
//  - Identität = interner opaker `workId` + Alias-Katalog (CELEX/ELI/SR sind Etiketten,
//    NIE der Primärschlüssel — E1).
//  - Struktur = @eId-Baum (E2); P1 projiziert flache Quellen als eine Ebene.
//  - Die Herkunft (Upload-Standard vs. Korpus-Regulation) verschwindet hinter der Facade;
//    `source` bleibt sichtbar, ist aber der einzige Rest der Quell-Divergenz.
//
// P1 liest/projiziert nur — es wird nichts persistiert (Schreibpfad = P4) und keine
// Applicability/Gap-Logik ausgewertet (= P3).

/** Herkunft der projizierten Norm — der einzige verbleibende Quell-Diskriminator. */
export type NormSource = 'upload' | 'corpus';

/**
 * Alias-Schema. `value` ist die amtliche/technische Kennung; niemals der interne Schlüssel.
 * `regulationKey`/`standardId` sind die projizierten Legacy-Kennungen (non-breaking).
 */
export type AliasScheme =
  | 'ELI-EU'
  | 'CELEX'
  | 'ELI-CH'
  | 'SR'
  | 'BBl'
  | 'AS'
  | 'USLM'
  | 'CFR-citation'
  | 'PublicLaw'
  | 'ISO'
  | 'NIST-SP'
  | 'OpenID'
  | 'IETF-RFC'
  | 'W3C-TR'
  | 'regulationKey' // legacy `${source}:${paragraph}`
  | 'standardId' // legacy Standard._id
  | 'abbrev';

export interface NormAlias {
  scheme: AliasScheme;
  value: string;
  /** ISO-639-1 — am Ingest ontologie-validiert, KEIN geschlossenes Enum. */
  language?: string;
  isPrimaryDisplay?: boolean;
}

export type FrbrLevel = 'work' | 'expression' | 'manifestation';

/** Identität einer Norm (ADR-0004 E1). `workId` ist opak, kanonisch, intern. */
export interface NormIdentity {
  workId: string;
  aliases: NormAlias[];
  frbrLevel: FrbrLevel;
  expressionLanguage?: string;
}

/** Referenz in den kanonischen Korpus (ADR-0004 E3) — Referenz, keine Kopie. */
export interface NormCorpusRef {
  regulationKey: string;
  versionHash?: string;
  expression?: string;
}

/**
 * Provision/Section als baum-fähige Sicht (ADR-0004 E2).
 * P1: flache Quellen werden als eine Ebene mit stabiler `eId` projiziert;
 * echter @eId-Baum-Ingest = REQ-CANON-001.3 (THE-415).
 */
export interface NormSectionView {
  eId: string;
  parentEId?: string;
  /** Materialisierter Pfad Wurzel→Knoten (P1: = eId). */
  path?: string;
  heading: string;
  number?: string;
  text?: string;
  level: number;
}

/**
 * Status einer NormMapping. Die zwei Welten nutzen unterschiedliche Vokabulare:
 *  - `conformance` (Upload): compliant | partial | gap | not_applicable — ein Urteil.
 *  - `lifecycle`   (Korpus): auto | confirmed | rejected — der Mapping-Lebenszyklus.
 * `statusKind` sagt dem Consumer, welches Vokabular gilt (nicht vermengen).
 */
export type NormMappingStatusKind = 'conformance' | 'lifecycle';

export interface NormMappingView {
  source: NormSource;
  /** = NormIdentity.workId der Norm, zu der dieses Mapping gehört. */
  normId: string;
  /** @eId/Section-Referenz innerhalb der Norm (P1: legacy sectionId bzw. regulationKey). */
  sectionEId?: string;
  elementId: string;
  status: string;
  statusKind: NormMappingStatusKind;
  confidence: number;
  reasoning?: string;
  createdBy?: string;
  corpusRef?: NormCorpusRef;
}

/** Vereinheitlichte Lesesicht auf eine Norm. */
export interface NormView {
  identity: NormIdentity;
  source: NormSource;
  projectId: string;
  title: string;
  version?: string;
  /** Ontologie-validierter String (E6) — in P1 aus Quelldaten abgeleitet. */
  jurisdiction?: string;
  /** NormKind (E6) — in P1 best-effort aus der Quelle abgeleitet. */
  kind?: string;
  corpusRef?: NormCorpusRef;
  sections: NormSectionView[];
}

/**
 * Deterministische, idempotente Ableitung des internen `workId` aus einer Legacy-Kennung.
 * Gleicher Legacy-Schlüssel → gleicher workId (P1-Invariante; P4 persistiert echte workIds).
 *  - upload: `upload:<standardId>`
 *  - corpus: `corpus:<source>`  (die Norm = das ganze Gesetz; Paragraphen = Sections)
 */
export function deriveNormWorkId(source: NormSource, key: string): string {
  return `${source}:${key}`;
}

/** Das Gesetz („source") aus einem `regulationKey` wie `dsgvo:art-30`. */
export function lawSourceFromRegulationKey(regulationKey: string): string {
  const idx = regulationKey.indexOf(':');
  return idx === -1 ? regulationKey : regulationKey.slice(0, idx);
}
