/**
 * dataObjectGenerator.service → ContextTrace (THE-423 Task 9, Step 4: dataobject).
 *
 * `generateDataObjectsForProcess`'s RAG-query helper (`queryRagSafe`) currently
 * calls `governedQuery` directly. This suite pins the swap to
 * `tracedGovernedQuery(feature:'dataobject')`: a ContextTrace(feature:'dataobject',
 * retrievalMethod:'dense') must be written from the read, and the generator's
 * returned data-objects must be byte-identical to before (only the read is traced).
 *
 * Node-stamp: NOT applicable — `apply-data-objects` / `apply-data-object-decisions`
 * (aiGenerator.routes.ts) are SEPARATE client-driven POST routes from this
 * generate step (SSE), so contextTraceId would need a client round-trip to
 * reach node creation. Follow-up, not implemented in this task.
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
import { generateDataObjectsForProcess } from '../services/dataObjectGenerator.service';
import { __setCorpusForTests } from '../services/corpusClient.service';
import { queryDocuments, type QueryChunk } from '../services/dataServer.service';
import { runCypher } from '../config/neo4j';
import { makeFakeCorpus } from './helpers/fakeCorpus';

const mockQuery = queryDocuments as jest.MockedFunction<typeof queryDocuments>;
const mockRunCypher = runCypher as jest.MockedFunction<typeof runCypher>;

const PROCESS_PROPS = {
  id: 'proc-1',
  name: 'ESG Reporting Process',
  description: 'Process description',
  layer: 'business',
  type: 'business_process',
};

const GENERATED_DATA_OBJECTS = [
  { name: 'Emissions-Record', description: 'Monthly Scope 1/2/3 GHG measurements', dataClass: 'transactional', sensitivity: 'internal', crudOperations: 'CRU', archimateType: 'data_object' },
  { name: 'Audit-Log', description: 'Compliance audit trail', dataClass: 'log', sensitivity: 'confidential', crudOperations: 'C', archimateType: 'data_object' },
];

function chunk(overrides: Partial<QueryChunk> & { metadata: Record<string, unknown> }): QueryChunk {
  return { documentId: 'd', chunkId: 'c', text: 'BODY', score: 0.9, ...overrides };
}

describe('dataObjectGenerator.service → ContextTrace (THE-423 Task 9, dataobject)', () => {
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
        return [{ get: (k: string) => (k === 'e' ? { properties: PROCESS_PROPS } : undefined) }] as any;
      }
      return [] as any;
    });

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(GENERATED_DATA_OBJECTS) }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    mockQuery.mockResolvedValue({
      chunks: [
        chunk({ chunkId: 'law', text: 'GDPR Art.30 text', score: 0.79, metadata: { regulationKey: 'gdpr:art-30', versionHash: 'h2' } }),
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

  it('records a ContextTrace(feature:dataobject, retrievalMethod:dense) from the RAG read', async () => {
    const result = await generateDataObjectsForProcess({
      projectId,
      processId: 'proc-1',
      onEvent: () => {},
    });

    expect(result.dataObjects).toHaveLength(2);
    expect(result.dataObjects[0].name).toBe('Emissions-Record');

    const traces = await ContextTrace.find({ feature: 'dataobject', projectId });
    expect(traces).toHaveLength(1);
    expect(traces[0].consumed).toHaveLength(1);
    expect(traces[0].consumed[0]).toMatchObject({
      regulationKey: 'gdpr:art-30',
      versionHash: 'h2',
      score: 0.79,
      retrievalMethod: 'dense',
    });
  });

  it('does not change the generated data-objects whether tracing is on or off', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    const disabled = await generateDataObjectsForProcess({ projectId, processId: 'proc-1', onEvent: () => {} });

    process.env.CONTEXT_TRACING_ENABLED = 'true';
    const enabled = await generateDataObjectsForProcess({ projectId, processId: 'proc-1', onEvent: () => {} });

    expect(enabled.dataObjects).toEqual(disabled.dataObjects);
  });
});
