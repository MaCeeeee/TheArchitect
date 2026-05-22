/**
 * Compliance Mapping Service Tests — REQ-ICM-002.2 / THE-279
 *
 * Tests the LLM-driven mapping pipeline:
 *   - parseAndFilter (Zod-validation, confidence threshold, top-5 cap)
 *   - extractJson (markdown-fence tolerance, JSON-extraction)
 *   - mapRegulationToElements (with mocked Anthropic + real mongodb-memory-server)
 *   - Hallucinated-elementId filter (post-LLM validation)
 *   - mapTextToElements (Live-Mapping flow without persist)
 *
 * Live Anthropic API NOT exercised in CI.
 *
 * Run: cd packages/server && npx jest src/__tests__/complianceMapping.service.test.ts --verbose
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { Regulation, IRegulation } from '../models/Regulation';
import {
  mapRegulationToElements,
  mapTextToElements,
  ComplianceMappingError,
  __testExports,
  type CandidateElement,
  type ComplianceMappingCandidate,
} from '../services/complianceMapping.service';

const { extractJson, parseAndFilter, CONFIDENCE_THRESHOLD, MAX_MAPPINGS_PER_REGULATION } =
  __testExports;

// ─── Mock Anthropic SDK ──────────────────────────────────────────

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

function makeFailingAnthropic(error: Error) {
  return {
    messages: {
      create: jest.fn().mockRejectedValue(error),
    },
  } as any;
}

// ─── parseAndFilter / extractJson ────────────────────────────────

describe('extractJson()', () => {
  it('extracts JSON from raw text', () => {
    const out = extractJson('{"mappings":[]}');
    expect(out).toBe('{"mappings":[]}');
  });

  it('extracts JSON from markdown fences (```json)', () => {
    const out = extractJson('Some preamble\n```json\n{"mappings":[]}\n```\nepilogue');
    expect(out).toBe('{"mappings":[]}');
  });

  it('extracts JSON from markdown fences without lang tag', () => {
    const out = extractJson('```\n{"mappings":[]}\n```');
    expect(out).toBe('{"mappings":[]}');
  });

  it('strips surrounding prose by finding first { and last }', () => {
    const out = extractJson('Here is my answer: {"mappings":[]} done.');
    expect(out).toBe('{"mappings":[]}');
  });
});

describe('parseAndFilter()', () => {
  it('parses valid JSON + applies confidence threshold', () => {
    const raw = JSON.stringify({
      mappings: [
        { elementId: 'a', elementType: 'capability', confidence: 0.9, reasoning: 'high' },
        { elementId: 'b', elementType: 'capability', confidence: 0.3, reasoning: 'low' },
        { elementId: 'c', elementType: 'capability', confidence: 0.7, reasoning: 'med' },
      ],
    });
    const result = parseAndFilter(raw);
    expect(result).toHaveLength(2);
    expect(result.map(m => m.elementId)).toEqual(['a', 'c']);
  });

  it('caps at MAX_MAPPINGS_PER_REGULATION (5), sorted by confidence desc', () => {
    const raw = JSON.stringify({
      mappings: Array.from({ length: 8 }, (_, i) => ({
        elementId: `e-${i}`,
        elementType: 'capability',
        confidence: 0.6 + i * 0.05,
        reasoning: `r${i}`,
      })),
    });
    const result = parseAndFilter(raw);
    expect(result).toHaveLength(MAX_MAPPINGS_PER_REGULATION);
    // Must be sorted desc — highest confidence first
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].confidence).toBeGreaterThanOrEqual(result[i + 1].confidence);
    }
  });

  it('returns empty array when all confidences below threshold', () => {
    const raw = JSON.stringify({
      mappings: [
        { elementId: 'a', elementType: 'capability', confidence: 0.2, reasoning: 'r' },
        { elementId: 'b', elementType: 'capability', confidence: 0.4, reasoning: 'r' },
      ],
    });
    expect(parseAndFilter(raw)).toEqual([]);
  });

  it('throws ComplianceMappingError on invalid schema (missing elementId)', () => {
    const raw = JSON.stringify({
      mappings: [{ confidence: 0.9, reasoning: 'no id', elementType: 'capability' }],
    });
    expect(() => parseAndFilter(raw)).toThrow(ComplianceMappingError);
  });

  it('throws ComplianceMappingError on invalid elementType', () => {
    const raw = JSON.stringify({
      mappings: [
        { elementId: 'a', elementType: 'wat', confidence: 0.9, reasoning: 'r' },
      ],
    });
    expect(() => parseAndFilter(raw)).toThrow(ComplianceMappingError);
  });

  it('throws ComplianceMappingError on confidence > 1', () => {
    const raw = JSON.stringify({
      mappings: [{ elementId: 'a', elementType: 'capability', confidence: 1.5, reasoning: 'r' }],
    });
    expect(() => parseAndFilter(raw)).toThrow(ComplianceMappingError);
  });

  it('throws ComplianceMappingError on reasoning > 500 chars', () => {
    const raw = JSON.stringify({
      mappings: [
        {
          elementId: 'a',
          elementType: 'capability',
          confidence: 0.8,
          reasoning: 'X'.repeat(501),
        },
      ],
    });
    expect(() => parseAndFilter(raw)).toThrow(ComplianceMappingError);
  });

  it('throws ComplianceMappingError on totally non-JSON text', () => {
    expect(() => parseAndFilter('this is not JSON at all')).toThrow(ComplianceMappingError);
  });

  it('accepts empty mappings list (no relevant elements)', () => {
    expect(parseAndFilter('{"mappings":[]}')).toEqual([]);
  });
});

// ─── mapRegulationToElements / mapTextToElements ────────────────

describe('mapRegulationToElements() + mapTextToElements() with mocked Anthropic', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ComplianceMapping.ensureIndexes();
    await Regulation.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await ComplianceMapping.deleteMany({});
    await Regulation.deleteMany({});
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

  const candidates: CandidateElement[] = [
    { id: 'cap-supplier-mgmt', name: 'Supplier Management', type: 'capability', description: 'Manages 3rd-party suppliers' },
    { id: 'cap-cyber-defense', name: 'Cyber Defense', type: 'capability', description: 'IT security operations' },
    { id: 'app-sap-erp', name: 'SAP ERP', type: 'application', description: 'Core business processes' },
  ];

  it('persists ≤5 mappings via upsert + filters confidence threshold', async () => {
    const reg = await seedRegulation();
    const mockClient = makeMockAnthropic(
      JSON.stringify({
        mappings: [
          { elementId: 'cap-cyber-defense', elementType: 'capability', confidence: 0.92, reasoning: 'Direct cybersecurity scope' },
          { elementId: 'cap-supplier-mgmt', elementType: 'capability', confidence: 0.7, reasoning: 'Supply chain risk' },
          { elementId: 'app-sap-erp', elementType: 'application', confidence: 0.3, reasoning: 'too generic' },
        ],
      })
    );

    const result = await mapRegulationToElements({
      regulation: reg,
      candidateElements: candidates,
      projectId: reg.projectId.toString(),
      anthropicClient: mockClient,
    });

    // 2 persisted (cap-cyber-defense + cap-supplier-mgmt), app-sap-erp filtered (< 0.5)
    expect(result).toHaveLength(2);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);

    const inMongo = await ComplianceMapping.find({ regulationId: reg._id });
    expect(inMongo).toHaveLength(2);
    expect(inMongo.find(m => m.elementId === 'cap-cyber-defense')?.confidence).toBe(0.92);
  });

  it('AC-3 idempotency: re-run with different confidence updates instead of duplicating', async () => {
    const reg = await seedRegulation();

    // First run: confidence 0.7
    await mapRegulationToElements({
      regulation: reg,
      candidateElements: candidates,
      projectId: reg.projectId.toString(),
      anthropicClient: makeMockAnthropic(
        JSON.stringify({
          mappings: [
            { elementId: 'cap-cyber-defense', elementType: 'capability', confidence: 0.7, reasoning: 'first' },
          ],
        })
      ),
    });

    // Second run: confidence 0.95 (LLM is more sure this time)
    await mapRegulationToElements({
      regulation: reg,
      candidateElements: candidates,
      projectId: reg.projectId.toString(),
      anthropicClient: makeMockAnthropic(
        JSON.stringify({
          mappings: [
            { elementId: 'cap-cyber-defense', elementType: 'capability', confidence: 0.95, reasoning: 'updated reasoning' },
          ],
        })
      ),
    });

    const all = await ComplianceMapping.find({ regulationId: reg._id });
    expect(all).toHaveLength(1); // one mapping, not two
    expect(all[0].confidence).toBe(0.95);
    expect(all[0].reasoning).toBe('updated reasoning');
  });

  it('drops hallucinated elementIds not in candidate list', async () => {
    const reg = await seedRegulation();
    const mockClient = makeMockAnthropic(
      JSON.stringify({
        mappings: [
          { elementId: 'cap-cyber-defense', elementType: 'capability', confidence: 0.9, reasoning: 'valid' },
          { elementId: 'hallucinated-id-xyz', elementType: 'capability', confidence: 0.85, reasoning: 'invented' },
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
    expect(result[0].elementId).toBe('cap-cyber-defense');
  });

  it('returns empty array when no candidate elements', async () => {
    const reg = await seedRegulation();
    const mockClient = makeMockAnthropic('{"mappings":[]}');

    const result = await mapRegulationToElements({
      regulation: reg,
      candidateElements: [],
      projectId: reg.projectId.toString(),
      anthropicClient: mockClient,
    });

    expect(result).toEqual([]);
    // LLM NOT called because we short-circuit
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });

  it('throws ComplianceMappingError on Anthropic failure', async () => {
    const reg = await seedRegulation();
    const mockClient = makeFailingAnthropic(new Error('429 rate limit'));

    await expect(
      mapRegulationToElements({
        regulation: reg,
        candidateElements: candidates,
        projectId: reg.projectId.toString(),
        anthropicClient: mockClient,
      })
    ).rejects.toThrow(ComplianceMappingError);
  });

  it('mapTextToElements: returns candidates without persisting (Live-Mapping)', async () => {
    const mockClient = makeMockAnthropic(
      JSON.stringify({
        mappings: [
          { elementId: 'cap-cyber-defense', elementType: 'capability', confidence: 0.85, reasoning: 'matches' },
        ],
      })
    );

    const result = await mapTextToElements({
      text: 'Member States shall ensure that essential entities take measures...',
      source: 'nis2',
      paragraphNumber: 'Art. 21',
      language: 'en',
      jurisdiction: 'EU',
      candidateElements: candidates,
      anthropicClient: mockClient,
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].elementId).toBe('cap-cyber-defense');

    // NOT persisted
    const inMongo = await ComplianceMapping.countDocuments({});
    expect(inMongo).toBe(0);
  });

  it('mapTextToElements: returns empty when no candidates', async () => {
    const mockClient = makeMockAnthropic('{"mappings":[]}');
    const result = await mapTextToElements({
      text: 'any text',
      source: 'custom',
      paragraphNumber: 'unknown',
      language: 'en',
      jurisdiction: 'EU',
      candidateElements: [],
      anthropicClient: mockClient,
    });
    expect(result.candidates).toEqual([]);
    expect(mockClient.messages.create).not.toHaveBeenCalled();
  });
});

// ─── Prompt-Format Sanity (no LLM) ──────────────────────────────

describe('Prompt-Format sanity', () => {
  it('Anthropic mock receives correct system + user message structure', async () => {
    const mongoServer2 = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer2.getUri());
    await ComplianceMapping.ensureIndexes();
    await Regulation.ensureIndexes();

    try {
      const reg = await Regulation.create({
        projectId: new mongoose.Types.ObjectId(),
        source: 'lksg',
        jurisdiction: 'DE',
        paragraphNumber: '§ 6',
        title: 'Präventionsmaßnahmen',
        fullText:
          '(1) Stellt ein Unternehmen im Rahmen einer Risikoanalyse nach § 5 ein Risiko fest...',
        sourceUrl: 'https://gesetze-im-internet.de',
        effectiveFrom: new Date('2023-01-01'),
        language: 'de',
      });

      const mockClient = makeMockAnthropic('{"mappings":[]}');
      await mapRegulationToElements({
        regulation: reg,
        candidateElements: [
          { id: 'cap-1', name: 'Test Capability', type: 'capability' },
        ],
        projectId: reg.projectId.toString(),
        anthropicClient: mockClient,
      });

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.system).toContain('Compliance Architect AI');
      expect(callArgs.system).toContain('elementId');
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content).toContain('§ 6');
      expect(callArgs.messages[0].content).toContain('Präventionsmaßnahmen');
      expect(callArgs.messages[0].content).toContain('cap-1');
      expect(callArgs.messages[0].content).toContain('German (Deutsch)');
      expect(callArgs.max_tokens).toBe(2048);
    } finally {
      await mongoose.disconnect();
      await mongoServer2.stop();
    }
  });
});
