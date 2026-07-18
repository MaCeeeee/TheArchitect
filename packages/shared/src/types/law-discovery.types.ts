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
