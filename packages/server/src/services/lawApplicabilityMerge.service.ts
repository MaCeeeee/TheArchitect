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
  deriveNormWorkId,
  verdictFromScore,
  type ApplicabilityReport,
  type DiscoveryFinding,
  type NormApplicabilityAssessment,
} from '@thearchitect/shared';
import type { NormWorldState } from './regulationApplicability.service';

/** Rang-Wert für die Sortierung — corpus-Konfidenz zählt gleichwertig zum det. Score. */
function rankScore(a: NormApplicabilityAssessment): number {
  return Math.max(a.score, a.corpus?.confidence ?? 0);
}

/**
 * Spec-Fix 4 (Staleness): ein Finding, dessen Evidence-Set-Hash nicht mehr dem
 * aktuellen Retrieval-Stand seiner Familie entspricht (oder dessen Familie im
 * aktuellen Lauf gar nicht mehr auftaucht), bleibt sichtbar (Mensch entscheidet),
 * wird aber als `stale` markiert. Ohne übergebene currentHashes (z.B. reine
 * Merge-Unit-Tests) wird nichts markiert.
 */
function isStale(finding: DiscoveryFinding, currentHashes?: Map<string, string>): boolean {
  if (!currentHashes) return false;
  return currentHashes.get(finding.family) !== finding.corpusVersionHash;
}

function corpusBlock(finding: DiscoveryFinding, stale: boolean): NonNullable<NormApplicabilityAssessment['corpus']> {
  return {
    status: finding.status,
    applies: finding.applies,
    confidence: finding.confidence,
    reasoning: finding.reasoning,
    keyParagraphs: [...finding.keyParagraphs],
    // AC-4 (Fix 1): Titel-Details durchreichen — Alt-Findings ohne das Feld
    // bleiben undefined (UI-Fallback: roher regulationKey).
    ...(finding.keyParagraphDetails ? { keyParagraphDetails: finding.keyParagraphDetails.map(d => ({ ...d })) } : {}),
    elementIds: [...finding.elementIds],
    sources: [...finding.sources],
    corpusVersionHash: finding.corpusVersionHash,
    ...(stale ? { stale: true } : {}),
    // THE-423 Task 14: surface the retrieval trace id so the UI can offer a
    // "paragraphs the judge reviewed" expander. Additive — legacy findings
    // without it simply render without the expander.
    ...(finding.contextTraceId ? { contextTraceId: finding.contextTraceId } : {}),
  };
}

/**
 * Review-Fix 1 (Slice-2b Task 3a): ohne World-State bleibt das Alt-Verhalten
 * (workId undefined, availableInCorpus hart true, inPipeline false) — reine
 * Merge-Unit-Tests crashen nicht. MIT World-State wird — exakt wie
 * `enrichAssessment` für Stage-A-Assessments — workId/availableInCorpus/
 * inPipeline aus dem tatsächlichen Norm-/Pipeline-Zustand abgeleitet, sonst
 * kann „Add to pipeline" für bestätigte Korpus-Funde nie erscheinen (AC-5).
 */
function toCorpusOnlyAssessment(
  finding: DiscoveryFinding,
  stale: boolean,
  world?: NormWorldState,
): NormApplicabilityAssessment {
  const referencedSource = world && finding.sources.find(s => world.referencedCorpusSources.has(s));
  const availableSource = world && finding.sources.find(s => world.availableCorpusSources.has(s));
  const preferredSource = referencedSource ?? availableSource;
  const inPipeline = world
    ? finding.sources.some(s => world.pipelineNormIds.has(deriveNormWorkId('corpus', s)))
    : false;
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
    inPipeline,
    availableInCorpus: world ? Boolean(availableSource) || Boolean(referencedSource) : true,
    workId: preferredSource ? deriveNormWorkId('corpus', preferredSource) : undefined,
    provenance: 'corpus',
    corpus: corpusBlock(finding, stale),
  };
}

export function mergeApplicability(
  stageA: ApplicabilityReport,
  findings: DiscoveryFinding[],
  corpusVersion: string | undefined,
  currentEvidenceHashes?: Map<string, string>,
  world?: NormWorldState,
): ApplicabilityReport {
  // AC-2 (nur applies:true zählt als Korpus-Signal — ein "gilt nicht"-Urteil
  // trägt keine positive Evidenz und darf keinen Assessment berühren/erzeugen).
  const applicableFindings = findings.filter(f => f.applies);

  // Code-Review-Fix (Determinismus): mehrere Findings derselben Familie können
  // koexistieren (Evidence-Wechsel = neuer Dedup-Key, alte Docs bleiben als
  // Historie). Pro Familie gewinnt DETERMINISTISCH das Finding, dessen
  // Evidence-Set dem aktuellen Lauf entspricht — nie die zufällige Mongo-
  // Reihenfolge. Ohne currentHashes (Unit-Merge): erstes gesehenes gewinnt.
  const findingByFamily = new Map<string, DiscoveryFinding>();
  for (const f of applicableFindings) {
    const cur = findingByFamily.get(f.family);
    if (!cur) {
      findingByFamily.set(f.family, f);
      continue;
    }
    const currentHash = currentEvidenceHashes?.get(f.family);
    if (currentHash !== undefined && f.corpusVersionHash === currentHash && cur.corpusVersionHash !== currentHash) {
      findingByFamily.set(f.family, f);
    }
  }

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
      corpus: corpusBlock(finding, isStale(finding, currentEvidenceHashes)),
    };
  });

  // Über die deduplizierte Familien-Sicht iterieren — sonst erzeugen zwei
  // Findings derselben Familie zwei corpus-only-Assessments (Code-Review-Fix).
  for (const finding of findingByFamily.values()) {
    if (matchedFamilies.has(finding.family)) continue; // schon als 'both' gemerged
    merged.push(toCorpusOnlyAssessment(finding, isStale(finding, currentEvidenceHashes), world));
  }

  // Sortierung: max(score, corpus.confidence) absteigend, stabiler Tie-Break nach label.
  merged.sort((a, b) => rankScore(b) - rankScore(a) || a.label.localeCompare(b.label));

  return {
    ...stageA,
    assessments: merged,
    coverage: {
      stageARuleCount: stageA.assessments.length,
      // Familien-Zählung (dedupliziert, nur applies:true) — „M Korpus-Gesetze",
      // nicht rohe Finding-Dokumente (Code-Review-Fix).
      stageBCorpusCount: findingByFamily.size,
      corpusVersion,
    },
  };
}
