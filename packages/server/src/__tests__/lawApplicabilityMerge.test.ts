/**
 * lawApplicabilityMerge Tests — UC-LAW-002 Slice-2 (THE-463).
 *
 * Merge-Matrix: rules-only / corpus-only / both, Non-Override (AC-2),
 * corpus-only-Sortierung (Review-Fix 2), coverage-Zählung (AC-5).
 *
 * Run: cd packages/server && npx jest src/__tests__/lawApplicabilityMerge.test.ts --verbose
 */
import type { ApplicabilityReport, DiscoveryFinding, NormApplicabilityAssessment } from '@thearchitect/shared';
import { verdictFromScore } from '@thearchitect/shared';
import { mergeApplicability } from '../services/lawApplicabilityMerge.service';

function assessment(overrides: Partial<NormApplicabilityAssessment> = {}): NormApplicabilityAssessment {
  return {
    ruleId: 'gdpr',
    label: 'GDPR',
    corpusSourceIds: ['gdpr-en'],
    jurisdiction: 'EU',
    kind: 'legislation',
    bindingness: 'binding',
    verdict: 'applicable',
    score: 0.9,
    contributions: [],
    rationale: 'PII processing detected.',
    referenced: false,
    inPipeline: false,
    availableInCorpus: true,
    ...overrides,
  };
}

function stageAReport(assessments: NormApplicabilityAssessment[]): ApplicabilityReport {
  return {
    projectId: 'p1',
    generatedAt: new Date().toISOString(),
    elementCount: 5,
    wizardElementCount: 2,
    assumedJurisdictions: ['EU'],
    signals: [],
    assessments,
    disclaimer: 'not legal advice',
  };
}

function finding(overrides: Partial<DiscoveryFinding> = {}): DiscoveryFinding {
  return {
    projectId: 'p1',
    family: 'ai-act',
    sources: ['ai-act-en'],
    jurisdiction: 'EU',
    status: 'auto',
    applies: true,
    confidence: 0.8,
    reasoning: 'High-risk AI component detected.',
    elementIds: ['e1'],
    keyParagraphs: ['ai-act-en:5'],
    retrievalScore: 0.7,
    corpusVersionHash: 'H',
    judgeModel: 'claude-haiku-4-5-20251001',
    createdBy: 'llm',
    ...overrides,
  };
}

