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
  mapRegulationsBatch,
  mapTextToElements,
  ComplianceMappingError,
  __testExports,
} from '../services/complianceMapping.service';
import type {
  CandidateElement,
  ComplianceMappingCandidate,
} from '../services/complianceMapping.service';

const {
  extractJson,
  parseAndFilter,
  runWithConcurrency,
  CONFIDENCE_THRESHOLD,
  MAX_MAPPINGS_PER_REGULATION,
  DEFAULT_BATCH_CONCURRENCY,
  BATCH_CONCURRENCY_MAX,
} = __testExports;

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

// ──────────────────────────────────────────────────────────
// D4 — Concurrency Helper + mapRegulationsBatch
// ──────────────────────────────────────────────────────────
describe('runWithConcurrency()', () => {
  it('respects concurrency limit (peak active never exceeds limit)', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let active = 0;
    let peakActive = 0;

    await runWithConcurrency(items, 5, async (i) => {
      active++;
      if (active > peakActive) peakActive = active;
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return i * 2;
    });

    expect(peakActive).toBeLessThanOrEqual(5);
    expect(peakActive).toBeGreaterThan(1); // proves it was parallel
  });

  it('preserves input order in results', async () => {
    const items = [10, 20, 30, 40, 50];
    const results = await runWithConcurrency(items, 3, async (n) => {
      // Add jitter so faster items finish first — order test relies on
      // index-based assignment, not completion-order
      await new Promise((r) => setTimeout(r, Math.random() * 10));
      return n * 100;
    });
    expect(results).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it('runs all items even with limit > items.length', async () => {
    const results = await runWithConcurrency([1, 2, 3], 99, async (n) => n + 1);
    expect(results).toEqual([2, 3, 4]);
  });

  it('handles empty input', async () => {
    const results = await runWithConcurrency([], 5, async () => 1);
    expect(results).toEqual([]);
  });

  it('parallelism shortens total time vs sequential', async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const start = Date.now();
    await runWithConcurrency(items, 5, async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const elapsed = Date.now() - start;
    // Sequential would be 300ms+; concurrency=5 should give ~60ms (2 batches)
    expect(elapsed).toBeLessThan(200);
  });
});

describe('mapRegulationsBatch()', () => {
  let mongoServer3: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer3 = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer3.getUri());
    await ComplianceMapping.ensureIndexes();
    await Regulation.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer3.stop();
  });

  afterEach(async () => {
    await ComplianceMapping.deleteMany({});
    await Regulation.deleteMany({});
  });

  function makeMockReg(source: string, paragraphNumber: string): IRegulation {
    return {
      _id: new mongoose.Types.ObjectId(),
      source,
      paragraphNumber,
      title: `${source} ${paragraphNumber}`,
      fullText:
        'Long enough fullText to pass the fifty-character validation requirement.',
      language: 'en',
      jurisdiction: 'EU',
      effectiveFrom: new Date(),
    } as unknown as IRegulation;
  }

  const SUCCESS_LLM_RESPONSE = JSON.stringify({
    mappings: [
      { elementId: 'cap-1', elementType: 'capability', confidence: 0.9, reasoning: 'r' },
    ],
  });

  it('empty regulations array → 0 mapped, fast return', async () => {
    const result = await mapRegulationsBatch({
      regulations: [],
      candidateElements: [{ id: 'cap-1', name: 'X', type: 'capability' }],
      projectId: new mongoose.Types.ObjectId().toString(),
    });
    expect(result.totalRegulations).toBe(0);
    expect(result.totalMapped).toBe(0);
  });

  it('empty candidates array → 0 mapped, fast return', async () => {
    const result = await mapRegulationsBatch({
      regulations: [makeMockReg('nis2', 'Art. 21')],
      candidateElements: [],
      projectId: new mongoose.Types.ObjectId().toString(),
    });
    expect(result.totalRegulations).toBe(1);
    expect(result.totalMapped).toBe(0);
  });

  it('maps 3 regulations concurrently, returns durationMs', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const candidates: CandidateElement[] = [
      { id: 'cap-1', name: 'X', type: 'capability' },
    ];
    const regs = [
      makeMockReg('nis2', 'Art. 1'),
      makeMockReg('nis2', 'Art. 2'),
      makeMockReg('nis2', 'Art. 3'),
    ];

    const result = await mapRegulationsBatch({
      regulations: regs,
      candidateElements: candidates,
      projectId,
      anthropicClient: makeMockAnthropic(SUCCESS_LLM_RESPONSE),
    });

    expect(result.totalRegulations).toBe(3);
    expect(result.totalMapped).toBe(3);
    expect(result.errors).toEqual([]);
    expect(typeof result.durationMs).toBe('number');
  });

  it('per-regulation error does NOT abort the batch', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const candidates: CandidateElement[] = [
      { id: 'cap-1', name: 'X', type: 'capability' },
    ];
    // Anthropic mock: first 2 OK, 3rd fails
    let call = 0;
    const flakyClient = {
      messages: {
        create: jest.fn().mockImplementation(async () => {
          call++;
          if (call === 3) throw new Error('429 rate limited');
          return {
            content: [{ type: 'text', text: SUCCESS_LLM_RESPONSE }],
          };
        }),
      },
    } as any;

    const result = await mapRegulationsBatch({
      regulations: [
        makeMockReg('nis2', 'Art. 1'),
        makeMockReg('nis2', 'Art. 2'),
        makeMockReg('nis2', 'Art. 3'),
      ],
      candidateElements: candidates,
      projectId,
      concurrency: 1, // serialize so call counter is deterministic
      anthropicClient: flakyClient,
    });

    expect(result.totalRegulations).toBe(3);
    expect(result.totalMapped).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/429/);
  });

  it('clamps concurrency to [1, MAX]', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const candidates: CandidateElement[] = [
      { id: 'cap-1', name: 'X', type: 'capability' },
    ];
    // concurrency=0 should still work (clamped up to 1)
    const r1 = await mapRegulationsBatch({
      regulations: [makeMockReg('nis2', 'Art. 1')],
      candidateElements: candidates,
      projectId,
      concurrency: 0,
      anthropicClient: makeMockAnthropic(SUCCESS_LLM_RESPONSE),
    });
    expect(r1.totalMapped).toBe(1);

    // concurrency=999 should still work (clamped down to BATCH_CONCURRENCY_MAX)
    const r2 = await mapRegulationsBatch({
      regulations: [makeMockReg('nis2', 'Art. 2')],
      candidateElements: candidates,
      projectId,
      concurrency: 999,
      anthropicClient: makeMockAnthropic(SUCCESS_LLM_RESPONSE),
    });
    expect(r2.totalMapped).toBe(1);
  });

  it('exports DEFAULT_BATCH_CONCURRENCY=5 and BATCH_CONCURRENCY_MAX=10', () => {
    expect(DEFAULT_BATCH_CONCURRENCY).toBe(5);
    expect(BATCH_CONCURRENCY_MAX).toBe(10);
  });

  it('parallel mode is measurably faster than serial for slow LLM calls', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const candidates: CandidateElement[] = [
      { id: 'cap-1', name: 'X', type: 'capability' },
    ];
    const slowClient = {
      messages: {
        create: jest.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return { content: [{ type: 'text', text: SUCCESS_LLM_RESPONSE }] };
        }),
      },
    } as any;

    const regs = Array.from({ length: 10 }, (_, i) => makeMockReg('nis2', `Art. ${i}`));

    const serial = await mapRegulationsBatch({
      regulations: regs,
      candidateElements: candidates,
      projectId,
      concurrency: 1,
      anthropicClient: slowClient,
    });

    await ComplianceMapping.deleteMany({});

    const parallel = await mapRegulationsBatch({
      regulations: regs,
      candidateElements: candidates,
      projectId,
      concurrency: 5,
      anthropicClient: slowClient,
    });

    // Parallel should be at LEAST 2× faster (10×50ms serial = 500ms, parallel 2 batches × 50ms = 100ms)
    expect(parallel.durationMs).toBeLessThan(serial.durationMs / 2);
  });
});
