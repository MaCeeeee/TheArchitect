/**
 * requirementGenerator Service Tests — REQ-REQGEN-001.2 / THE-303
 *
 * Mocked Anthropic — Live API NOT exercised in CI.
 *
 * Run: cd packages/server && npx jest src/__tests__/requirementGenerator.service.test.ts --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import {
  generateRequirementsFromText,
  RequirementGeneratorError,
  __testExports,
} from '../services/requirementGenerator.service';
import type { CandidateElement } from '../services/requirementGenerator.service';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Touch = CandidateElement;

const { extractJson, parseAndFilter, priorityRank, CONFIDENCE_THRESHOLD, MAX_REQUIREMENTS_PER_PARAGRAPH } = __testExports;

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
  it('extracts raw JSON', () => {
    expect(extractJson('{"requirements":[]}')).toBe('{"requirements":[]}');
  });

  it('extracts from ```json fences', () => {
    expect(extractJson('```json\n{"requirements":[]}\n```')).toBe('{"requirements":[]}');
  });

  it('extracts from prose surroundings', () => {
    expect(extractJson('Here: {"requirements":[]} done.')).toBe('{"requirements":[]}');
  });
});

describe('parseAndFilter()', () => {
  it('parses valid JSON + applies confidence threshold', () => {
    const raw = JSON.stringify({
      requirements: [
        { title: 'Risikoanalyse jährlich durchführen', description: 'Min ein Mal pro Jahr', priority: 'must', linkedElementIds: ['e1'], confidence: 0.95 },
        { title: 'Niedrige Confidence rauswerfen', description: 'sollte raus', priority: 'should', linkedElementIds: [], confidence: 0.3 },
      ],
    });
    const result = parseAndFilter(raw);
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
  });

  it('sorts by priority (must > should > may), then confidence DESC', () => {
    const raw = JSON.stringify({
      requirements: [
        { title: 'May-Item geringer prio', description: 'concrete description text here', priority: 'may', linkedElementIds: [], confidence: 0.99 },
        { title: 'Must-Item hoher Prio', description: 'concrete description text here', priority: 'must', linkedElementIds: [], confidence: 0.6 },
        { title: 'Should-Item mittlerer Prio', description: 'concrete description text here', priority: 'should', linkedElementIds: [], confidence: 0.95 },
      ],
    });
    const result = parseAndFilter(raw);
    expect(result.map(r => r.priority)).toEqual(['must', 'should', 'may']);
  });

  it('caps at MAX_REQUIREMENTS_PER_PARAGRAPH', () => {
    const requirements = Array.from({ length: 15 }, (_, i) => ({
      title: `Requirement Number ${i}`,
      description: 'concrete description text here',
      priority: 'must' as const,
      linkedElementIds: [],
      confidence: 0.9,
    }));
    const raw = JSON.stringify({ requirements });
    const result = parseAndFilter(raw);
    expect(result).toHaveLength(MAX_REQUIREMENTS_PER_PARAGRAPH);
  });

  it('throws on missing title', () => {
    const raw = JSON.stringify({
      requirements: [{ description: 'concrete description text here', priority: 'must', linkedElementIds: [], confidence: 0.9 }],
    });
    expect(() => parseAndFilter(raw)).toThrow(RequirementGeneratorError);
  });

  it('throws on unknown priority', () => {
    const raw = JSON.stringify({
      requirements: [{ title: 'Valid Title Here', description: 'concrete description text here', priority: 'critical', linkedElementIds: [], confidence: 0.9 }],
    });
    expect(() => parseAndFilter(raw)).toThrow(RequirementGeneratorError);
  });

  it('throws on confidence > 1', () => {
    const raw = JSON.stringify({
      requirements: [{ title: 'Valid Title Here', description: 'concrete description text here', priority: 'must', linkedElementIds: [], confidence: 1.5 }],
    });
    expect(() => parseAndFilter(raw)).toThrow(RequirementGeneratorError);
  });

  it('throws on description > 2000 chars', () => {
    const raw = JSON.stringify({
      requirements: [{ title: 'Valid', description: 'X'.repeat(2001), priority: 'must', linkedElementIds: [], confidence: 0.9 }],
    });
    expect(() => parseAndFilter(raw)).toThrow(RequirementGeneratorError);
  });

  it('throws on totally non-JSON', () => {
    expect(() => parseAndFilter('lorem ipsum')).toThrow(RequirementGeneratorError);
  });

  it('accepts empty requirements (no actionable items)', () => {
    const raw = JSON.stringify({ requirements: [] });
    expect(parseAndFilter(raw)).toEqual([]);
  });

  it('defaults linkedElementIds to []', () => {
    const raw = JSON.stringify({
      requirements: [{ title: 'Without explicit linkedElementIds', description: 'concrete description text here', priority: 'must', confidence: 0.9 }],
    });
    const r = parseAndFilter(raw);
    expect(r[0].linkedElementIds).toEqual([]);
  });
});

describe('priorityRank()', () => {
  it('orders must < should < may', () => {
    expect(priorityRank('must')).toBeLessThan(priorityRank('should'));
    expect(priorityRank('should')).toBeLessThan(priorityRank('may'));
  });
});

// ─── generateRequirementsFromText with mocked Anthropic ─────────

describe('generateRequirementsFromText()', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ComplianceRequirement.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await ComplianceRequirement.deleteMany({});
  });

  const VALID_LLM_RESPONSE = JSON.stringify({
    requirements: [
      {
        title: 'Risikoanalyse jährlich durchführen',
        description: 'Das Unternehmen MUSS einmal jährlich eine Risikoanalyse für direkte Zulieferer durchführen und dokumentieren.',
        priority: 'must',
        linkedElementIds: ['cap-lieferantenmanagement'],
        confidence: 0.95,
      },
      {
        title: 'Präventionsmaßnahmen verankern',
        description: 'Bei identifizierten Risiken MÜSSEN angemessene Präventionsmaßnahmen gegenüber unmittelbaren Zulieferern in vertraglichen Vereinbarungen verankert werden.',
        priority: 'must',
        linkedElementIds: ['cap-lieferantenmanagement', 'app-sap-erp'],
        confidence: 0.92,
      },
    ],
  });

  const BSH_CANDIDATES: CandidateElement[] = [
    { id: 'cap-lieferantenmanagement', name: 'Lieferantenmanagement', type: 'capability', layer: 'business' },
    { id: 'app-sap-erp', name: 'ERP-System SAP', type: 'application', layer: 'application' },
  ];

  it('preview mode: returns candidates, no persist', async () => {
    const result = await generateRequirementsFromText({
      text: 'a'.repeat(50),
      source: 'lksg',
      paragraphNumber: '§ 6',
      language: 'de',
      jurisdiction: 'DE',
      candidateElements: BSH_CANDIDATES,
      anthropicClient: makeMockAnthropic(VALID_LLM_RESPONSE),
    });
    expect(result.candidates).toHaveLength(2);
    expect(result.persisted).toBeUndefined();
    expect(await ComplianceRequirement.countDocuments({})).toBe(0);
  });

  it('persist mode: writes to DB + returns persisted docs', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const regulationId = new mongoose.Types.ObjectId().toString();
    const result = await generateRequirementsFromText({
      text: 'a'.repeat(50),
      source: 'lksg',
      paragraphNumber: '§ 6',
      language: 'de',
      jurisdiction: 'DE',
      candidateElements: BSH_CANDIDATES,
      anthropicClient: makeMockAnthropic(VALID_LLM_RESPONSE),
      persist: true,
      projectId,
      regulationId,
    });
    expect(result.persisted).toHaveLength(2);
    const count = await ComplianceRequirement.countDocuments({});
    expect(count).toBe(2);
    const r1 = await ComplianceRequirement.findOne({ title: 'Risikoanalyse jährlich durchführen' });
    expect(r1?.priority).toBe('must');
    expect(r1?.confidence).toBe(0.95);
    expect(r1?.status).toBe('open');
    expect(r1?.createdBy).toBe('llm');
  });

  it('idempotency: re-run with same title → upsert (no duplicates)', async () => {
    const projectId = new mongoose.Types.ObjectId().toString();
    const regulationId = new mongoose.Types.ObjectId().toString();
    await generateRequirementsFromText({
      text: 'a'.repeat(50),
      source: 'lksg',
      paragraphNumber: '§ 6',
      language: 'de',
      jurisdiction: 'DE',
      candidateElements: BSH_CANDIDATES,
      anthropicClient: makeMockAnthropic(VALID_LLM_RESPONSE),
      persist: true,
      projectId,
      regulationId,
    });
    await generateRequirementsFromText({
      text: 'a'.repeat(50),
      source: 'lksg',
      paragraphNumber: '§ 6',
      language: 'de',
      jurisdiction: 'DE',
      candidateElements: BSH_CANDIDATES,
      anthropicClient: makeMockAnthropic(VALID_LLM_RESPONSE),
      persist: true,
      projectId,
      regulationId,
    });
    expect(await ComplianceRequirement.countDocuments({})).toBe(2);
  });

  it('hallucination filter: drops linkedElementIds not in candidate list', async () => {
    const responseWithHallucination = JSON.stringify({
      requirements: [
        {
          title: 'Valid Requirement Title',
          description: 'concrete description text here',
          priority: 'must',
          linkedElementIds: ['cap-lieferantenmanagement', 'evil-hallucinated-id'],
          confidence: 0.9,
        },
      ],
    });
    const result = await generateRequirementsFromText({
      text: 'a'.repeat(50),
      source: 'lksg',
      paragraphNumber: '§ 6',
      language: 'de',
      jurisdiction: 'DE',
      candidateElements: BSH_CANDIDATES,
      anthropicClient: makeMockAnthropic(responseWithHallucination),
    });
    expect(result.candidates[0].linkedElementIds).toEqual(['cap-lieferantenmanagement']);
  });

  it('throws on text < 20 chars', async () => {
    await expect(
      generateRequirementsFromText({
        text: 'short',
        source: 'lksg',
        paragraphNumber: '§ 6',
        language: 'de',
        jurisdiction: 'DE',
        anthropicClient: makeMockAnthropic(VALID_LLM_RESPONSE),
      }),
    ).rejects.toThrow(RequirementGeneratorError);
  });

  it('throws on Anthropic failure', async () => {
    await expect(
      generateRequirementsFromText({
        text: 'a'.repeat(50),
        source: 'lksg',
        paragraphNumber: '§ 6',
        language: 'de',
        jurisdiction: 'DE',
        anthropicClient: makeFailingAnthropic(new Error('429 rate limited')),
      }),
    ).rejects.toThrow(RequirementGeneratorError);
  });

  it('persist mode requires projectId + regulationId', async () => {
    await expect(
      generateRequirementsFromText({
        text: 'a'.repeat(50),
        source: 'lksg',
        paragraphNumber: '§ 6',
        language: 'de',
        jurisdiction: 'DE',
        persist: true,
        anthropicClient: makeMockAnthropic(VALID_LLM_RESPONSE),
      }),
    ).rejects.toThrow(/persist=true requires/);
  });

  it('no candidate-elements: linkedElementIds preserved as-is from LLM', async () => {
    const responseAlpha = JSON.stringify({
      requirements: [
        {
          title: 'Without Candidate Context',
          description: 'concrete description text here',
          priority: 'must',
          linkedElementIds: ['any-id-from-llm'],
          confidence: 0.9,
        },
      ],
    });
    const result = await generateRequirementsFromText({
      text: 'a'.repeat(50),
      source: 'lksg',
      paragraphNumber: '§ 6',
      language: 'de',
      jurisdiction: 'DE',
      // no candidateElements
      anthropicClient: makeMockAnthropic(responseAlpha),
    });
    expect(result.candidates[0].linkedElementIds).toEqual(['any-id-from-llm']);
  });
});

// ─── Prompt sanity ──────────────────────────────────────────────

describe('Prompt-Format sanity', () => {
  it('Mock receives correct system + user message structure', async () => {
    const mockCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ requirements: [] }) }],
    });
    const client = { messages: { create: mockCreate } } as any;

    await generateRequirementsFromText({
      text: 'Stellt das Unternehmen ein Risiko fest, hat es Präventionsmaßnahmen zu verankern.',
      source: 'lksg',
      paragraphNumber: '§ 6',
      language: 'de',
      jurisdiction: 'DE',
      candidateElements: [
        { id: 'cap-1', name: 'Lieferantenmanagement', type: 'capability' },
      ],
      anthropicClient: client,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toContain('Compliance Architect AI');
    expect(callArgs.system).toContain('Priority-Mapping');
    expect(callArgs.messages[0].content).toContain('LKSG § 6');
    expect(callArgs.messages[0].content).toContain('Lieferantenmanagement');
    expect(callArgs.max_tokens).toBe(4096);
  });
});
