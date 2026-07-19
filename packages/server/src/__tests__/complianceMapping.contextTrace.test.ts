/**
 * mapRegulationToElements → ContextTrace wiring — THE-423 Task 6.
 *
 * Mirrors the mocked-Anthropic + mongodb-memory-server harness of
 * complianceMapping.service.test.ts (real Mongo, no mocking of the
 * mapping/tracing internals) — but additionally enables CONTEXT_TRACING_ENABLED
 * so both `AiTrace` and `ContextTrace` docs actually persist, and asserts the
 * AC-6 join: `ContextTrace.llmTraceRef === AiTrace.requestId` for the same run,
 * and the persisted `ComplianceMapping` carries that same `contextTraceId`.
 *
 * Run: cd packages/server && npx jest src/__tests__/complianceMapping.contextTrace.test.ts --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { Regulation, IRegulation } from '../models/Regulation';
import { AiTrace } from '../models/AiTrace';
import { ContextTrace } from '../models/ContextTrace';
import { mapRegulationToElements } from '../services/complianceMapping.service';
import type { CandidateElement } from '../services/complianceMapping.service';

function makeMockAnthropic(responseText: string) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    },
  } as any;
}

const candidates: CandidateElement[] = [
  { id: 'cap-cyber-defense', name: 'Cyber Defense', type: 'capability', description: 'IT security operations' },
];

describe('mapRegulationToElements() → ContextTrace (THE-423 Task 6, AC-6 join)', () => {
  let mongoServer: MongoMemoryServer;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ComplianceMapping.ensureIndexes();
    await Regulation.ensureIndexes();
    await AiTrace.ensureIndexes();
    await ContextTrace.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.env = originalEnv;
  });

  beforeEach(() => {
    process.env = { ...originalEnv, CONTEXT_TRACING_ENABLED: 'true' };
  });

  afterEach(async () => {
    await ComplianceMapping.deleteMany({});
    await Regulation.deleteMany({});
    await AiTrace.deleteMany({});
    await ContextTrace.deleteMany({});
  });

  async function seedRegulation(): Promise<IRegulation> {
    return Regulation.create({
      projectId: new mongoose.Types.ObjectId(),
      source: 'nis2',
      jurisdiction: 'EU',
      paragraphNumber: 'Art. 21',
      title: 'Cybersecurity risk-management measures',
      fullText:
        'Member States shall ensure that essential and important entities take appropriate ' +
        'and proportionate technical, operational and organisational measures to manage the ' +
        'risks posed to the security of network and information systems.',
      sourceUrl: 'https://example.org',
      effectiveFrom: new Date('2024-10-17'),
      language: 'en',
    });
  }

  it('stamps contextTraceId on the persisted mapping AND joins to the run AiTrace via llmTraceRef', async () => {
    const reg = await seedRegulation();
    const mockClient = makeMockAnthropic(
      JSON.stringify({
        mappings: [
          { elementId: 'cap-cyber-defense', elementType: 'capability', confidence: 0.9, reasoning: 'Direct cybersecurity scope' },
        ],
      })
    );

    const result = await mapRegulationToElements({
      regulation: reg,
      candidateElements: candidates,
      projectId: reg.projectId.toString(),
      anthropicClient: mockClient,
    });

    expect(result).toHaveLength(1);
    expect(result[0].contextTraceId).toBeDefined();

    const persisted = await ComplianceMapping.findOne({ regulationId: reg._id });
    expect(persisted).not.toBeNull();
    expect(persisted!.contextTraceId).toBe(result[0].contextTraceId);

    // Exactly one AiTrace for this run (op 'mapping').
    const aiTraces = await AiTrace.find({ operation: 'mapping', regulationId: reg._id });
    expect(aiTraces).toHaveLength(1);

    // Exactly one ContextTrace for this run (feature 'mapping').
    const contextTraces = await ContextTrace.find({ feature: 'mapping', projectId: reg.projectId });
    expect(contextTraces).toHaveLength(1);

    // AC-6 join: ContextTrace.llmTraceRef === AiTrace.requestId of the SAME run.
    expect(contextTraces[0].llmTraceRef).toBe(aiTraces[0].requestId);
    // And the persisted mapping's contextTraceId points at that same ContextTrace.
    expect(persisted!.contextTraceId).toBe(contextTraces[0].requestId);

    // No redundant corpus round-trip: the trace is built directly from the
    // regulation already in scope (retrievalMethod 'direct'), not from a
    // second governed-retrieval read.
    expect(contextTraces[0].consumed).toHaveLength(1);
    expect(contextTraces[0].consumed[0]).toMatchObject({
      regulationKey: aiTraces[0].regulationKey,
      versionHash: aiTraces[0].regulationVersionHash,
      retrievalMethod: 'direct',
    });
  });

  it('still maps successfully when context-tracing is disabled (additive, no regression)', async () => {
    process.env = { ...originalEnv, CONTEXT_TRACING_ENABLED: 'false' };
    const reg = await seedRegulation();
    const mockClient = makeMockAnthropic(
      JSON.stringify({
        mappings: [
          { elementId: 'cap-cyber-defense', elementType: 'capability', confidence: 0.9, reasoning: 'r' },
        ],
      })
    );

    const result = await mapRegulationToElements({
      regulation: reg,
      candidateElements: candidates,
      projectId: reg.projectId.toString(),
      anthropicClient: mockClient,
    });

    expect(result).toHaveLength(1);
    // recordContextTrace still returns a generated id even when tracing is off,
    // so the field is present on the doc, but no ContextTrace doc was written.
    expect(result[0].contextTraceId).toBeDefined();
    const contextTraces = await ContextTrace.find({ feature: 'mapping', projectId: reg.projectId });
    expect(contextTraces).toHaveLength(0);
  });
});
