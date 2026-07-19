/**
 * connectionSuggestion.service → ContextTrace (THE-423 Task 9, Step 2: connection).
 *
 * `suggestConnectionsForIsolatedElements`'s RAG helper (`fetchRagContextSafe`)
 * currently calls `governedQuery` directly, once per isolated element. This
 * suite pins the swap to `tracedGovernedQuery(feature:'connection')`: a
 * ContextTrace(feature:'connection', retrievalMethod:'dense') must be written
 * per RAG-backed element, and — because `architecture.routes.ts`'s
 * `/heal-connections` route applies suggestions in the SAME handler as this
 * call (no client round-trip) — each returned `Suggestion` now carries the
 * `contextTraceId` for the read that informed it, so the apply route can
 * node-stamp the created relationship cleanly (verified separately in
 * architecture.routes.heal-connections.contextTrace.test.ts).
 */
jest.mock('../services/dataServer.service', () => ({
  queryDocuments: jest.fn(),
  isConfigured: () => true,
}));

import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContextTrace } from '../models/ContextTrace';
import { suggestConnectionsForIsolatedElements, type LLMReasoner } from '../services/connectionSuggestion.service';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;

type El = { id: string; type: string; name: string; description?: string };

const stakeholder: El = { id: 's1', type: 'stakeholder', name: 'CFO', description: 'Owns financial outcomes.' };
const driver: El = { id: 'd1', type: 'driver', name: 'CSRD compliance', description: 'EU mandate, Q1 2026.' };

const llmAlwaysMatches: LLMReasoner = async ({ candidates }) => candidates.slice(0, 1).map((c) => ({
  targetId: c.id,
  relationshipType: 'influence' as const,
  confidence: 0.9,
  reasoning: 'stub match',
}));

function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'BODY', score: 0.9, ...overrides };
}

describe('connectionSuggestion.service → ContextTrace (THE-423 Task 9, connection)', () => {
  let mongoServer: MongoMemoryServer;
  const originalEnv = { ...process.env };
  let projectId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(() => {
    process.env.CONTEXT_TRACING_ENABLED = 'true';
    projectId = new Types.ObjectId().toString();
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'law', text: 'CSRD Art.19a text', score: 0.8, metadata: { regulationKey: 'csrd:art-19a', versionHash: 'h2' } }),
      ],
    });
    __setCorpusForTests(
      makeFakeCorpus([{ regulationKey: 'csrd:art-19a', versionHash: 'h2', version: 1, fullText: 'X' }]),
    );
  });

  afterEach(async () => {
    await ContextTrace.deleteMany({});
    __setCorpusForTests(null);
    process.env = { ...originalEnv };
  });

  it('records a ContextTrace(feature:connection, retrievalMethod:dense) per RAG-backed element and stamps contextTraceId onto the returned Suggestion', async () => {
    const r = await suggestConnectionsForIsolatedElements({
      projectId,
      elements: [stakeholder, driver],
      connections: [],
      minConfidence: 0.7,
      llm: llmAlwaysMatches,
    });

    expect(r.suggestionsTotal).toBeGreaterThan(0);
    const sugs = [...r.perElement.values()].flat();
    expect(sugs.length).toBeGreaterThan(0);
    // Every suggestion must carry the contextTraceId of the read that informed it.
    for (const s of sugs) {
      expect(s.contextTraceId).toBeDefined();
    }

    const traces = await ContextTrace.find({ feature: 'connection', projectId });
    expect(traces.length).toBeGreaterThan(0);
    expect(traces[0].consumed[0]).toMatchObject({
      regulationKey: 'csrd:art-19a',
      versionHash: 'h2',
      retrievalMethod: 'dense',
    });
    expect(sugs.map((s) => s.contextTraceId)).toContain(traces[0].requestId);
  });

  it('does not change suggestion content (sourceId/targetId/relationshipType/confidence) whether tracing is on or off', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    const disabled = await suggestConnectionsForIsolatedElements({
      projectId,
      elements: [stakeholder, driver],
      connections: [],
      minConfidence: 0.7,
      llm: llmAlwaysMatches,
    });

    process.env.CONTEXT_TRACING_ENABLED = 'true';
    const enabled = await suggestConnectionsForIsolatedElements({
      projectId,
      elements: [stakeholder, driver],
      connections: [],
      minConfidence: 0.7,
      llm: llmAlwaysMatches,
    });

    // Element processing is concurrent (worker pool), so perElement iteration
    // order is not guaranteed — sort by sourceId before comparing content.
    const strip = (s: { contextTraceId?: string }) => { const { contextTraceId: _c, ...rest } = s; return rest; };
    const bySourceId = (a: { sourceId: string }, b: { sourceId: string }) => a.sourceId.localeCompare(b.sourceId);
    const disabledSugs = [...disabled.perElement.values()].flat().map(strip).sort(bySourceId);
    const enabledSugs = [...enabled.perElement.values()].flat().map(strip).sort(bySourceId);
    expect(enabledSugs).toEqual(disabledSugs);
  });
});
