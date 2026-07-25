/**
 * UC-LAW-002 — Corpus-wide regulatory discovery (Slice-1, deterministic).
 * Profil + Kandidaten-Kontrakt. Kein LLM-Feld hier (Judge/Merge = Slice-2).
 */

/** Deterministische Modell-Verdichtung, Input für Retrieval (.2) + Judge (.3). */
export interface UseCaseProfile {
  projectId: string;
  /** Zusammengesetzter, gekürzter Suchtext (stabil sortiert, Budget-begrenzt). */
  text: string;
  /** Erkannte LAW-001-Signale als strukturierte Hints (nur ausgelöste, sortiert). */
  signalHints: string[];
  /** Diagnostik: wie viele Elemente einflossen (nach Budget-Kürzung). */
  meta: { elementsUsed: number; elementsTotal: number; truncated: boolean; charBudget: number };
}

/** Ein governter Korpus-Treffer (ein Paragraph), eligibility-gefiltert. */
export interface CorpusHit {
  regulationKey: string; // `${source}:${paragraph}`
  versionHash: string;
  source: string;
  paragraphNumber: string;
  title: string;
  jurisdiction: string;
  language: string;
  score: number; // Qdrant Cosine-Similarity ∈ [-1,1] (roh, ungeklemmt)
  /** Reserviert für ONTO-Typisierung (THE-432); heute immer undefined. */
  provisionKind?: string;
  /**
   * Herkunfts-Markierung (ADR-0006 E4, THE-516): 'scope-guarantee' = per
   * Beweis-Garantie injizierter Geltungsbereichs-§, nicht vom Retrieval
   * gefunden. ADDITIV: fehlend ⇒ implizit 'retrieval' (Bestands-Hits werden
   * nicht backfilled) — Wirkung und Zitierung injizierter §§ bleiben so eine
   * Datenbankabfrage (Notar-Prinzip).
   */
  origin?: 'retrieval' | 'scope-guarantee';
}

/** Aggregiertes Kandidaten-Gesetz (Source-Ebene) mit Retrieval-Evidenz. */
export interface DiscoveryCandidate {
  /** Familien-Repräsentant (z. B. `ai-act`), sprach-übergreifend gemergt. */
  family: string;
  sources: string[]; // z. B. ['ai-act-de','ai-act-en']
  jurisdiction: string;
  score: number; // normalisiert ∈ [0,1]
  hitCount: number;
  topHits: CorpusHit[]; // Retrieval-Evidenz, gekürzt
}

/**
 * Sichtbarkeits-Feld der Scope-Guarantee (ADR-0006 E5, THE-516):
 * 'applied' = jede Kandidaten-Familie hat ≥1 Geltungsbereichs-§ in der Evidenz;
 * 'partial' = mind. eine Familie ohne konsumierbare scope-§§ (legitim, z. B.
 * frisch gecrawltes Gesetz vor dem Re-Typing — nur Log, kein Alert);
 * 'unavailable' = Korpus-Typing-Lookup fehlgeschlagen (alertet via Sentry).
 */
export type ScopeGuaranteeState = 'applied' | 'partial' | 'unavailable';

export interface DiscoveryResult {
  projectId: string;
  corpusConfigured: boolean;
  candidates: DiscoveryCandidate[];
  degraded?: string; // gesetzt bei Graceful Degradation (leerer/unkonfigurierter Korpus)
  /**
   * ADDITIV (ADR-0006 E5): nur gesetzt, wenn das Flag
   * LAW_DISCOVERY_SCOPE_GUARANTEE an ist — Flag aus ⇒ Feld fehlt ⇒
   * byte-identisches Verhalten (AC-3).
   */
  scopeGuarantee?: ScopeGuaranteeState;
}

// ─── UC-LAW-002 Slice-2 (THE-462/463) — Judge, Finding, Merge (additiv) ───

/** Lifecycle eines Korpus-Befunds (Muster ComplianceMapping). */
export type FindingStatus = 'auto' | 'confirmed' | 'rejected';

/** Herkunft eines Applicability-Befunds im gemergten Report. */
export type ApplicabilityProvenance = 'rules' | 'corpus' | 'both';

