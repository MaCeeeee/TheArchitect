/**
 * processGenerator.service → ContextTrace (THE-423 Task 9, Step 3: process).
 *
 * `generateProcessesForCapability`'s RAG-query helper (`queryRagSafe`) currently
 * calls `governedQuery` directly. This suite pins the swap to
 * `tracedGovernedQuery(feature:'process')`: a ContextTrace(feature:'process',
 * retrievalMethod:'dense') must be written from the read, and the generator's
 * returned processes must be byte-identical to before (only the read is traced).
 *
 * Node-stamp: NOT applicable — `apply-processes` (aiGenerator.routes.ts) is a
 * SEPARATE client-driven POST route from this generate step (SSE), so
 * contextTraceId would need a client round-trip to reach node creation.
 * Follow-up, not implemented in this task.
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
import { generateProcessesForCapability } from '../services/processGenerator.service';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';
import { runCypher } from '../config/neo4j';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockRunCypher = runCypher as jest.MockedFunction<typeof runCypher>;

const CAPABILITY_PROPS = {
  id: 'cap-1',
  name: 'ESG Reporting',
  description: 'Capability description',
  layer: 'business',
  type: 'business_capability',
};

const GENERATED_PROCESSES = [
  { name: 'Collect ESG Data', description: 'Gathers Scope 1/2/3 emissions data from source systems.' },
  { name: 'Validate ESG Report', description: 'Reviews and validates the compiled ESG report before submission.' },
];

function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'BODY', score: 0.9, ...overrides };
}

describe('processGenerator.service → ContextTrace (THE-423 Task 9, process)', () => {
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

    mockRunCypher.mockImplementation(async (query: string) => {
      if (query.includes('RETURN e LIMIT 1')) {
        return [{ get: (k: string) => (k === 'e' ? { properties: CAPABILITY_PROPS } : undefined) }] as any;
      }
      return [] as any;
    });

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(GENERATED_PROCESSES) }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'law', text: 'CSRD Art.19a text', score: 0.82, metadata: { regulationKey: 'csrd:art-19a', versionHash: 'h2' } }),
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

  it('records a ContextTrace(feature:process, retrievalMethod:dense) from the RAG read', async () => {
    const result = await generateProcessesForCapability({
      projectId,
      capabilityId: 'cap-1',
      onEvent: () => {},
    });

    expect(result.processes).toHaveLength(2);
    expect(result.processes[0].name).toBe('Collect ESG Data');

    const traces = await ContextTrace.find({ feature: 'process', projectId });
    expect(traces).toHaveLength(1);
    expect(traces[0].consumed).toHaveLength(1);
    expect(traces[0].consumed[0]).toMatchObject({
      regulationKey: 'csrd:art-19a',
      versionHash: 'h2',
      score: 0.82,
      retrievalMethod: 'dense',
    });
  });

  it('does not change the generated processes whether tracing is on or off', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    const disabled = await generateProcessesForCapability({ projectId, capabilityId: 'cap-1', onEvent: () => {} });

    process.env.CONTEXT_TRACING_ENABLED = 'true';
    const enabled = await generateProcessesForCapability({ projectId, capabilityId: 'cap-1', onEvent: () => {} });

    expect(enabled.processes).toEqual(disabled.processes);
  });
});
