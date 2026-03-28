/**
 * Remediation Validator — Unit Tests
 *
 * Tests the 7 validation rules for elements and connections:
 * 1. Element type whitelist (ARCHIMATE_STANDARD_TYPES)
 * 2. Non-empty name
 * 3. Layer-domain consistency
 * 4. Duplicate detection
 * 5. Confidence threshold (reject < 0.3, warn 0.3-0.5)
 * 6. §-Reference validation
 * 7. Valid layer
 *
 * Connection rules:
 * 1. Connection type whitelist
 * 2. TempId consistency
 * 3. Layer rules (same-level, direction)
 * 4. Self-reference check
 * 5. Confidence threshold
 *
 * Uses MongoDB Memory Server for isolation. No live server required.
 *
 * Run: cd packages/server && npx jest src/__tests__/remediation-validator.test.ts --forceExit
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { ProposalElement, ProposalConnection } from '@thearchitect/shared';

// We need to mock Neo4j calls before importing the validator
jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  serializeNeo4jProperties: jest.fn((obj: any) => obj),
}));

import { validateProposal } from '../services/remediation-validator.service';
import { runCypher } from '../config/neo4j';
import { Standard } from '../models/Standard';

const mockedRunCypher = runCypher as jest.MockedFunction<typeof runCypher>;

let mongod: MongoMemoryServer;

// ─── Test Data Factory ───

function makeElement(overrides: Partial<ProposalElement> = {}): ProposalElement {
  return {
    tempId: `el-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Application Service',
    type: 'application_service' as any,
    layer: 'application' as any,
    togafDomain: 'application' as any,
    description: 'Test element',
    status: 'target' as any,
    riskLevel: 'low' as any,
    maturityLevel: 1,
    confidence: 0.8,
    sectionReference: undefined,
    reasoning: 'Test reasoning',
    ...overrides,
  };
}

function makeConnection(overrides: Partial<ProposalConnection> = {}): ProposalConnection {
  return {
    tempId: `conn-${Math.random().toString(36).slice(2, 8)}`,
    sourceTempId: 'el-source',
    targetTempId: 'el-target',
    type: 'serving' as any,
    label: 'Test connection',
    confidence: 0.8,
    reasoning: 'Test reasoning',
    ...overrides,
  };
}

// ─── Setup / Teardown ───

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 30_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
}, 15_000);

afterEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. ELEMENT WHITELIST VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('1. Element Type Whitelist', () => {
  test('1.1 Valid ArchiMate type passes validation', async () => {
    const el = makeElement({ tempId: 'el-1', type: 'application_service' as any });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.overallValid).toBe(true);
    expect(result.elementResults[0].valid).toBe(true);
    expect(result.elementResults[0].errors).toHaveLength(0);
  });

  test('1.2 Invalid element type produces error', async () => {
    const el = makeElement({ tempId: 'el-bad', type: 'unicorn_service' as any });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.overallValid).toBe(false);
    expect(result.elementResults[0].valid).toBe(false);
    expect(result.elementResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid element type')]),
    );
  });

  test('1.3 Multiple valid types all pass', async () => {
    // Use actual ArchiMate types from ELEMENT_TYPES (not made-up names)
    const testElements: Array<{ type: string; layer: string; togafDomain: string }> = [
      { type: 'application_component', layer: 'application', togafDomain: 'application' },
      { type: 'process', layer: 'business', togafDomain: 'business' },
      { type: 'data_object', layer: 'information', togafDomain: 'data' },
      { type: 'technology_service', layer: 'technology', togafDomain: 'technology' },
      { type: 'node', layer: 'technology', togafDomain: 'technology' },
      { type: 'artifact', layer: 'technology', togafDomain: 'technology' },
      { type: 'business_actor', layer: 'business', togafDomain: 'business' },
    ];

    const elements = testElements.map((t, i) => makeElement({
      tempId: `el-${i}`,
      type: t.type as any,
      layer: t.layer as any,
      togafDomain: t.togafDomain as any,
    }));

    const result = await validateProposal('proj-1', { elements, connections: [] });
    expect(result.elementResults.every((r) => r.valid)).toBe(true);
  });

  test('1.4 Mix of valid and invalid types — overallValid is false', async () => {
    const elements = [
      makeElement({ tempId: 'el-ok', type: 'application_service' as any }),
      makeElement({ tempId: 'el-bad', type: 'fake_type' as any }),
    ];
    const result = await validateProposal('proj-1', { elements, connections: [] });

    expect(result.overallValid).toBe(false);
    expect(result.elementResults[0].valid).toBe(true);
    expect(result.elementResults[1].valid).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ELEMENT NAME VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('2. Element Name', () => {
  test('2.1 Empty name produces error', async () => {
    const el = makeElement({ tempId: 'el-noname', name: '' });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.overallValid).toBe(false);
    expect(result.elementResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('name must not be empty')]),
    );
  });

  test('2.2 Whitespace-only name produces error', async () => {
    const el = makeElement({ tempId: 'el-spaces', name: '   ' });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.overallValid).toBe(false);
    expect(result.elementResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('name must not be empty')]),
    );
  });

  test('2.3 Valid name passes', async () => {
    const el = makeElement({ tempId: 'el-named', name: 'Customer Portal' });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].valid).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. LAYER-DOMAIN CONSISTENCY
// ═════════════════════════════════════════════════════════════════════════════

describe('3. Layer-Domain Consistency', () => {
  test('3.1 Matching domain produces no warning', async () => {
    const el = makeElement({
      tempId: 'el-match',
      type: 'application_service' as any,
      layer: 'application' as any,
      togafDomain: 'application' as any,
    });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].warnings).toHaveLength(0);
  });

  test('3.2 Mismatched domain produces warning (not error)', async () => {
    const el = makeElement({
      tempId: 'el-mismatch',
      type: 'application_service' as any,
      layer: 'application' as any,
      togafDomain: 'business' as any, // wrong domain
    });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    // Should still be valid (warnings don't invalidate)
    expect(result.elementResults[0].valid).toBe(true);
    expect(result.elementResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('typically in domain')]),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. DUPLICATE DETECTION
// ═════════════════════════════════════════════════════════════════════════════

describe('4. Duplicate Detection', () => {
  test('4.1 Duplicate name+type in existing architecture produces warning', async () => {
    // Mock Neo4j to return an existing element with same name+type
    mockedRunCypher.mockResolvedValueOnce([
      {
        toObject: () => ({
          id: 'existing-1',
          name: 'Customer Portal',
          type: 'application_service',
          layer: 'application',
        }),
      },
    ] as any);

    const el = makeElement({
      tempId: 'el-dup',
      name: 'Customer Portal',
      type: 'application_service' as any,
    });

    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].valid).toBe(true); // warning, not error
    expect(result.elementResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('already exists')]),
    );
  });

  test('4.2 Case-insensitive duplicate detection', async () => {
    mockedRunCypher.mockResolvedValueOnce([
      {
        toObject: () => ({
          id: 'existing-1',
          name: 'customer portal',
          type: 'application_service',
          layer: 'application',
        }),
      },
    ] as any);

    const el = makeElement({
      tempId: 'el-dup-case',
      name: 'CUSTOMER PORTAL',
      type: 'application_service' as any,
    });

    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('already exists')]),
    );
  });

  test('4.3 Same name but different type — no duplicate warning', async () => {
    mockedRunCypher.mockResolvedValueOnce([
      {
        toObject: () => ({
          id: 'existing-1',
          name: 'Customer Portal',
          type: 'application_component',
          layer: 'application',
        }),
      },
    ] as any);

    const el = makeElement({
      tempId: 'el-nodup',
      name: 'Customer Portal',
      type: 'application_service' as any, // different type
    });

    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    const dupWarnings = result.elementResults[0].warnings.filter((w) => w.includes('already exists'));
    expect(dupWarnings).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. CONFIDENCE THRESHOLDS
// ═════════════════════════════════════════════════════════════════════════════

describe('5. Confidence Thresholds', () => {
  test('5.1 Confidence >= 0.5 — no warnings or errors', async () => {
    const el = makeElement({ tempId: 'el-high', confidence: 0.8 });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].valid).toBe(true);
    const confWarnings = result.elementResults[0].warnings.filter((w) => w.includes('confidence') || w.includes('Confidence'));
    expect(confWarnings).toHaveLength(0);
  });

  test('5.2 Confidence 0.3-0.5 — warning', async () => {
    const el = makeElement({ tempId: 'el-mid', confidence: 0.4 });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].valid).toBe(true);
    expect(result.elementResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Low confidence')]),
    );
  });

  test('5.3 Confidence < 0.3 — error (rejected)', async () => {
    const el = makeElement({ tempId: 'el-low', confidence: 0.2 });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.overallValid).toBe(false);
    expect(result.elementResults[0].valid).toBe(false);
    expect(result.elementResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('below minimum threshold')]),
    );
  });

  test('5.4 Confidence exactly 0.3 — boundary (should be warning, not error)', async () => {
    const el = makeElement({ tempId: 'el-boundary', confidence: 0.3 });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].valid).toBe(true);
    expect(result.elementResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Low confidence')]),
    );
  });

  test('5.5 Confidence exactly 0.5 — no warning', async () => {
    const el = makeElement({ tempId: 'el-exact50', confidence: 0.5 });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].valid).toBe(true);
    const confWarnings = result.elementResults[0].warnings.filter((w) => w.includes('confidence') || w.includes('Confidence'));
    expect(confWarnings).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. §-REFERENCE VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('6. §-Reference Validation', () => {
  test('6.1 Valid §-reference produces no warning', async () => {
    // Create a standard with sections in MongoDB
    const standard = await Standard.create({
      name: 'Test Standard',
      version: '1.0',
      body: 'TOGAF',
      projectId: new mongoose.Types.ObjectId(),
      uploadedBy: new mongoose.Types.ObjectId(),
      sections: [
        { number: '5.1', title: 'Section 5.1', content: 'Content', requirements: [] },
        { number: '5.2', title: 'Section 5.2', content: 'Content', requirements: [] },
      ],
    });

    const el = makeElement({
      tempId: 'el-ref',
      sectionReference: '§5.1',
    });

    const result = await validateProposal('proj-1', { elements: [el], connections: [] }, standard._id.toString());

    const refWarnings = result.elementResults[0].warnings.filter((w) => w.includes('Section reference'));
    expect(refWarnings).toHaveLength(0);

    await Standard.deleteMany({});
  });

  test('6.2 Invalid §-reference produces warning', async () => {
    const standard = await Standard.create({
      name: 'Test Standard 2',
      version: '1.0',
      body: 'TOGAF',
      projectId: new mongoose.Types.ObjectId(),
      uploadedBy: new mongoose.Types.ObjectId(),
      sections: [
        { number: '5.1', title: 'Section 5.1', content: 'Content', requirements: [] },
      ],
    });

    const el = makeElement({
      tempId: 'el-badref',
      sectionReference: '§99.9', // doesn't exist
    });

    const result = await validateProposal('proj-1', { elements: [el], connections: [] }, standard._id.toString());

    expect(result.elementResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('not found in the standard')]),
    );

    await Standard.deleteMany({});
  });

  test('6.3 No §-reference — no validation needed', async () => {
    const el = makeElement({ tempId: 'el-noref', sectionReference: undefined });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    const refWarnings = result.elementResults[0].warnings.filter((w) => w.includes('Section reference'));
    expect(refWarnings).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. LAYER VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('7. Layer Validation', () => {
  test('7.1 Valid layers pass', async () => {
    const validLayers = ['motivation', 'strategy', 'business', 'information', 'application', 'technology', 'physical', 'implementation_migration'] as any[];

    for (const layer of validLayers) {
      const el = makeElement({ tempId: `el-${layer}`, layer });
      const result = await validateProposal('proj-1', { elements: [el], connections: [] });
      const layerErrors = result.elementResults[0].errors.filter((e) => e.includes('Invalid layer'));
      expect(layerErrors).toHaveLength(0);
    }
  });

  test('7.2 Invalid layer produces error', async () => {
    const el = makeElement({ tempId: 'el-badlayer', layer: 'nonexistent_layer' as any });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.elementResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid layer')]),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. CONNECTION TYPE WHITELIST
// ═════════════════════════════════════════════════════════════════════════════

describe('8. Connection Type Whitelist', () => {
  test('8.1 Valid connection types pass', async () => {
    const source = makeElement({ tempId: 'el-src', layer: 'application' as any });
    const target = makeElement({ tempId: 'el-tgt', layer: 'application' as any });

    const validTypes = ['composition', 'aggregation', 'serving', 'realization', 'flow', 'triggering', 'association'];

    for (const type of validTypes) {
      const conn = makeConnection({
        tempId: `conn-${type}`,
        sourceTempId: 'el-src',
        targetTempId: 'el-tgt',
        type: type as any,
      });
      const result = await validateProposal('proj-1', {
        elements: [source, target],
        connections: [conn],
      });
      const typeErrors = result.connectionResults[0].errors.filter((e) => e.includes('Invalid connection type'));
      expect(typeErrors).toHaveLength(0);
    }
  });

  test('8.2 Invalid connection type produces error', async () => {
    const source = makeElement({ tempId: 'el-src2', layer: 'application' as any });
    const target = makeElement({ tempId: 'el-tgt2', layer: 'application' as any });
    const conn = makeConnection({
      tempId: 'conn-bad',
      sourceTempId: 'el-src2',
      targetTempId: 'el-tgt2',
      type: 'magical_link' as any,
    });

    const result = await validateProposal('proj-1', {
      elements: [source, target],
      connections: [conn],
    });

    expect(result.connectionResults[0].valid).toBe(false);
    expect(result.connectionResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Invalid connection type')]),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. TEMPID CONSISTENCY (Connections)
// ═════════════════════════════════════════════════════════════════════════════

describe('9. TempId Consistency', () => {
  test('9.1 Connection referencing proposal elements resolves', async () => {
    const source = makeElement({ tempId: 'el-a', layer: 'application' as any });
    const target = makeElement({ tempId: 'el-b', layer: 'application' as any });
    const conn = makeConnection({
      tempId: 'conn-1',
      sourceTempId: 'el-a',
      targetTempId: 'el-b',
    });

    const result = await validateProposal('proj-1', {
      elements: [source, target],
      connections: [conn],
    });

    expect(result.connectionResults[0].valid).toBe(true);
    const endpointErrors = result.connectionResults[0].errors.filter((e) => e.includes('not found'));
    expect(endpointErrors).toHaveLength(0);
  });

  test('9.2 Connection with unresolvable source produces error', async () => {
    const target = makeElement({ tempId: 'el-exists' });
    const conn = makeConnection({
      tempId: 'conn-orphan',
      sourceTempId: 'el-nonexistent',
      targetTempId: 'el-exists',
    });

    const result = await validateProposal('proj-1', {
      elements: [target],
      connections: [conn],
    });

    expect(result.connectionResults[0].valid).toBe(false);
    expect(result.connectionResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Source')]),
    );
  });

  test('9.3 Connection with unresolvable target produces error', async () => {
    const source = makeElement({ tempId: 'el-exists2' });
    const conn = makeConnection({
      tempId: 'conn-orphan2',
      sourceTempId: 'el-exists2',
      targetTempId: 'el-ghost',
    });

    const result = await validateProposal('proj-1', {
      elements: [source],
      connections: [conn],
    });

    expect(result.connectionResults[0].valid).toBe(false);
    expect(result.connectionResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('Target')]),
    );
  });

  test('9.4 "existing:Name" format resolves against mocked Neo4j', async () => {
    mockedRunCypher.mockResolvedValueOnce([
      {
        toObject: () => ({
          id: 'existing-erp',
          name: 'Core ERP',
          type: 'application_component',
          layer: 'application',
        }),
      },
    ] as any);

    const source = makeElement({ tempId: 'el-new', layer: 'application' as any });
    const conn = makeConnection({
      tempId: 'conn-ext',
      sourceTempId: 'el-new',
      targetTempId: 'existing:Core ERP',
    });

    const result = await validateProposal('proj-1', {
      elements: [source],
      connections: [conn],
    });

    // Target should resolve successfully
    const targetErrors = result.connectionResults[0].errors.filter((e) => e.includes('Target'));
    expect(targetErrors).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. CONNECTION LAYER RULES
// ═════════════════════════════════════════════════════════════════════════════

describe('10. Connection Layer Rules', () => {
  test('10.1 Composition across layers produces warning', async () => {
    const source = makeElement({ tempId: 'el-biz', layer: 'business' as any, type: 'business_process' as any, togafDomain: 'business' as any });
    const target = makeElement({ tempId: 'el-app', layer: 'application' as any, type: 'application_service' as any, togafDomain: 'application' as any });
    const conn = makeConnection({
      tempId: 'conn-cross',
      sourceTempId: 'el-biz',
      targetTempId: 'el-app',
      type: 'composition' as any,
    });

    const result = await validateProposal('proj-1', {
      elements: [source, target],
      connections: [conn],
    });

    expect(result.connectionResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('same layer')]),
    );
  });

  test('10.2 Composition within same layer — no warning', async () => {
    const source = makeElement({ tempId: 'el-app1', layer: 'application' as any });
    const target = makeElement({ tempId: 'el-app2', layer: 'application' as any });
    const conn = makeConnection({
      tempId: 'conn-same',
      sourceTempId: 'el-app1',
      targetTempId: 'el-app2',
      type: 'composition' as any,
    });

    const result = await validateProposal('proj-1', {
      elements: [source, target],
      connections: [conn],
    });

    const layerWarnings = result.connectionResults[0].warnings.filter((w) => w.includes('same layer'));
    expect(layerWarnings).toHaveLength(0);
  });

  test('10.3 Self-referencing connection produces warning', async () => {
    const el = makeElement({ tempId: 'el-self', layer: 'application' as any });
    const conn = makeConnection({
      tempId: 'conn-self',
      sourceTempId: 'el-self',
      targetTempId: 'el-self',
      type: 'flow' as any,
    });

    const result = await validateProposal('proj-1', {
      elements: [el],
      connections: [conn],
    });

    expect(result.connectionResults[0].warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('Self-referencing')]),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. CONNECTION CONFIDENCE
// ═════════════════════════════════════════════════════════════════════════════

describe('11. Connection Confidence', () => {
  test('11.1 Connection confidence < 0.3 — error', async () => {
    const source = makeElement({ tempId: 'el-s' });
    const target = makeElement({ tempId: 'el-t' });
    const conn = makeConnection({
      tempId: 'conn-lowconf',
      sourceTempId: 'el-s',
      targetTempId: 'el-t',
      confidence: 0.1,
    });

    const result = await validateProposal('proj-1', {
      elements: [source, target],
      connections: [conn],
    });

    expect(result.connectionResults[0].valid).toBe(false);
    expect(result.connectionResults[0].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('below minimum threshold')]),
    );
  });

  test('11.2 Connection confidence >= 0.3 — valid', async () => {
    const source = makeElement({ tempId: 'el-s2' });
    const target = makeElement({ tempId: 'el-t2' });
    const conn = makeConnection({
      tempId: 'conn-okconf',
      sourceTempId: 'el-s2',
      targetTempId: 'el-t2',
      confidence: 0.7,
    });

    const result = await validateProposal('proj-1', {
      elements: [source, target],
      connections: [conn],
    });

    expect(result.connectionResults[0].valid).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. OVERALL VALIDATION RESULT STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

describe('12. Overall Validation Result', () => {
  test('12.1 Result has correct structure', async () => {
    const el = makeElement({ tempId: 'el-struct' });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result).toHaveProperty('elementResults');
    expect(result).toHaveProperty('connectionResults');
    expect(result).toHaveProperty('overallValid');
    expect(result).toHaveProperty('validatedAt');
    expect(Array.isArray(result.elementResults)).toBe(true);
    expect(Array.isArray(result.connectionResults)).toBe(true);
    expect(typeof result.overallValid).toBe('boolean');
    expect(typeof result.validatedAt).toBe('string');
  });

  test('12.2 validatedAt is a valid ISO date string', async () => {
    const el = makeElement({ tempId: 'el-date' });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    const date = new Date(result.validatedAt);
    expect(date.getTime()).not.toBeNaN();
  });

  test('12.3 Each element result has tempId matching input', async () => {
    const elements = [
      makeElement({ tempId: 'el-x' }),
      makeElement({ tempId: 'el-y' }),
      makeElement({ tempId: 'el-z' }),
    ];
    const result = await validateProposal('proj-1', { elements, connections: [] });

    expect(result.elementResults.map((r) => r.tempId)).toEqual(['el-x', 'el-y', 'el-z']);
  });

  test('12.4 overallValid is false when any element has error', async () => {
    const elements = [
      makeElement({ tempId: 'el-good', confidence: 0.9 }),
      makeElement({ tempId: 'el-bad', confidence: 0.1 }), // below threshold
    ];
    const result = await validateProposal('proj-1', { elements, connections: [] });

    expect(result.overallValid).toBe(false);
  });

  test('12.5 overallValid is true when only warnings (no errors)', async () => {
    const el = makeElement({
      tempId: 'el-warn',
      confidence: 0.4, // low confidence warning
    });
    const result = await validateProposal('proj-1', { elements: [el], connections: [] });

    expect(result.overallValid).toBe(true);
    expect(result.elementResults[0].warnings.length).toBeGreaterThan(0);
  });

  test('12.6 Empty proposal is valid', async () => {
    const result = await validateProposal('proj-1', { elements: [], connections: [] });

    expect(result.overallValid).toBe(true);
    expect(result.elementResults).toHaveLength(0);
    expect(result.connectionResults).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. COMBINED VALIDATION SCENARIOS
// ═════════════════════════════════════════════════════════════════════════════

describe('13. Combined Scenarios', () => {
  test('13.1 Full valid proposal with elements and connections', async () => {
    const elements = [
      makeElement({
        tempId: 'el-svc',
        name: 'Customer API',
        type: 'application_service' as any,
        layer: 'application' as any,
        togafDomain: 'application' as any,
        confidence: 0.85,
      }),
      makeElement({
        tempId: 'el-comp',
        name: 'Customer DB',
        type: 'application_component' as any,
        layer: 'application' as any,
        togafDomain: 'application' as any,
        confidence: 0.9,
      }),
    ];
    const connections = [
      makeConnection({
        tempId: 'conn-svc-comp',
        sourceTempId: 'el-svc',
        targetTempId: 'el-comp',
        type: 'serving' as any,
        confidence: 0.8,
      }),
    ];

    const result = await validateProposal('proj-1', { elements, connections });

    expect(result.overallValid).toBe(true);
    expect(result.elementResults).toHaveLength(2);
    expect(result.connectionResults).toHaveLength(1);
  });

  test('13.2 Proposal with multiple errors across elements and connections', async () => {
    const elements = [
      makeElement({ tempId: 'el-ok', confidence: 0.8 }),
      makeElement({ tempId: 'el-badtype', type: 'invalid_type' as any, confidence: 0.1 }), // 2 errors
    ];
    const connections = [
      makeConnection({
        tempId: 'conn-broken',
        sourceTempId: 'el-missing1',
        targetTempId: 'el-missing2',
        type: 'nonexistent_link' as any,
        confidence: 0.05,
      }),
    ];

    const result = await validateProposal('proj-1', { elements, connections });

    expect(result.overallValid).toBe(false);
    // el-badtype should have 2+ errors (invalid type + low confidence)
    expect(result.elementResults[1].errors.length).toBeGreaterThanOrEqual(2);
    // conn-broken should have errors (bad type + unresolvable endpoints + low confidence)
    expect(result.connectionResults[0].errors.length).toBeGreaterThanOrEqual(3);
  });
});
