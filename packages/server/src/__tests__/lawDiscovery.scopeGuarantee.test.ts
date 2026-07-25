/**
 * THE-516 / ADR-0006 — Scope-Guarantee-Verdrahtung in der Discovery (Task 2).
 *
 * Eigene Datei (Jest-Suchmuster "lawDiscovery" trifft sie) statt Umbau von
 * lawDiscovery.test.ts — hält die Slice-1-Suite unangetastet und vermeidet
 * Mock-Kollisionen (hier braucht es zusätzlich den corpusClient-Scope-Read,
 * Sentry und die discoverAndJudge-Doubles).
 *
 * Coverage:
 *   - AC-3: Flag aus ⇒ byte-identisch zu HEAD (kein Feld, kein Korpus-Read)
 *   - Happy: Injektion markiert + ans Ende + ≤2/Familie, 'applied',
 *     evidenceSetHash ändert sich (E4), Familien-Score bleibt (Leitplanke)
 *   - 'partial' (Familie ohne konsumierbare scope-§§) ⇒ KEIN Alert (E5)
 *   - Lookup-Fehler ⇒ weich, 'unavailable', GENAU EIN Sentry-Alert mit
 *     component-Tag (E5 / AC-5)
 *   - ContextTrace: consumed[] trägt origin, Trace trägt scopeGuarantee (E4)
 *
 * Run: cd packages/server && npx jest src/__tests__/lawDiscovery.scopeGuarantee.test.ts --verbose
 */
const mockProfile = jest.fn();
const mockSearch = jest.fn();
const mockConfigured = jest.fn();
const mockListScope = jest.fn();
const mockCapture = jest.fn();
jest.mock('../services/useCaseProfile.service', () => ({ buildUseCaseProfile: (...a: unknown[]) => mockProfile(...a) }));
jest.mock('../services/governedRetrieval.service', () => ({ governedCorpusSearch: (...a: unknown[]) => mockSearch(...a) }));
jest.mock('../services/corpusClient.service', () => ({
  isCorpusConfigured: () => mockConfigured(),
  listScopeProvisionsBySource: (...a: unknown[]) => mockListScope(...a),
}));
jest.mock('../services/hyde.service', () => ({ hydeRewrite: jest.fn() }));
jest.mock('@sentry/node', () => ({ captureException: (...a: unknown[]) => mockCapture(...a) }));

// discoverAndJudge-Doubles (Muster lawDiscoveryJudge.orchestration.test.ts).
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
const mockRecordTrace = jest.fn(async (..._a: unknown[]) => 'trace-1');
jest.mock('../services/contextTrace.service', () => ({ recordContextTrace: (...a: unknown[]) => mockRecordTrace(...a) }));
const mockUpsert = jest.fn(async (..._a: unknown[]) => undefined);
const mockFindExisting = jest.fn(async (..._a: unknown[]) => null);
const mockListFindings = jest.fn(async (..._a: unknown[]) => []);
jest.mock('../services/lawDiscoveryFinding.service', () => ({
  upsertFindings: (...a: unknown[]) => mockUpsert(...a),
  findExisting: (...a: unknown[]) => mockFindExisting(...a),
  listFindings: (...a: unknown[]) => mockListFindings(...a),
}));

import {
  discoverCandidates,
  discoverAndJudge,
  aggregateHitsToCandidates,
  evidenceSetHash,
} from '../services/lawDiscovery.service';
import type { ConsumedRef, CorpusHit } from '@thearchitect/shared';

const h = (source: string, para: string, score: number): CorpusHit => ({
  regulationKey: `${source}:${para}`,
  versionHash: `v-${source}-${para}`,
  source,
  paragraphNumber: para,
  title: `Art ${para}`,
  jurisdiction: 'EU',
  language: source.endsWith('-de') ? 'de' : 'en',
  score,
});

const scopeDoc = (source: string, para: string, lang = 'en') => ({
  source,
  paragraphNumber: para,
  title: `Scope Art ${para}`,
  language: lang,
  jurisdiction: 'EU',
  versionHash: `v-${source}-${para}`,
  typing: {
    provisionKind: 'scope-applicability',
    versionHash: `v-${source}-${para}`,
    status: 'suggested' as const,
  },
});