/**
 * Anzeige-Detail zu einem keyParagraph (UC-LAW-002 Slice-2b AC-4): die UI
 * zeigt Titel statt roher regulationKeys. ADDITIV neben `keyParagraphs`
 * (string[]) — bereits persistierte Findings tragen nur die Keys; kein
 * Migrationszwang, alte Findings zeigen dann den Key als Fallback.
 */
export interface KeyParagraphDetail {
  regulationKey: string;
  title: string;
}

/** Rohes Judge-Urteil für EIN Kandidaten-Gesetz (Output des LLM). */
export interface LawJudgeVerdict {
  family: string;            // MUSS aus der Kandidatenmenge stammen (Anti-Halluzination)
  applies: boolean;
  confidence: number;        // ∈ [0,1]
  reasoning: string;         // ≤ 500 Zeichen
  elementIds: string[];      // MÜSSEN reale Profil-Element-Ids sein
  keyParagraphs: string[];   // regulationKeys aus den topHits des Kandidaten
  /** Titel je keyParagraph, aus den topHits des Kandidaten abgeleitet (additiv, AC-4). */
  keyParagraphDetails?: KeyParagraphDetail[];
  /**
   * requestId der zugehörigen AiTrace (THE-423), surfaced aus dem
   * `recordAiTrace`-Call in judgeCandidate — additiv, damit discoverAndJudge
   * ihn als ContextTrace.llmTraceRef weiterreichen kann (Judge↔Retrieval-Join).
   */
  aiTraceRequestId?: string;
}

/**
 * Persistierter Korpus-Befund (family-Level Lifecycle).
 *
 * `corpusVersionHash` — es gibt KEINEN globalen Korpus-Versions-Skalar;
 * `getCurrentVersionHashes(keys)` liefert einen Hash PRO `regulationKey`. Eine
 * Familie aggregiert mehrere Sources/Paragraphen. Daher ist dies ein
 * ABGELEITETER Evidence-Set-Hash über die tatsächlich gesehene Evidenz des
 * Kandidaten: `computeVersionHash(candidate.topHits.map(h =>
 * \`${h.regulationKey}:${h.versionHash}\`).sort().join('|'))`. Ändert sich der
 * Paragraphen-Inhalt/-Version, ändert sich der Hash → neuer Befund.
 */
export interface DiscoveryFinding {
  projectId: string;
  family: string;
  sources: string[];
  jurisdiction: string;
  status: FindingStatus;
  applies: boolean;
  confidence: number;         // Judge-Confidence, NICHT mit det. Score verrechnet
  reasoning: string;
  elementIds: string[];
  keyParagraphs: string[];
  /** Titel je keyParagraph (additiv, AC-4) — Alt-Findings ohne dieses Feld zeigen den Key. */
  keyParagraphDetails?: KeyParagraphDetail[];
  retrievalScore: number;     // Slice-1 Kandidaten-Score ∈ [0,1]
  corpusVersionHash: string;  // Dedup-/Cache-Achse — abgeleiteter Evidence-Set-Hash
  judgeModel: string;         // Modell, das dieses Urteil erzeugte (Cache-/Reuse-Achse)
  createdBy: 'llm' | 'human';
  /**
   * ContextTrace.requestId (THE-423) des Retrieval-Aufrufs, der dieses Finding
   * erzeugte — additiv, Alt-Findings ohne dieses Feld existieren weiter ohne
   * Provenienz-Link. Best-effort: kann gesetzt sein, ohne dass tatsächlich ein
   * ContextTrace-Dokument existiert (Tracing per Env deaktiviert).
   */
  contextTraceId?: string;
}

// ─── UC-LAW-002 Slice-2b (THE-464) — UI-Gating ────────────────────

/** Verfügbarkeits-Signal fürs UI-Gating (THE-464 AC-1) — additiv in der /applicability-Response. */
export interface DiscoveryAvailability {
  enabled: boolean;            // LAW_DISCOVERY_ENABLED
  corpusConfigured: boolean;   // Mongo-Korpus erreichbar konfiguriert
  providerConfigured: boolean; // ANTHROPIC_API_KEY vorhanden (Judge lauffähig)
}
