// ─── Regulatory Applicability (UC-LAW-001) ───
//
// „Welche Gesetze gelten für diese Architektur?" — deterministische Anwendbarkeits-
// Einschätzung auf Basis der Architektur-Elemente (insb. der vom AI Wizard /
// Blueprint generierten) und des Projekt-Kontexts (Vision, Beschreibung, Tags).
//
// Philosophie wie WFCOMP (detectGdprScope): bewusst GROSSZÜGIG — ein übersehenes
// Gesetz ist gefährlicher als ein zu viel geprüftes. Jede Einschätzung trägt
// Evidenz (welche Elemente/Signale) und ist damit audit-fähig, kein Orakel.
// Kein LLM im Pfad: läuft ohne API-Keys, reproduzierbar, erklärbar.
//
// WICHTIG: Entscheidungsunterstützung, KEINE Rechtsberatung (siehe `disclaimer`).

import type { ApplicabilityProvenance, FindingStatus } from './law-discovery.types';

/** Wie sicher ist die Anwendbarkeit? Abgeleitet aus dem Score (noisy-OR). */
export type ApplicabilityVerdict =
  | 'applicable' // starke Signale — Gesetz sollte in die Pipeline
  | 'likely' // deutliche Signale — prüfen
  | 'possible' // schwache Signale — im Blick behalten
  | 'not_indicated'; // keine Signale in dieser Architektur

/** Woher stammt ein Evidenz-Treffer? */
export type ApplicabilityEvidenceKind = 'element' | 'project';

export interface ApplicabilityEvidence {
  kind: ApplicabilityEvidenceKind;
  /** Element-Id (Neo4j) — nur bei kind='element'. */
  elementId?: string;
  /** Element-Name bzw. Projekt-Feld (z. B. "vision"). */
  name: string;
  /** Was genau gematcht hat (Pattern-Treffer, Typ, Sensitivity-Bucket). */
  detail: string;
  /** True, wenn das Element vom AI Wizard (Blueprint) generiert wurde. */
  fromWizard?: boolean;
}

/**
 * Ein fachliches Signal (z. B. „verarbeitet personenbezogene Daten",
 * „AI-Komponenten vorhanden"). Signale sind gesetzes-unabhängig; die Regeln
 * (Server-Data) verbinden Signal → Gesetz mit Gewicht.
 */
export interface ApplicabilitySignalResult {
  id: string;
  label: string;
  description: string;
  detected: boolean;
  /** Belegte Treffer, gekappt (maxEvidence) — Transparenz statt Volltext-Dump. */
  evidence: ApplicabilityEvidence[];
  /** Gesamtzahl Treffer vor dem Kappen. */
  matchCount: number;
}

/** Beitrag eines erkannten Signals zur Einschätzung EINES Gesetzes. */
export interface ApplicabilityContribution {
  signalId: string;
  signalLabel: string;
  weight: number; // ∈ (0, 1]
  rationale: string;
}

/** Einschätzung für EIN Gesetz / eine Norm aus der Registry. */
export interface NormApplicabilityAssessment {
  /** Familien-Id (sprachneutral), z. B. 'ai-act' für ai-act-de/-en. */
  ruleId: string;
  label: string;
  /** Ontologie-Ids im Korpus (`NORM_ONTOLOGY.normSources`), z. B. ['ai-act-de','ai-act-en']. */
  corpusSourceIds: string[];
  jurisdiction: string;
  /** NormKind (E6): legislation | technical_standard | … */
  kind: string;
  /** Bindingness (E6): binding | voluntary-de-facto | … */
  bindingness: string;
  verdict: ApplicabilityVerdict;
  /** Kombinierter Score ∈ [0,1] — noisy-OR über die erkannten Beiträge. */
  score: number;
  contributions: ApplicabilityContribution[];
  /** Zusammengesetzte Begründung (aus den Beiträgen + baselineNote). */
  rationale: string;
  /** Einschränkung, die die Heuristik nicht prüfen kann (z. B. Schwellenwerte). */
  baselineNote?: string;
  // ─── Projekt-Zustand (für die UI-Aktion „Add to pipeline") ───
  /** workId (`corpus:<source>`) für Add-to-pipeline — bevorzugt referenziert > verfügbar. */
  workId?: string;
  /** Projekt referenziert das Gesetz bereits (Mapping/Norm vorhanden). */
  referenced: boolean;
  /** Gesetz läuft bereits in der Compliance-Pipeline. */
  inPipeline: boolean;
  /** Im angebundenen Korpus verfügbar (Add-to-pipeline möglich). */
  availableInCorpus: boolean;
  // ─── Stage B (UC-LAW-002 Slice-2) — additiv, optional (LAW-001 unberührt) ───
  /** Herkunft: 'rules' (nur deterministisch), 'corpus' (nur Judge), 'both'. Undefined = 'rules' (Alt-Verhalten). */
  provenance?: ApplicabilityProvenance;
  /** Korpus-/Judge-Achse — getrennt vom deterministischen `score`/`verdict` (NICHT verrechnet). */
  corpus?: {
    status: FindingStatus;
    applies: boolean;
    confidence: number;      // ∈ [0,1]
    reasoning: string;
    keyParagraphs: string[];
    elementIds: string[];
    sources: string[];
  };
}

/** Vollständiger Report — Antwort von GET /api/projects/:id/norms/applicability. */
export interface ApplicabilityReport {
  projectId: string;
  generatedAt: string;
  /** Anzahl analysierter Elemente (0 → Report ist praktisch leer, UI-Hinweis). */
  elementCount: number;
  /** Davon vom AI Wizard (Blueprint) generiert. */
  wizardElementCount: number;
  /** Annahme der Heuristik — Korpus ist EU/DACH-fokussiert. */
  assumedJurisdictions: string[];
  /** ALLE ausgewerteten Signale (auch nicht erkannte) — Nachvollziehbarkeit. */
  signals: ApplicabilitySignalResult[];
  /** Sortiert: Score absteigend, not_indicated am Ende. */
  assessments: NormApplicabilityAssessment[];
  /** Rechtlicher Hinweis — immer anzeigen. */
  disclaimer: string;
  /** Deckungs-Transparenz (THE-455/F1-Muster): Stage-A-Regeln + Stage-B-Korpus-Stand. */
  coverage?: {
    stageARuleCount: number;
    stageBCorpusCount: number;
    corpusVersion?: string;  // corpusVersionHash zum Zeitpunkt der Discovery
  };
}

/** Score → Verdict (eine Stelle, überall gleich — Server, Tests, UI-Legende). */
export function verdictFromScore(score: number): ApplicabilityVerdict {
  if (score >= 0.75) return 'applicable';
  if (score >= 0.45) return 'likely';
  if (score >= 0.2) return 'possible';
  return 'not_indicated';
}
