/**
 * UC-LAW-002 Slice-2 (THE-463) — Hybrid Stage-A(rules) + Stage-B(corpus/judge)
 * Applicability-Merge.
 *
 * Philosophie (AC-2): das DETERMINISTISCHE Urteil (Stage A,
 * regulationApplicability.service) ist autoritativ — der Judge (Stage B)
 * ERGÄNZT, senkt/überschreibt aber NIE score/verdict eines bestehenden
 * Assessments. Ein Korpus-Treffer ohne Stage-A-Regel-Match wird als eigenes
 * Assessment mit `provenance:'corpus'` sichtbar — deterministisch score:0
 * (die Regel-Achse hat ehrlich kein Signal), ABER der `verdict` wird aus der
 * Judge-`confidence` abgeleitet (Review-Fix 2), sonst würde sich der Fund
 * unter „not_indicated" verstecken. Die Sortierung folgt konsequent demselben
 * Prinzip: `max(score, corpus.confidence)`.
 *
 * Linear: THE-463 (REQ-LAW-002.4)
 */
import {
  verdictFromScore,
  type ApplicabilityReport,
  type DiscoveryFinding,
  type NormApplicabilityAssessment,
} from '@thearchitect/shared';

/** Rang-Wert für die Sortierung — corpus-Konfidenz zählt gleichwertig zum det. Score. */
function rankScore(a: NormApplicabilityAssessment): number {
  return Math.max(a.score, a.corpus?.confidence ?? 0);
}

function toCorpusOnlyAssessment(finding: DiscoveryFinding): NormApplicabilityAssessment {
  return {
    ruleId: finding.family,
    label: finding.family,
    corpusSourceIds: [...finding.sources],
    jurisdiction: finding.jurisdiction,
    // Konservative Defaults: der Korpus enthält heute nur Legislation (ONTO-
    // Typisierung/provisionKind ist dormant, THE-432) — s. Reuse-Referenz Task 1.
    kind: 'legislation',
    bindingness: 'binding',
    // Deterministische Achse hat ehrlich KEIN Signal (score:0) — der Verdict
    // kommt trotzdem aus der Judge-confidence, sonst verschwindet der Fund
    // unter "not_indicated" (Review-Fix 2).
    verdict: verdictFromScore(finding.confidence),
    score: 0,
    contributions: [],
    rationale: finding.reasoning,
    referenced: false,
    inPipeline: false,
    availableInCorpus: true,
    provenance: 'corpus',
    corpus: {
      status: finding.status,
      applies: finding.applies,
      confidence: finding.confidence,
      reasoning: finding.reasoning,
      keyParagraphs: [...finding.keyParagraphs],
      elementIds: [...finding.elementIds],
      sources: [...finding.sources],
    },
  };
}

export function mergeApplicability(
  stageA: ApplicabilityReport,
  findings: DiscoveryFinding[],
  corpusVersion: string | undefined,
): ApplicabilityReport {
  // AC-2 (nur applies:true zählt als Korpus-Signal — ein "gilt nicht"-Urteil
  // trägt keine positive Evidenz und darf keinen Assessment berühren/erzeugen).
  const applicableFindings = findings.filter(f => f.applies);
  const findingByFamily = new Map(applicableFindings.map(f => [f.family, f]));

  const matchedFamilies = new Set<string>();
  const merged: NormApplicabilityAssessment[] = stageA.assessments.map(a => {
    const finding = findingByFamily.get(a.ruleId);
    if (!finding) {
      return { ...a, provenance: 'rules' as const };
    }
    matchedFamilies.add(a.ruleId);
    return {
      ...a, // score/verdict/contributions/rationale UNVERÄNDERT — det. Urteil autoritativ.
      provenance: 'both' as const,
      corpus: {
        status: finding.status,
        applies: finding.applies,
        confidence: finding.confidence,
        reasoning: finding.reasoning,
        keyParagraphs: [...finding.keyParagraphs],
        elementIds: [...finding.elementIds],
        sources: [...finding.sources],
      },
    };
  });

  for (const finding of applicableFindings) {
    if (matchedFamilies.has(finding.family)) continue; // schon als 'both' gemerged
    merged.push(toCorpusOnlyAssessment(finding));
  }

  // Sortierung: max(score, corpus.confidence) absteigend, stabiler Tie-Break nach label.
  merged.sort((a, b) => rankScore(b) - rankScore(a) || a.label.localeCompare(b.label));

  return {
    ...stageA,
    assessments: merged,
    coverage: {
      stageARuleCount: stageA.assessments.length,
      stageBCorpusCount: findings.length,
      corpusVersion,
    },
  };
}
