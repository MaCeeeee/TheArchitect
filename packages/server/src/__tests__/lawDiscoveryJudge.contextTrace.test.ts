/**
 * discoverAndJudge → ContextTrace wiring — UC-LAW-002 / THE-423 Task 5.
 *
 * Mirrors the mocking harness of lawDiscoveryJudge.orchestration.test.ts
 * (same doubles for useCaseProfile/governedCorpusSearch/corpusClient/
 * regulationApplicability/lawJudge/lawDiscoveryFinding-fake-store), plus a
 * mock of `recordContextTrace` (contextTrace.service) to inspect exactly
 * what gets persisted — same pattern as mocking `upsertFindings` there.
 *
 * Coverage (Task 5):
 *   - after discoverAndJudge (tracing "on"), the persisted finding carries
 *     a contextTraceId
 *   - the recorded ContextTrace.consumed set is built from candidate.topHits,
 *     with citedByJudge:true EXACTLY for the regulationKeys in
 *     verdict.keyParagraphs (false for the rest)
 *   - llmTraceRef on the ContextTrace call == the requestId judgeCandidate's
 *     recordAiTrace produced (surfaced via judgeCandidate's return value)
 *
 * Run: cd packages/server && npx jest src/__tests__/lawDiscoveryJudge.contextTrace.test.ts --verbose
 */
const mockProfile = jest.fn();
const mockSearch = jest.fn();
const mockConfigured = jest.fn();
jest.mock('../services/useCaseProfile.service', () => ({ buildUseCaseProfile: (...a: unknown[]) => mockProfile(...a) }));
jest.mock('../services/governedRetrieval.service', () => ({ governedCorpusSearch: (...a: unknown[]) => mockSearch(...a) }));
jest.mock('../services/corpusClient.service', () => ({ isCorpusConfigured: () => mockConfigured() }));

const mockBuildReport = jest.fn();
const mockLoadFacts = jest.fn();
const mockLoadWorld = jest.fn();
jest.mock('../services/regulationApplicability.service', () => ({
  buildApplicabilityReport: (...a: unknown[]) => mockBuildReport(...a),
  loadProjectFacts: (...a: unknown[]) => mockLoadFacts(...a),
  loadNormWorldState: (...a: unknown[]) => mockLoadWorld(...a),
}));

const mockJudge = jest.fn();
jest.mock('../services/lawJudge.service', () => ({ judgeCandidate: (...a: unknown[]) => mockJudge(...a) }));

const mockRecordContextTrace = jest.fn();
jest.mock('../services/contextTrace.service', () => ({
  recordContextTrace: (...a: unknown[]) => mockRecordContextTrace(...a),
}));

// Same in-memory fake-store as the orchestration suite — the real persistence/
// lifecycle behavior of upsertFindings is covered elsewhere.
type FakeFinding = { family: string; corpusVersionHash: string; status: string; judgeModel: string; applies: boolean; [k: string]: unknown };
let fakeStore: FakeFinding[] = [];
const mockUpsert = jest.fn(async (_projectId: string, findings: FakeFinding[]) => {
  for (const f of findings) {
    const i = fakeStore.findIndex(x => x.family === f.family && x.corpusVersionHash === f.corpusVersionHash);
    if (i >= 0) {
      if (fakeStore[i].status !== 'auto') continue;
      fakeStore[i] = { ...f, status: 'auto', createdBy: 'llm' };
    } else {
      fakeStore.push({ ...f, status: 'auto', createdBy: 'llm' });
    }
  }
});
const mockFindExisting = jest.fn(async (_projectId: string, family: string, corpusVersionHash: string) =>
  fakeStore.find(x => x.family === family && x.corpusVersionHash === corpusVersionHash) ?? null,
);
const mockListFindings = jest.fn(async (..._a: unknown[]) => [...fakeStore]);
jest.mock('../services/lawDiscoveryFinding.service', () => ({
  upsertFindings: (...a: [string, FakeFinding[]]) => mockUpsert(...a),
  findExisting: (...a: [string, string, string]) => mockFindExisting(...a),
  listFindings: (...a: unknown[]) => mockListFindings(...a),
}));

import { discoverAndJudge, evidenceSetHash } from '../services/lawDiscovery.service';

const h = (source: string, para: string, score: number) => ({
  regulationKey: `${source}:${para}`,
  versionHash: `v-${source}-${para}`,
  source,
  paragraphNumber: para,
  title: `Art ${para}`,
  jurisdiction: 'EU',
  language: source.endsWith('-de') ? 'de' : 'en',
  score,
});

const stageAReport = {
  projectId: 'p1',
  generatedAt: new Date().toISOString(),
  elementCount: 3,
  wizardElementCount: 1,
  assumedJurisdictions: ['EU'],
  signals: [],
  assessments: [],
  disclaimer: 'not legal advice',
};