describe('mergeApplicability', () => {
  it('rules-only: assessment without a matching finding stays provenance=rules, unchanged score/verdict', () => {
    const stageA = stageAReport([assessment({ ruleId: 'gdpr', score: 0.9, verdict: 'applicable' })]);
    const merged = mergeApplicability(stageA, [], 'H');
    expect(merged.assessments).toHaveLength(1);
    const a = merged.assessments[0];
    expect(a.provenance).toBe('rules');
    expect(a.corpus).toBeUndefined();
    expect(a.score).toBe(0.9);
    expect(a.verdict).toBe('applicable');
  });

  it('corpus-only: a Judge finding with no rules match becomes a new provenance=corpus assessment, score:0, verdict from confidence', () => {
    const notIndicated = assessment({ ruleId: 'dora', label: 'DORA', score: 0, verdict: 'not_indicated' });
    const stageA = stageAReport([notIndicated]);
    const f = finding({ family: 'ai-act', applies: true, confidence: 0.8 });
    const merged = mergeApplicability(stageA, [f], 'H');

    const corpusOnly = merged.assessments.find(a => a.ruleId === 'ai-act');
    expect(corpusOnly).toBeDefined();
    expect(corpusOnly!.provenance).toBe('corpus');
    expect(corpusOnly!.score).toBe(0); // deterministic axis has honestly no signal
    expect(corpusOnly!.verdict).toBe(verdictFromScore(0.8)); // NOT verdictFromScore(0) = not_indicated
    expect(corpusOnly!.verdict).not.toBe('not_indicated');
    expect(corpusOnly!.corpus).toBeDefined();
    expect(corpusOnly!.corpus!.confidence).toBe(0.8);
    expect(corpusOnly!.corpus!.sources).toEqual(['ai-act-en']);

    // Review-Fix 2: the corpus-only hit must rank BEFORE a genuine not_indicated rules assessment.
    const idxCorpus = merged.assessments.findIndex(a => a.ruleId === 'ai-act');
    const idxNotIndicated = merged.assessments.findIndex(a => a.ruleId === 'dora');
    expect(idxCorpus).toBeLessThan(idxNotIndicated);
  });

  it('both: family match keeps deterministic score/verdict UNCHANGED (AC-2), adds a separate corpus block', () => {
    const stageA = stageAReport([assessment({ ruleId: 'ai-act', label: 'AI Act', score: 0.3, verdict: 'possible' })]);
    const f = finding({ family: 'ai-act', applies: true, confidence: 0.95 });
    const merged = mergeApplicability(stageA, [f], 'H');

    expect(merged.assessments).toHaveLength(1);
    const a = merged.assessments[0];
    expect(a.provenance).toBe('both');
    // Deterministic axis is authoritative — never raised or lowered by the judge confidence.
    expect(a.score).toBe(0.3);
    expect(a.verdict).toBe('possible');
    expect(a.corpus).toBeDefined();
    expect(a.corpus!.confidence).toBe(0.95);
  });

  it('a finding with applies:false is ignored entirely (never creates or touches an assessment)', () => {
    const stageA = stageAReport([assessment({ ruleId: 'gdpr' })]);
    const f = finding({ family: 'gdpr', applies: false, confidence: 0.9 });
    const merged = mergeApplicability(stageA, [f], 'H');
    const a = merged.assessments.find(x => x.ruleId === 'gdpr');
    expect(a!.provenance).toBe('rules');
    expect(a!.corpus).toBeUndefined();
  });

  it('sets coverage: stageA rule count, stageB corpus finding count, corpusVersion', () => {
    const stageA = stageAReport([assessment({ ruleId: 'gdpr' }), assessment({ ruleId: 'dora', label: 'DORA' })]);
    const findings = [finding({ family: 'ai-act' }), finding({ family: 'nis2', corpusVersionHash: 'H2' })];
    const merged = mergeApplicability(stageA, findings, 'H');
    expect(merged.coverage).toEqual({
      stageARuleCount: 2,
      stageBCorpusCount: 2,
      corpusVersion: 'H',
    });
  });

  it('flags findings whose evidence-set hash no longer matches the current run as corpus.stale (Spec-Fix 4)', () => {
    const stageA = stageAReport([]);
    const fOld = finding({ family: 'ai-act', corpusVersionHash: 'OLD' });
    const fCur = finding({ family: 'nis2', sources: ['nis2-en'], corpusVersionHash: 'CUR' });
    const current = new Map([['ai-act', 'NEW'], ['nis2', 'CUR']]);
    const merged = mergeApplicability(stageA, [fOld, fCur], 'X', current);
    expect(merged.assessments.find(a => a.ruleId === 'ai-act')!.corpus!.stale).toBe(true);
    expect(merged.assessments.find(a => a.ruleId === 'nis2')!.corpus!.stale).toBeUndefined();
  });

  it('without currentEvidenceHashes (unit-merge without a live run) nothing is flagged stale', () => {
    const merged = mergeApplicability(stageAReport([]), [finding({ corpusVersionHash: 'OLD' })], 'X');
    expect(merged.assessments[0].corpus!.stale).toBeUndefined();
  });

  it('sorts by max(score, corpus.confidence) descending; ties broken by label', () => {
    const stageA = stageAReport([
      assessment({ ruleId: 'a', label: 'Alpha', score: 0.2, verdict: 'possible' }),
      assessment({ ruleId: 'b', label: 'Beta', score: 0.2, verdict: 'possible' }),
    ]);
    const merged = mergeApplicability(stageA, [], undefined);
    expect(merged.assessments.map(a => a.label)).toEqual(['Alpha', 'Beta']);
  });
});
