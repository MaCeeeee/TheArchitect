/**
 * activityGenerator.service → ContextTrace (THE-423 Task 9, Step 1: activity).
 *
 * `generateActivitiesForProcess`'s RAG-query helper (`queryRagSafe`) currently
 * calls `governedQuery` directly. This suite pins the swap to
 * `tracedGovernedQuery(feature:'activity')`: a ContextTrace(feature:'activity',
 * retrievalMethod:'dense') must be written from the read, and the generator's
 * returned activities must be byte-identical to before (only the read is traced).
 *
 * Node-stamp: NOT applicable here — `apply-activities` (aiGenerator.routes.ts)
 * is a SEPARATE client-driven POST route from this generate step (SSE), so the
 * contextTraceId would need a client round-trip to reach node creation. Follow-up,
 * not implemented in this task (see plan Task 9 node-stamp constraint).
 *
 * Mocking seams mirror governedRetrieval.trace.test.ts (dataServer.service +
 * corpusClient fake corpus + mongodb-memory-server) plus a minimal Neo4j/Anthropic
 * stub so the full `generateActivitiesForProcess` flow can run end-to-end.
 */
jest.mock('../services/dataServer.service', () => ({
  queryDocuments: jest.fn(),
  isConfigured: () => true,
}));

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: (...a: unknown[]) => mockCreate(...a) },
  }));
});

jest.mock('../config/neo4j', () => {
  const actual = jest.requireActual('../config/neo4j');
  return { ...actual, runCypher: jest.fn() };
});

import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContextTrace } from '../models/ContextTrace';
import { generateActivitiesForProcess } from '../services/activityGenerator.service';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';
import { runCypher } from '../config/neo4j';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockRunCypher = runCypher as jest.MockedFunction<typeof runCypher>;

const PROCESS_PROPS = {
  id: 'proc-1',
  name: 'Onboard Customer',
  description: 'Business process description',
  layer: 'business',
  type: 'business_process',
};

const GENERATED_ACTIVITIES = [
  { name: 'Collect KYC Data', owner: 'Compliance-Team', action: 'collects identity documents', system: 'SAP S/4', when: 'within 24h', output: 'KYC-Dossier', enables: 'Verify Identity' },
  { name: 'Verify Identity', owner: 'Compliance-Team', action: 'verifies submitted documents', system: 'IDnow', when: 'within 48h', output: 'Verification-Result', enables: 'Audit-Closure' },
];

function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'BODY', score: 0.9, ...overrides };
}

describe('activityGenerator.service → ContextTrace (THE-423 Task 9, activity)', () => {
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
    process.env.ANTHROPIC_API_KEY = 'test-key';
    projectId = new Types.ObjectId().toString();

    mockQuery.mockReset();
    mockCreate.mockReset();
    mockRunCypher.mockReset();

    // 1) process lookup returns one record; 2) project-context / spec-chain /
    // flow queries all return [] — the generator handles empty gracefully.
    mockRunCypher.mockImplementation(async (query: string) => {
      if (query.includes('RETURN e LIMIT 1')) {
        return [{ get: (k: string) => (k === 'e' ? { properties: PROCESS_PROPS } : undefined) }] as any;
      }
      return [] as any;
    });

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(GENERATED_ACTIVITIES) }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'law', text: 'GDPR Art.30 text', score: 0.87, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
      ],
    });

    __setCorpusForTests(
      makeFakeCorpus([{ regulationKey: 'gdpr:art-30', versionHash: 'h2', version: 1, fullText: 'X' }]),
    );
  });

  afterEach(async () => {
    await ContextTrace.deleteMany({});
    __setCorpusForTests(null);
    process.env = { ...originalEnv };
  });

  it('records a ContextTrace(feature:activity, retrievalMethod:dense) from the RAG read', async () => {
    const events: unknown[] = [];
    const result = await generateActivitiesForProcess({
      projectId,
      processId: 'proc-1',
      onEvent: (e) => events.push(e),
    });

    expect(result.activities).toHaveLength(2);
    expect(result.activities[0].name).toBe('Collect KYC Data');

    const traces = await ContextTrace.find({ feature: 'activity', projectId });
    expect(traces).toHaveLength(1);
    expect(traces[0].consumed).toHaveLength(1);
    expect(traces[0].consumed[0]).toMatchObject({
      regulationKey: 'gdpr:art-30',
      versionHash: 'h2',
      score: 0.87,
      retrievalMethod: 'dense',
    });
  });

  it('does not change the generated activities whether tracing is on or off', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    const disabled = await generateActivitiesForProcess({ projectId, processId: 'proc-1', onEvent: () => {} });

    process.env.CONTEXT_TRACING_ENABLED = 'true';
    const enabled = await generateActivitiesForProcess({ projectId, processId: 'proc-1', onEvent: () => {} });

    expect(enabled.activities).toEqual(disabled.activities);
  });
});
