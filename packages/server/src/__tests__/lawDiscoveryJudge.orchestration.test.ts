/**
 * discoverAndJudge Orchestration Tests — UC-LAW-002 Slice-2 (THE-462/463).
 *
 * Separates test file (Jest-Suchmuster "lawDiscovery" trifft auch diese Datei)
 * statt lawDiscovery.test.ts umzubauen — hält die reine Slice-1-Aggregations-
 * Suite unangetastet und vermeidet Mock-Kollisionen (discoverAndJudge braucht
 * deutlich mehr Doubles: Judge, Persistenz, Stage-A-Report).
 *
 * Coverage (Plan Task 8):
 *   (a) Schwellen-/Top-N-Gating (LAW_DISCOVERY_JUDGE_THRESHOLD/_MAX_JUDGE)
 *   (b) Persist der applies-Befunde + Hybrid-Merge mit Stage A
 *   (c) Persisted-Reuse (Review-Fix 3/4, AC-2): 2. Lauf mit unverändertem
 *       Korpus + gleichem Modell macht 0 Judge-Calls
 *   Graceful degradation: kein Provider-Key / kein Korpus ⇒ reiner Stage-A-Report
 *
 * Run: cd packages/server && npx jest src/__tests__/lawDiscoveryJudge.orchestration.test.ts --verbose
 */
const mockProfile = jest.fn();
const mockSearch = jest.fn();
const mockConfigured = jest.fn();
jest.mock('../services/useCaseProfile.service', () => ({ buildUseCaseProfile: (...a: unknown[]) => mockProfile(...a) }));
jest.mock('../services/governedRetrieval.service', () => ({ governedCorpusSearch: (...a: unknown[]) => mockSearch(...a) }));
jest.mock('../services/corpusClient.service', () => ({ isCorpusConfigured: () => mockConfigured() }));

const mockBuildReport = jest.fn();
const mockLoadFacts = jest.fn();
jest.mock('../services/regulationApplicability.service', () => ({
  buildApplicabilityReport: (...a: unknown[]) => mockBuildReport(...a),
  loadProjectFacts: (...a: unknown[]) => mockLoadFacts(...a),
}));

const mockJudge = jest.fn();
jest.mock('../services/lawJudge.service', () => ({ judgeCandidate: (...a: unknown[]) => mockJudge(...a) }));

// In-memory Fake-Store — vermeidet Mongo im Orchestrierungs-Test (die echte
// Persistenz/Lifecycle-Logik ist bereits in lawDiscoveryFinding.service.test.ts
// gegen mongodb-memory-server abgedeckt).
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

import { discoverAndJudge } from '../services/lawDiscovery.service';

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

describe('discoverAndJudge (UC-LAW-002 Slice-2 / THE-462/463)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    fakeStore = [];
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    delete process.env.LAW_DISCOVERY_JUDGE_THRESHOLD;
    delete process.env.LAW_DISCOVERY_MAX_JUDGE;
    mockConfigured.mockReturnValue(true);
    mockProfile.mockResolvedValue({ projectId: 'p1', text: 'profile text', signalHints: [], meta: { elementsUsed: 1, elementsTotal: 1, truncated: false, charBudget: 6000 } });
    mockLoadFacts.mockResolvedValue({ projectId: 'p1', elements: [{ id: 'e1', name: 'Auth', type: 'application_service', description: '', fromWizard: false, layer: 'application' }], projectFields: [] });
    mockBuildReport.mockResolvedValue(stageAReport);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('(a) Schwellen-/Top-N-Gating: nur Kandidaten >= threshold, gedeckelt auf MAX_JUDGE', async () => {
    process.env.LAW_DISCOVERY_JUDGE_THRESHOLD = '0.5';
    process.env.LAW_DISCOVERY_MAX_JUDGE = '1';
    mockSearch.mockResolvedValue([
      h('ai-act-en', '5', 0.9), // family ai-act, score ~0.9 → über Schwelle
      h('dora-en', '3', 0.9),   // family dora, auch über Schwelle → aber MAX_JUDGE=1 kappt
      h('weak-en', '1', 0.1),   // unter Schwelle → nie gejudged
    ]);
    mockJudge.mockResolvedValue({ family: 'ai-act', applies: true, confidence: 0.8, reasoning: 'r', elementIds: [], keyParagraphs: [] });

    await discoverAndJudge('p1');

    expect(mockJudge).toHaveBeenCalledTimes(1); // MAX_JUDGE=1 gekappt
    const judgedFamily = mockJudge.mock.calls[0][0].candidate.family;
    expect(['ai-act', 'dora']).toContain(judgedFamily); // beide über Schwelle, Top-1 nach Score/Family-Sort
    expect(mockJudge.mock.calls.every(c => c[0].candidate.family !== 'weak')).toBe(true);
  });

  it('(b) persistiert nur applies:true-Befunde und merged sie in den Report', async () => {
    mockSearch.mockResolvedValue([h('ai-act-en', '5', 0.9), h('dora-en', '3', 0.9)]);
    mockJudge.mockImplementation(async (args: { candidate: { family: string } }) => {
      if (args.candidate.family === 'ai-act') {
        return { family: 'ai-act', applies: true, confidence: 0.85, reasoning: 'AI system present', elementIds: ['e1'], keyParagraphs: ['ai-act-en:5'] };
      }
      return { family: 'dora', applies: false, confidence: 0.2, reasoning: 'no financial-sector signal', elementIds: [], keyParagraphs: [] };
    });

    const report = await discoverAndJudge('p1');

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const persisted = mockUpsert.mock.calls[0][1] as FakeFinding[];
    expect(persisted.map(f => f.family)).toEqual(['ai-act']); // dora (applies:false) NICHT persistiert

    const corpusAssessment = report.assessments.find(a => a.ruleId === 'ai-act');
    expect(corpusAssessment).toBeDefined();
    expect(corpusAssessment!.provenance).toBe('corpus');
    expect(report.coverage).toBeDefined();
  });

  it('(c) Persisted-Reuse: zweiter Lauf mit unverändertem Korpus + gleichem Modell macht 0 Judge-Calls', async () => {
    mockSearch.mockResolvedValue([h('ai-act-en', '5', 0.9)]);
    mockJudge.mockResolvedValue({ family: 'ai-act', applies: true, confidence: 0.8, reasoning: 'r', elementIds: [], keyParagraphs: [] });

    await discoverAndJudge('p1');
    expect(mockJudge).toHaveBeenCalledTimes(1);

    mockJudge.mockClear();
    await discoverAndJudge('p1');
    expect(mockJudge).toHaveBeenCalledTimes(0); // Review-Fix 3/4: reuse statt neuer LLM-Call
  });

  it('graceful degradation: kein Korpus-konfiguriert ⇒ reiner Stage-A-Report, kein Fehler', async () => {
    mockConfigured.mockReturnValue(false);
    const report = await discoverAndJudge('p1');
    expect(mockJudge).not.toHaveBeenCalled();
    expect(report.assessments).toEqual([]);
    expect(report.disclaimer).toBe('not legal advice');
  });

  it('graceful degradation: kein ANTHROPIC_API_KEY (und kein injizierter Client) ⇒ reiner Stage-A-Report', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockSearch.mockResolvedValue([h('ai-act-en', '5', 0.9)]);
    const report = await discoverAndJudge('p1');
    expect(mockJudge).not.toHaveBeenCalled();
    expect(report.assessments).toEqual([]);
  });
});