describe('discoverAndJudge → ContextTrace (THE-423 Task 5)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    fakeStore = [];
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key', CONTEXT_TRACING_ENABLED: 'true' };
    delete process.env.LAW_DISCOVERY_JUDGE_THRESHOLD;
    delete process.env.LAW_DISCOVERY_MAX_JUDGE;
    mockConfigured.mockReturnValue(true);
    mockProfile.mockResolvedValue({ projectId: 'p1', text: 'profile text', signalHints: [], meta: { elementsUsed: 1, elementsTotal: 1, truncated: false, charBudget: 6000 } });
    mockLoadFacts.mockResolvedValue({ projectId: 'p1', elements: [{ id: 'e1', name: 'Auth', type: 'application_service', description: '', fromWizard: false, layer: 'application' }], projectFields: [] });
    mockBuildReport.mockResolvedValue(stageAReport);
    mockLoadWorld.mockResolvedValue({
      referencedCorpusSources: new Set(),
      availableCorpusSources: new Set(),
      pipelineNormIds: new Set(),
      uploadTitles: [],
    });
    mockRecordContextTrace.mockResolvedValue('trace-req-1');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('writes a ContextTrace per judged candidate with citedByJudge set exactly for verdict.keyParagraphs, and stamps contextTraceId onto the finding', async () => {
    // Two hits for the same family: art-5 will be cited by the judge, art-9 will not.
    mockSearch.mockResolvedValue([h('ai-act-en', '5', 0.9), h('ai-act-en', '9', 0.7)]);
    mockJudge.mockResolvedValue({
      family: 'ai-act',
      applies: true,
      confidence: 0.85,
      reasoning: 'AI system present',
      elementIds: ['e1'],
      keyParagraphs: ['ai-act-en:5'], // only art-5 cited
      aiTraceRequestId: 'llm-trace-42',
    });

    await discoverAndJudge('p1');

    // --- ContextTrace was recorded once, for the discovery feature ---
    expect(mockRecordContextTrace).toHaveBeenCalledTimes(1);
    const traceInput = mockRecordContextTrace.mock.calls[0][0] as {
      feature: string;
      projectId: string;
      model: string;
      llmTraceRef?: string;
      evidenceSetHash?: string;
      consumed: Array<{ regulationKey: string; versionHash: string; citedByJudge?: boolean; retrievalMethod: string; sectionRef?: string; score?: number }>;
    };
    expect(traceInput.feature).toBe('discovery');
    expect(traceInput.projectId).toBe('p1');
    expect(traceInput.llmTraceRef).toBe('llm-trace-42'); // surfaced from judgeCandidate's return value

    const byKey = new Map(traceInput.consumed.map(c => [c.regulationKey, c]));
    expect(byKey.get('ai-act-en:5')?.citedByJudge).toBe(true);
    expect(byKey.get('ai-act-en:9')?.citedByJudge).toBe(false);
    expect(byKey.get('ai-act-en:5')?.retrievalMethod).toBe('dense');
    expect(byKey.get('ai-act-en:5')?.versionHash).toBe('v-ai-act-en-5');

    // evidenceSetHash matches the same derivation used for corpusVersionHash.
    const expectedHash = evidenceSetHash({
      topHits: [
        { ...h('ai-act-en', '5', 0.9) },
        { ...h('ai-act-en', '9', 0.7) },
      ],
    } as never);
    expect(traceInput.evidenceSetHash).toBe(expectedHash);

    // --- the persisted finding carries the returned contextTraceId ---
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const persisted = mockUpsert.mock.calls[0][1] as FakeFinding[];
    expect(persisted).toHaveLength(1);
    expect(persisted[0].contextTraceId).toBe('trace-req-1');
  });

  it('marks citedByJudge:false for ALL hits when the judge cites nothing', async () => {
    mockSearch.mockResolvedValue([h('dora-en', '3', 0.9)]);
    mockJudge.mockResolvedValue({ family: 'dora', applies: false, confidence: 0.2, reasoning: 'no', elementIds: [], keyParagraphs: [] });

    await discoverAndJudge('p1');

    const traceInput = mockRecordContextTrace.mock.calls[0][0] as { consumed: Array<{ citedByJudge?: boolean }> };
    expect(traceInput.consumed.every(c => c.citedByJudge === false)).toBe(true);
  });

  it('a skipped (reused-finding) candidate does not trigger a new ContextTrace write', async () => {
    mockSearch.mockResolvedValue([h('ai-act-en', '5', 0.9)]);
    mockJudge.mockResolvedValue({ family: 'ai-act', applies: true, confidence: 0.8, reasoning: 'r', elementIds: [], keyParagraphs: ['ai-act-en:5'] });

    await discoverAndJudge('p1');
    expect(mockRecordContextTrace).toHaveBeenCalledTimes(1);

    mockRecordContextTrace.mockClear();
    mockJudge.mockClear();
    await discoverAndJudge('p1'); // reused via findExisting — no new judge call, no new trace
    expect(mockJudge).toHaveBeenCalledTimes(0);
    expect(mockRecordContextTrace).toHaveBeenCalledTimes(0);
  });
});
