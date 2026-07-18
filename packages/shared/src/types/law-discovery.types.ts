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

export interface DiscoveryResult {
  projectId: string;
  corpusConfigured: boolean;
  candidates: DiscoveryCandidate[];
  degraded?: string; // gesetzt bei Graceful Degradation (leerer/unkonfigurierter Korpus)
}

// ─── UC-LAW-002 Slice-2 (THE-462/463) — Judge, Finding, Merge (additiv) ───

/** Lifecycle eines Korpus-Befunds (Muster ComplianceMapping). */
export type FindingStatus = 'auto' | 'confirmed' | 'rejected';

/** Herkunft eines Applicability-Befunds im gemergten Report. */
export type ApplicabilityProvenance = 'rules' | 'corpus' | 'both';

/** Rohes Judge-Urteil für EIN Kandidaten-Gesetz (Output des LLM). */
export interface LawJudgeVerdict {
  family: string;            // MUSS aus der Kandidatenmenge stammen (Anti-Halluzination)
  applies: boolean;
  confidence: number;        // ∈ [0,1]
  reasoning: string;         // ≤ 500 Zeichen
  elementIds: string[];      // MÜSSEN reale Profil-Element-Ids sein
  keyParagraphs: string[];   // regulationKeys aus den topHits des Kandidaten
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
  retrievalScore: number;     // Slice-1 Kandidaten-Score ∈ [0,1]
  corpusVersionHash: string;  // Dedup-/Cache-Achse — abgeleiteter Evidence-Set-Hash
  judgeModel: string;         // Modell, das dieses Urteil erzeugte (Cache-/Reuse-Achse)
  createdBy: 'llm' | 'human';
}