describe('discoverCandidates — Scope-Guarantee (THE-516)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.LAW_DISCOVERY_SCOPE_GUARANTEE;
    delete process.env.LAW_DISCOVERY_HYDE;
    mockConfigured.mockReturnValue(true);
    mockProfile.mockResolvedValue({ projectId: 'p1', text: 'prof', signalHints: [], meta: {} });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const baseHits = () => [h('ai-act-en', '16', 0.9), h('ai-act-en', '17', 0.8), h('dora-en', '9', 0.7)];

  it('AC-3: Flag aus (unset UND "false") ⇒ byte-identisch — kein scopeGuarantee-Feld, kein Korpus-Typing-Read', async () => {
    mockSearch.mockResolvedValue(baseHits());
    const res = await discoverCandidates('p1');
    expect(mockListScope).not.toHaveBeenCalled();
    expect('scopeGuarantee' in res).toBe(false);
    // Voller Shape-Vergleich gegen die reine Aggregation (HEAD-Verhalten).
    expect(res).toEqual({ projectId: 'p1', corpusConfigured: true, candidates: aggregateHitsToCandidates(baseHits()) });

    process.env.LAW_DISCOVERY_SCOPE_GUARANTEE = 'false';
    const res2 = await discoverCandidates('p1');
    expect(mockListScope).not.toHaveBeenCalled();
    expect('scopeGuarantee' in res2).toBe(false);
  });

  it('happy: injiziert markiert + ans Ende + ≤2/Familie, EIN Read über alle Familien, "applied", Score unverändert, Hash ändert sich', async () => {
    mockSearch.mockResolvedValue(baseHits());
    const baseline = await discoverCandidates('p1'); // Flag aus — HEAD-Referenz
    const baselineAi = baseline.candidates.find(c => c.family === 'ai-act')!;

    process.env.LAW_DISCOVERY_SCOPE_GUARANTEE = 'true';
    mockListScope.mockResolvedValue([
      scopeDoc('ai-act-en', '1'),
      scopeDoc('ai-act-en', '2'),
      scopeDoc('ai-act-en', '3'), // E2-Kappung: nur 2 dürfen rein
      scopeDoc('dora-en', '2'),
    ]);
    const res = await discoverCandidates('p1');

    // EIN Read für alle Familien (nicht N) — mit der Vereinigung der Quellen.
    expect(mockListScope).toHaveBeenCalledTimes(1);
    const sourcesArg = mockListScope.mock.calls[0][0] as string[];
    expect([...sourcesArg].sort()).toEqual(['ai-act-en', 'dora-en']);

    expect(res.scopeGuarantee).toBe('applied');
    const ai = res.candidates.find(c => c.family === 'ai-act')!;
    const injected = ai.topHits.filter(x => x.origin === 'scope-guarantee');
    expect(injected.map(x => x.regulationKey)).toEqual(['ai-act-en:1', 'ai-act-en:2']); // ≤2, niedrigste zuerst
    expect(injected.every(x => x.score === 0)).toBe(true); // Score-neutral
    // Ans ENDE gehängt: Bestands-Ordnung (Top-Similarity) bleibt intakt.
    expect(ai.topHits.slice(0, baselineAi.topHits.length)).toEqual(baselineAi.topHits);
    // Familien-Score-Neutralität (harte Leitplanke).
    expect(ai.score).toBe(baselineAi.score);
    expect(ai.hitCount).toBe(baselineAi.hitCount);
    // E4: Evidence-Fingerabdruck ändert sich automatisch — kein Sonderfall.
    expect(evidenceSetHash(ai)).not.toBe(evidenceSetHash(baselineAi));
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('E2-Dedupe: scope-§ bereits regulär in topHits ⇒ kein Duplikat, Garantie gilt als erfüllt ("applied")', async () => {
    mockSearch.mockResolvedValue([h('ai-act-en', '2', 0.9)]); // Art. 2 schon in Evidenz
    process.env.LAW_DISCOVERY_SCOPE_GUARANTEE = 'true';
    mockListScope.mockResolvedValue([scopeDoc('ai-act-en', '2')]);
    const res = await discoverCandidates('p1');
    const ai = res.candidates.find(c => c.family === 'ai-act')!;
    expect(ai.topHits.filter(x => x.regulationKey === 'ai-act-en:2')).toHaveLength(1);
    expect(res.scopeGuarantee).toBe('applied');
  });

  it('E2-Sprachwahl: dominante Sprache der Familien-topHits gewinnt', async () => {
    mockSearch.mockResolvedValue([h('ai-act-de', '16', 0.9), h('ai-act-de', '17', 0.85), h('ai-act-en', '16', 0.8)]);
    process.env.LAW_DISCOVERY_SCOPE_GUARANTEE = 'true';
    mockListScope.mockResolvedValue([scopeDoc('ai-act-de', '2', 'de'), scopeDoc('ai-act-en', '2', 'en')]);
    const res = await discoverCandidates('p1');
    const injected = res.candidates[0].topHits.filter(x => x.origin === 'scope-guarantee');
    expect(injected.map(x => x.language)).toEqual(['de']); // de dominiert (2 von 3 Hits)
  });

  it('partial: Familie ohne konsumierbare scope-§§ ⇒ Feld "partial", KEIN Alert (E5)', async () => {
    mockSearch.mockResolvedValue(baseHits());
    process.env.LAW_DISCOVERY_SCOPE_GUARANTEE = 'true';
    process.env.SENTRY_DSN = 'https://x@sentry.example/1';
    mockListScope.mockResolvedValue([scopeDoc('ai-act-en', '2')]); // dora geht leer aus
    const res = await discoverCandidates('p1');
    expect(res.scopeGuarantee).toBe('partial');
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('unavailable: Lookup wirft ⇒ Discovery liefert weiter (weich), Feld "unavailable", GENAU EIN Sentry-Alert mit component-Tag', async () => {
    mockSearch.mockResolvedValue(baseHits());
    process.env.LAW_DISCOVERY_SCOPE_GUARANTEE = 'true';
    process.env.SENTRY_DSN = 'https://x@sentry.example/1';
    mockListScope.mockRejectedValue(new Error('corpus down'));
    const res = await discoverCandidates('p1');
    // Weich: Kandidaten unverändert wie ohne Garantie.
    expect(res.candidates).toEqual(aggregateHitsToCandidates(baseHits()));
    expect(res.scopeGuarantee).toBe('unavailable');
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [err, ctx] = mockCapture.mock.calls[0] as [Error, { tags?: Record<string, string> }];
    expect(err).toBeInstanceOf(Error);
    expect(ctx.tags).toEqual({ component: 'law-discovery-scope-guarantee' });
  });
});

describe('discoverAndJudge — Scope-Guarantee im ContextTrace (THE-516 / E4)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-key' };
    delete process.env.LAW_DISCOVERY_JUDGE_THRESHOLD;
    delete process.env.LAW_DISCOVERY_MAX_JUDGE;
    mockConfigured.mockReturnValue(true);
    mockProfile.mockResolvedValue({ projectId: 'p1', text: 'prof', signalHints: [], meta: {} });
    mockLoadFacts.mockResolvedValue({ projectId: 'p1', elements: [], projectFields: [] });
    mockBuildReport.mockResolvedValue({
      projectId: 'p1', generatedAt: new Date().toISOString(), elementCount: 0, wizardElementCount: 0,
      assumedJurisdictions: ['EU'], signals: [], assessments: [], disclaimer: 'not legal advice',
    });
    mockLoadWorld.mockResolvedValue({
      referencedCorpusSources: new Set(), availableCorpusSources: new Set(),
      pipelineNormIds: new Set(), uploadTitles: [],
    });
    mockJudge.mockResolvedValue({ family: 'ai-act', applies: true, confidence: 0.8, reasoning: 'r', elementIds: [], keyParagraphs: ['ai-act-en:1'] });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('consumed[] trägt origin für injizierte §§, Trace trägt den scopeGuarantee-Zustand', async () => {
    process.env.LAW_DISCOVERY_SCOPE_GUARANTEE = 'true';
    mockSearch.mockResolvedValue([h('ai-act-en', '16', 0.9)]);
    mockListScope.mockResolvedValue([scopeDoc('ai-act-en', '1')]);

    await discoverAndJudge('p1');

    expect(mockRecordTrace).toHaveBeenCalledTimes(1);
    const traceInput = mockRecordTrace.mock.calls[0][0] as unknown as {
      consumed: ConsumedRef[]; scopeGuarantee?: string;
    };
    expect(traceInput.scopeGuarantee).toBe('applied');
    const injectedRef = traceInput.consumed.find(c => c.regulationKey === 'ai-act-en:1');
    expect(injectedRef).toBeDefined();
    expect(injectedRef!.origin).toBe('scope-guarantee');
    expect(injectedRef!.citedByJudge).toBe(true); // Judge zitierte den injizierten §
    const retrievalRef = traceInput.consumed.find(c => c.regulationKey === 'ai-act-en:16');
    expect(retrievalRef).toBeDefined();
    expect(retrievalRef!.origin).toBeUndefined(); // Bestands-Hits werden nicht backfilled
  });

  it('Flag aus ⇒ Trace ohne scopeGuarantee, consumed ohne origin (HEAD-Verhalten)', async () => {
    mockSearch.mockResolvedValue([h('ai-act-en', '16', 0.9)]);
    await discoverAndJudge('p1');
    expect(mockListScope).not.toHaveBeenCalled();
    const traceInput = mockRecordTrace.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect('scopeGuarantee' in traceInput).toBe(false);
  });
});
