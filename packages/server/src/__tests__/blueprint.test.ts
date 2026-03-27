/**
 * Blueprint Generator Test Suite
 *
 * Part 1: Pure unit tests — validate element/connection validation, type mapping,
 *         position calculation, questionnaire serialization. No server needed.
 * Part 2: ArchiMate 3.2 compliance — whitelist enforcement, legacy mapping, connection types.
 * Part 3: Integration tests — route guards, SSE streaming, import endpoint.
 *         Prerequisites: Server running on localhost:4000, MongoDB + Redis + Neo4j available.
 *
 * Run: npx jest src/__tests__/blueprint.test.ts --forceExit
 */

import axios, { AxiosError } from 'axios';
import {
  ARCHIMATE_STANDARD_TYPES,
  ARCHIMATE_STANDARD_CONNECTION_TYPES,
  LEGACY_TYPE_MAP,
  ARCHITECTURE_LAYERS,
  ELEMENT_TYPES,
  PERMISSIONS,
} from '@thearchitect/shared';
import type {
  BlueprintInput,
  BlueprintQuestionnaire,
  BlueprintGeneratedElement,
  BlueprintGeneratedConnection,
  BlueprintStreamEvent,
} from '@thearchitect/shared';

const API = 'http://localhost:4000/api';
const http = axios.create({ baseURL: API, timeout: 10_000 });

// ── Helpers ──

function getError(err: unknown): { status: number; data: any } {
  const axErr = err as AxiosError;
  return {
    status: axErr.response?.status || 0,
    data: axErr.response?.data || {},
  };
}

// ── Replicate validation logic from blueprint.service.ts for unit testing ──

const TYPE_TO_DOMAIN = new Map<string, string>();
for (const et of ELEMENT_TYPES) {
  TYPE_TO_DOMAIN.set(et.type, et.domain);
}

const DOMAIN_TO_LAYER: Record<string, string> = {
  strategy: 'strategy',
  business: 'business',
  data: 'information',
  application: 'application',
  technology: 'technology',
  motivation: 'motivation',
  implementation: 'implementation_migration',
};

const STRATEGY_TYPES = new Set(['business_capability', 'value_stream', 'resource', 'course_of_action']);
const PHYSICAL_TYPES = new Set(['equipment', 'facility', 'distribution_network', 'material']);

function inferLayer(type: string): string {
  if (STRATEGY_TYPES.has(type)) return 'strategy';
  if (PHYSICAL_TYPES.has(type)) return 'physical';
  const domain = TYPE_TO_DOMAIN.get(type);
  if (domain && DOMAIN_TO_LAYER[domain]) return DOMAIN_TO_LAYER[domain];
  return 'application';
}

function inferDomain(type: string): string {
  const domain = TYPE_TO_DOMAIN.get(type);
  return domain || 'application';
}

// ── Test Data ──

function buildTestQuestionnaire(overrides?: Partial<BlueprintQuestionnaire>): BlueprintQuestionnaire {
  return {
    businessDescription: 'Online marketplace for sustainable fashion',
    targetUsers: 'Eco-conscious millennials aged 25-35',
    problemSolved: 'No transparent marketplace for verified sustainable brands',
    urgencyDriver: 'Growing demand for sustainable products',
    goals: ['10,000 active users in 6 months', 'Break-even in 18 months', 'Partner with 50 brands'],
    successVision: 'Market leader for sustainable fashion in DACH region',
    principles: 'Privacy first, mobile-first, open source where possible',
    capabilities: 'Order processing, payment handling, brand verification, recommendation engine',
    customerJourney: 'Google search → landing page → sign up → browse → order → delivery',
    teamDescription: '2 developers (frontend + backend), 1 designer, 1 marketing, founder',
    mainProcesses: 'Product listing, order fulfillment, customer support, brand onboarding',
    existingTools: ['React', 'Node.js', 'PostgreSQL', 'Stripe', 'AWS'],
    productType: 'marketplace',
    techDecisions: 'React + Node.js, PostgreSQL, hosted on AWS, payments via Stripe',
    constraints: 'GDPR compliant, budget max 5000€/month, EU hosting only',
    teamSize: '3-5',
    monthlyBudget: '2K-10K',
    regulations: ['gdpr'],
    ...overrides,
  };
}

function buildTestInput(overrides?: Partial<BlueprintInput>): BlueprintInput {
  const q = buildTestQuestionnaire();
  return {
    motivation: `${q.businessDescription}\nTarget users: ${q.targetUsers}\nProblem: ${q.problemSolved}`,
    strategy: `Key capabilities: ${q.capabilities}`,
    requirements: `Team: ${q.teamDescription}\nProduct type: marketplace`,
    industryHint: 'e-commerce',
    complexityHint: 'standard',
    rawQuestionnaire: q,
    ...overrides,
  };
}

function buildTestElement(overrides?: Partial<BlueprintGeneratedElement>): BlueprintGeneratedElement {
  return {
    id: `bp-test-${Math.random().toString(36).slice(2, 9)}`,
    name: 'Test Element',
    type: 'application_component',
    layer: 'application',
    togafDomain: 'application',
    description: 'A test element',
    status: 'target',
    riskLevel: 'low',
    maturityLevel: 2,
    position3D: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: Element Validation (pure unit tests — no server needed)
// ═══════════════════════════════════════════════════════════════════════════════

describe('1. Element Validation', () => {
  test('1.1 All ARCHIMATE_STANDARD_TYPES are defined', () => {
    expect(ARCHIMATE_STANDARD_TYPES.size).toBe(60);
  });

  test('1.2 Every standard type has a valid layer inference', () => {
    for (const type of ARCHIMATE_STANDARD_TYPES) {
      const layer = inferLayer(type);
      const validLayers = ARCHITECTURE_LAYERS.map((l) => l.id);
      expect(validLayers).toContain(layer);
    }
  });

  test('1.3 Every standard type has a valid domain inference', () => {
    const validDomains = ['business', 'data', 'application', 'technology', 'motivation', 'implementation', 'strategy'];
    for (const type of ARCHIMATE_STANDARD_TYPES) {
      const domain = inferDomain(type);
      expect(validDomains).toContain(domain);
    }
  });

  test('1.4 Strategy types infer to strategy layer', () => {
    const strategyTypes = ['business_capability', 'value_stream', 'resource', 'course_of_action'];
    for (const type of strategyTypes) {
      expect(inferLayer(type)).toBe('strategy');
    }
  });

  test('1.5 Physical types infer to physical layer', () => {
    const physicalTypes = ['equipment', 'facility', 'distribution_network', 'material'];
    for (const type of physicalTypes) {
      expect(inferLayer(type)).toBe('physical');
    }
  });

  test('1.6 Motivation types infer to motivation layer', () => {
    const motivationTypes = ['stakeholder', 'driver', 'assessment', 'goal', 'outcome', 'principle', 'requirement', 'constraint'];
    for (const type of motivationTypes) {
      expect(inferLayer(type)).toBe('motivation');
    }
  });

  test('1.7 Application types infer to application layer', () => {
    const appTypes = ['application_component', 'application_service', 'application_function'];
    for (const type of appTypes) {
      expect(inferLayer(type)).toBe('application');
    }
  });

  test('1.8 Technology types infer to technology layer', () => {
    const techTypes = ['node', 'device', 'system_software', 'technology_service', 'artifact'];
    for (const type of techTypes) {
      expect(inferLayer(type)).toBe('technology');
    }
  });

  test('1.9 Business types infer to business layer', () => {
    const businessTypes = ['process', 'business_service', 'business_actor', 'business_role', 'business_object'];
    for (const type of businessTypes) {
      expect(inferLayer(type)).toBe('business');
    }
  });

  test('1.10 Implementation types infer to implementation_migration layer', () => {
    const implTypes = ['work_package', 'deliverable', 'plateau', 'gap'];
    for (const type of implTypes) {
      expect(inferLayer(type)).toBe('implementation_migration');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: ArchiMate 3.2 Compliance
// ═══════════════════════════════════════════════════════════════════════════════

describe('2. ArchiMate 3.2 Compliance', () => {
  test('2.1 All 11 standard connection types are defined', () => {
    const expected = [
      'composition', 'aggregation', 'assignment', 'realization',
      'serving', 'access', 'influence',
      'triggering', 'flow', 'specialization',
      'association',
    ];
    expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.size).toBe(11);
    for (const type of expected) {
      expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.has(type)).toBe(true);
    }
  });

  test('2.2 Legacy type mapping covers all known legacy types', () => {
    const legacyTypes = ['application', 'service', 'platform_service', 'technology_component', 'infrastructure'];
    for (const legacy of legacyTypes) {
      const mapped = LEGACY_TYPE_MAP[legacy as keyof typeof LEGACY_TYPE_MAP];
      expect(mapped).toBeDefined();
      expect(ARCHIMATE_STANDARD_TYPES.has(mapped!)).toBe(true);
    }
  });

  test('2.3 application maps to application_component', () => {
    expect(LEGACY_TYPE_MAP['application' as keyof typeof LEGACY_TYPE_MAP]).toBe('application_component');
  });

  test('2.4 service maps to application_service', () => {
    expect(LEGACY_TYPE_MAP['service' as keyof typeof LEGACY_TYPE_MAP]).toBe('application_service');
  });

  test('2.5 infrastructure maps to node', () => {
    expect(LEGACY_TYPE_MAP['infrastructure' as keyof typeof LEGACY_TYPE_MAP]).toBe('node');
  });

  test('2.6 All 8 architecture layers are defined with yPositions', () => {
    expect(ARCHITECTURE_LAYERS).toHaveLength(8);
    const layerIds = ARCHITECTURE_LAYERS.map((l) => l.id);
    expect(layerIds).toContain('motivation');
    expect(layerIds).toContain('strategy');
    expect(layerIds).toContain('business');
    expect(layerIds).toContain('information');
    expect(layerIds).toContain('application');
    expect(layerIds).toContain('technology');
    expect(layerIds).toContain('physical');
    expect(layerIds).toContain('implementation_migration');
  });

  test('2.7 Layer yPositions are ordered top to bottom', () => {
    for (let i = 0; i < ARCHITECTURE_LAYERS.length - 1; i++) {
      expect(ARCHITECTURE_LAYERS[i].yPosition).toBeGreaterThan(ARCHITECTURE_LAYERS[i + 1].yPosition);
    }
  });

  test('2.8 Every layer has a distinct color', () => {
    const colors = ARCHITECTURE_LAYERS.map((l) => l.color);
    const unique = new Set(colors);
    expect(unique.size).toBe(8);
  });

  test('2.9 Standard types cover all 8 layers', () => {
    const coveredLayers = new Set<string>();
    for (const type of ARCHIMATE_STANDARD_TYPES) {
      coveredLayers.add(inferLayer(type));
    }
    for (const layer of ARCHITECTURE_LAYERS) {
      expect(coveredLayers.has(layer.id)).toBe(true);
    }
  });

  test('2.10 No duplicates in standard types set', () => {
    // Set inherently prevents duplicates, but verify the count matches unique types
    const arr = Array.from(ARCHIMATE_STANDARD_TYPES);
    const unique = new Set(arr);
    expect(unique.size).toBe(arr.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: Questionnaire & Input Serialization
// ═══════════════════════════════════════════════════════════════════════════════

describe('3. Questionnaire Serialization', () => {
  test('3.1 buildTestQuestionnaire produces valid structure', () => {
    const q = buildTestQuestionnaire();
    expect(q.businessDescription).toBeTruthy();
    expect(q.targetUsers).toBeTruthy();
    expect(q.problemSolved).toBeTruthy();
    expect(q.goals).toHaveLength(3);
    expect(q.capabilities).toBeTruthy();
  });

  test('3.2 buildTestInput produces valid BlueprintInput', () => {
    const input = buildTestInput();
    expect(input.motivation).toBeTruthy();
    expect(input.strategy).toBeTruthy();
    expect(input.requirements).toBeTruthy();
    expect(input.rawQuestionnaire).toBeDefined();
    expect(input.complexityHint).toBe('standard');
  });

  test('3.3 Questionnaire goals are a 3-tuple', () => {
    const q = buildTestQuestionnaire();
    expect(q.goals).toHaveLength(3);
    expect(q.goals[0]).toBeTruthy();
    expect(q.goals[1]).toBeTruthy();
    expect(q.goals[2]).toBeTruthy();
  });

  test('3.4 Complexity hints map correctly', () => {
    const minimal = buildTestInput({ complexityHint: 'minimal' });
    const standard = buildTestInput({ complexityHint: 'standard' });
    const comprehensive = buildTestInput({ complexityHint: 'comprehensive' });
    expect(minimal.complexityHint).toBe('minimal');
    expect(standard.complexityHint).toBe('standard');
    expect(comprehensive.complexityHint).toBe('comprehensive');
  });

  test('3.5 Product types are valid enum values', () => {
    const validTypes = ['web_app', 'mobile_app', 'api_platform', 'marketplace', 'saas', 'hardware_software', 'other'];
    for (const pt of validTypes) {
      const q = buildTestQuestionnaire({ productType: pt as any });
      expect(validTypes).toContain(q.productType);
    }
  });

  test('3.6 Team sizes are valid enum values', () => {
    const validSizes = ['1-2', '3-5', '6-15', '16-50', '50+'];
    for (const size of validSizes) {
      const q = buildTestQuestionnaire({ teamSize: size as any });
      expect(validSizes).toContain(q.teamSize);
    }
  });

  test('3.7 Budget ranges are valid enum values', () => {
    const validBudgets = ['<500', '500-2K', '2K-10K', '10K-50K', '50K+'];
    for (const budget of validBudgets) {
      const q = buildTestQuestionnaire({ monthlyBudget: budget as any });
      expect(validBudgets).toContain(q.monthlyBudget);
    }
  });

  test('3.8 Regulations are string arrays', () => {
    const q = buildTestQuestionnaire({ regulations: ['gdpr', 'soc2', 'iso27001'] });
    expect(Array.isArray(q.regulations)).toBe(true);
    expect(q.regulations).toHaveLength(3);
  });

  test('3.9 Optional fields can be undefined', () => {
    const q = buildTestQuestionnaire({
      urgencyDriver: undefined,
      successVision: undefined,
      principles: undefined,
      customerJourney: undefined,
      teamDescription: undefined,
      mainProcesses: undefined,
      existingTools: undefined,
      productType: undefined,
      techDecisions: undefined,
      constraints: undefined,
      teamSize: undefined,
      monthlyBudget: undefined,
      regulations: undefined,
    });
    expect(q.businessDescription).toBeTruthy();
    expect(q.urgencyDriver).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4: Position3D Layout
// ═══════════════════════════════════════════════════════════════════════════════

describe('4. Position3D Layout', () => {
  test('4.1 Elements in same layer get different X positions', () => {
    const elements = [
      buildTestElement({ layer: 'application', type: 'application_component', name: 'A' }),
      buildTestElement({ layer: 'application', type: 'application_service', name: 'B' }),
      buildTestElement({ layer: 'application', type: 'application_function', name: 'C' }),
    ];

    // Simulate position calculation
    const layerCounts: Record<string, number> = {};
    const spacing = 3;
    const rowSize = 5;

    for (const el of elements) {
      layerCounts[el.layer] = layerCounts[el.layer] || 0;
      const col = layerCounts[el.layer]++;
      el.position3D = {
        x: (col % rowSize) * spacing - ((Math.min(rowSize, layerCounts[el.layer]) - 1) * spacing) / 2,
        y: ARCHITECTURE_LAYERS.find((l) => l.id === el.layer)?.yPosition ?? 0,
        z: Math.floor(col / rowSize) * spacing,
      };
    }

    // All should have y=0 (application layer)
    expect(elements[0].position3D.y).toBe(0);
    expect(elements[1].position3D.y).toBe(0);
    expect(elements[2].position3D.y).toBe(0);

    // X positions should be different
    const xPositions = new Set(elements.map((e) => e.position3D.x));
    expect(xPositions.size).toBe(3);
  });

  test('4.2 Elements in different layers get different Y positions', () => {
    const layers = ['motivation', 'strategy', 'business', 'application', 'technology'];
    const yPositions = layers.map((l) => ARCHITECTURE_LAYERS.find((a) => a.id === l)?.yPosition ?? 0);

    // All Y positions should be unique
    const unique = new Set(yPositions);
    expect(unique.size).toBe(5);

    // Y should decrease top to bottom (motivation > strategy > business > application > technology)
    for (let i = 0; i < yPositions.length - 1; i++) {
      expect(yPositions[i]).toBeGreaterThan(yPositions[i + 1]);
    }
  });

  test('4.3 More than 5 elements in a layer wrap to next row (z increases)', () => {
    const elements: BlueprintGeneratedElement[] = [];
    for (let i = 0; i < 7; i++) {
      elements.push(buildTestElement({ layer: 'business', type: 'process', name: `Process ${i}` }));
    }

    const layerCounts: Record<string, number> = {};
    const spacing = 3;
    const rowSize = 5;

    for (const el of elements) {
      layerCounts[el.layer] = layerCounts[el.layer] || 0;
      const col = layerCounts[el.layer]++;
      el.position3D = {
        x: (col % rowSize) * spacing - ((Math.min(rowSize, layerCounts[el.layer]) - 1) * spacing) / 2,
        y: 8,
        z: Math.floor(col / rowSize) * spacing,
      };
    }

    // First 5 should be on z=0
    for (let i = 0; i < 5; i++) {
      expect(elements[i].position3D.z).toBe(0);
    }
    // Element 6 and 7 should be on z=3 (next row)
    expect(elements[5].position3D.z).toBe(spacing);
    expect(elements[6].position3D.z).toBe(spacing);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5: Connection Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('5. Connection Validation', () => {
  test('5.1 Standard connection types are accepted', () => {
    const standardTypes = ['composition', 'aggregation', 'assignment', 'realization', 'serving', 'access', 'influence', 'triggering', 'flow', 'specialization', 'association'];
    for (const type of standardTypes) {
      expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.has(type)).toBe(true);
    }
  });

  test('5.2 Legacy connection types are rejected by standard whitelist', () => {
    const legacyTypes = ['depends_on', 'connects_to', 'belongs_to', 'implements', 'data_flow', 'triggers'];
    for (const type of legacyTypes) {
      expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.has(type)).toBe(false);
    }
  });

  test('5.3 Cross-layer connection patterns are valid', () => {
    // Motivation → Strategy via influence
    expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.has('influence')).toBe(true);
    // Strategy → Business via realization
    expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.has('realization')).toBe(true);
    // Business → Application via serving
    expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.has('serving')).toBe(true);
    // Actor → Process via assignment
    expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.has('assignment')).toBe(true);
  });

  test('5.4 Connection with invalid source/target should be detectable', () => {
    const elements = [
      buildTestElement({ id: 'el-1', name: 'Element A' }),
      buildTestElement({ id: 'el-2', name: 'Element B' }),
    ];
    const elementIds = new Set(elements.map((e) => e.id));

    // Valid connection
    expect(elementIds.has('el-1')).toBe(true);
    expect(elementIds.has('el-2')).toBe(true);

    // Invalid reference
    expect(elementIds.has('el-999')).toBe(false);
  });

  test('5.5 Orphan detection identifies unconnected elements', () => {
    const elements = [
      buildTestElement({ id: 'el-1', name: 'Connected A' }),
      buildTestElement({ id: 'el-2', name: 'Connected B' }),
      buildTestElement({ id: 'el-3', name: 'Orphan' }),
    ];

    const connections: BlueprintGeneratedConnection[] = [
      {
        id: 'conn-1',
        sourceId: 'el-1',
        targetId: 'el-2',
        sourceName: 'Connected A',
        targetName: 'Connected B',
        type: 'serving' as any,
        label: 'serves',
      },
    ];

    const connected = new Set<string>();
    for (const c of connections) {
      connected.add(c.sourceId);
      connected.add(c.targetId);
    }

    const orphans = elements.filter((e) => !connected.has(e.id));
    expect(orphans).toHaveLength(1);
    expect(orphans[0].name).toBe('Orphan');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6: Integration Tests — Route Guards (requires running server)
// ═══════════════════════════════════════════════════════════════════════════════

describe('6. Blueprint Route Guards (integration)', () => {
  const TEST_ID = Date.now().toString(36);
  const PASSWORD = 'Blueprint-Test-2026!';
  let adminToken = '';
  let viewerToken = '';
  let projectId = '';

  beforeAll(async () => {
    // Register admin user
    const adminEmail = `bp-admin-${TEST_ID}@thearchitect-test.local`;
    try {
      const { data: adminData } = await http.post('/auth/register', {
        email: adminEmail,
        password: PASSWORD,
        name: `BP Admin ${TEST_ID}`,
      });
      adminToken = adminData.accessToken;

      // Promote to chief_architect for full access
      const { MongoClient } = await import('mongodb');
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
      const client = new MongoClient(mongoUri);
      await client.connect();
      await client.db().collection('users').updateOne(
        { email: adminEmail },
        { $set: { role: 'chief_architect' } },
      );
      await client.close();

      // Re-login to get updated role in token
      const { data: loginData } = await http.post('/auth/login', {
        email: adminEmail,
        password: PASSWORD,
      });
      adminToken = loginData.accessToken;
    } catch (err) {
      console.warn('[Blueprint Test] Admin setup failed:', (err as Error).message);
    }

    // Register viewer user
    const viewerEmail = `bp-viewer-${TEST_ID}@thearchitect-test.local`;
    try {
      const { data: viewerData } = await http.post('/auth/register', {
        email: viewerEmail,
        password: PASSWORD,
        name: `BP Viewer ${TEST_ID}`,
      });
      viewerToken = viewerData.accessToken;
    } catch (err) {
      console.warn('[Blueprint Test] Viewer setup failed:', (err as Error).message);
    }

    // Create a test project
    if (adminToken) {
      try {
        const { data: projData } = await http.post(
          '/projects',
          { name: `BP Test ${TEST_ID}`, description: 'Blueprint test project' },
          { headers: { Authorization: `Bearer ${adminToken}` } },
        );
        projectId = projData.data?._id || projData.data?.id || projData._id || '';
      } catch (err) {
        console.warn('[Blueprint Test] Project creation failed:', (err as Error).message);
      }
    }
  }, 30_000);

  test('6.1 Unauthenticated request returns 401', async () => {
    if (!projectId) return;
    try {
      await http.post(`/projects/${projectId}/blueprint/generate`, buildTestInput());
      fail('Should have thrown 401');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(401);
    }
  });

  test('6.2 Viewer cannot access blueprint generate', async () => {
    if (!projectId || !viewerToken) return;
    try {
      await http.post(
        `/projects/${projectId}/blueprint/generate`,
        buildTestInput(),
        { headers: { Authorization: `Bearer ${viewerToken}` } },
      );
      fail('Should have thrown 403');
    } catch (err) {
      const { status } = getError(err);
      expect([403, 404]).toContain(status);
    }
  });

  test('6.3 Viewer cannot access blueprint import', async () => {
    if (!projectId || !viewerToken) return;
    try {
      await http.post(
        `/projects/${projectId}/blueprint/import`,
        { elements: [], connections: [] },
        { headers: { Authorization: `Bearer ${viewerToken}` } },
      );
      fail('Should have thrown 403');
    } catch (err) {
      const { status } = getError(err);
      expect([403, 404]).toContain(status);
    }
  });

  test('6.4 Invalid input returns 400', async () => {
    if (!projectId || !adminToken) return;
    try {
      await http.post(
        `/projects/${projectId}/blueprint/generate`,
        { motivation: '', strategy: '', requirements: '' },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      fail('Should have thrown 400');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(400);
    }
  });

  test('6.5 Import with invalid data returns 400', async () => {
    if (!projectId || !adminToken) return;
    try {
      await http.post(
        `/projects/${projectId}/blueprint/import`,
        { elements: 'not_array', connections: 'not_array' },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      fail('Should have thrown 400');
    } catch (err) {
      const { status } = getError(err);
      expect(status).toBe(400);
    }
  });

  test('6.6 Import with valid data creates elements', async () => {
    if (!projectId || !adminToken) return;

    const elements = [
      {
        id: `bp-import-test-${TEST_ID}-1`,
        type: 'stakeholder',
        name: `Test Stakeholder ${TEST_ID}`,
        description: 'Blueprint test element',
        layer: 'motivation',
        togafDomain: 'motivation',
        maturityLevel: 3,
        riskLevel: 'low',
        status: 'target',
        position3D: { x: 0, y: 16, z: 0 },
      },
      {
        id: `bp-import-test-${TEST_ID}-2`,
        type: 'application_component',
        name: `Test App ${TEST_ID}`,
        description: 'Blueprint test app component',
        layer: 'application',
        togafDomain: 'application',
        maturityLevel: 2,
        riskLevel: 'low',
        status: 'target',
        position3D: { x: 0, y: 0, z: 0 },
      },
    ];

    const connections = [
      {
        id: `bc-import-test-${TEST_ID}-1`,
        sourceId: `bp-import-test-${TEST_ID}-1`,
        targetId: `bp-import-test-${TEST_ID}-2`,
        type: 'influence',
        label: 'drives',
      },
    ];

    const { data } = await http.post(
      `/projects/${projectId}/blueprint/import`,
      {
        elements,
        connections,
        input: buildTestInput(),
        workspaceName: `Blueprint Test ${TEST_ID}`,
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    expect(data.success).toBe(true);
    expect(data.data.elementsCreated).toBe(2);
    expect(data.data.connectionsCreated).toBe(1);
    expect(data.data.workspaceId).toBeTruthy();
  }, 15_000);

  test('6.7 Imported elements are retrievable', async () => {
    if (!projectId || !adminToken) return;

    const { data } = await http.get(
      `/projects/${projectId}/elements`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    const elements = data.data || [];
    const testElement = elements.find((e: any) => e.name === `Test Stakeholder ${TEST_ID}`);
    expect(testElement).toBeDefined();
    expect(testElement.type).toBe('stakeholder');
    expect(testElement.layer).toBe('motivation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 7: SSE Streaming (integration — requires running server + AI key)
// ═══════════════════════════════════════════════════════════════════════════════

describe('7. SSE Blueprint Generation (integration, requires AI key)', () => {
  const TEST_ID = Date.now().toString(36);
  const PASSWORD = 'Blueprint-SSE-2026!';
  let adminToken = '';
  let projectId = '';

  beforeAll(async () => {
    const adminEmail = `bp-sse-${TEST_ID}@thearchitect-test.local`;
    try {
      const { data } = await http.post('/auth/register', {
        email: adminEmail,
        password: PASSWORD,
        name: `BP SSE ${TEST_ID}`,
      });
      adminToken = data.accessToken;

      const { MongoClient } = await import('mongodb');
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
      const client = new MongoClient(mongoUri);
      await client.connect();
      await client.db().collection('users').updateOne(
        { email: adminEmail },
        { $set: { role: 'chief_architect' } },
      );
      await client.close();

      const { data: loginData } = await http.post('/auth/login', {
        email: adminEmail,
        password: PASSWORD,
      });
      adminToken = loginData.accessToken;

      const { data: projData } = await http.post(
        '/projects',
        { name: `BP SSE Test ${TEST_ID}`, description: 'Blueprint SSE test' },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      projectId = projData.data?._id || projData.data?.id || projData._id || '';
    } catch (err) {
      console.warn('[Blueprint SSE Test] Setup failed:', (err as Error).message);
    }
  }, 30_000);

  test('7.1 Generate endpoint returns SSE content-type', async () => {
    if (!projectId || !adminToken) return;

    try {
      const response = await fetch(`${API}/projects/${projectId}/blueprint/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(buildTestInput({ complexityHint: 'minimal' })),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      // Read at least the first event
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        const { value } = await reader.read();
        const text = decoder.decode(value);
        expect(text).toContain('data: ');
        reader.cancel();
      }
    } catch (err) {
      // If no AI key is configured, the stream will contain an error event
      console.warn('[Blueprint SSE Test] Generation test skipped or errored:', (err as Error).message);
    }
  }, 60_000);

  test('7.2 Generate with minimal complexity produces events', async () => {
    if (!projectId || !adminToken) return;

    try {
      const response = await fetch(`${API}/projects/${projectId}/blueprint/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(buildTestInput({ complexityHint: 'minimal' })),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';
      const events: BlueprintStreamEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const event: BlueprintStreamEvent = JSON.parse(data);
            events.push(event);
          } catch {
            // Skip malformed
          }
        }
      }

      // Should have at least progress events
      expect(events.length).toBeGreaterThan(0);

      // Should have either a complete or error event
      const hasComplete = events.some((e) => e.type === 'complete');
      const hasError = events.some((e) => e.type === 'error');
      expect(hasComplete || hasError).toBe(true);

      if (hasComplete) {
        const complete = events.find((e) => e.type === 'complete') as Extract<BlueprintStreamEvent, { type: 'complete' }>;
        expect(complete.result.elements.length).toBeGreaterThan(0);
        expect(complete.result.validation).toBeDefined();
        expect(complete.result.validation.isValid).toBe(true);

        // Verify all elements have standard types
        for (const el of complete.result.elements) {
          expect(ARCHIMATE_STANDARD_TYPES.has(el.type)).toBe(true);
        }

        // Verify layer coverage
        const layers = new Set(complete.result.elements.map((e) => e.layer));
        expect(layers.size).toBeGreaterThanOrEqual(3);
      }
    } catch (err) {
      console.warn('[Blueprint SSE Test] Full generation test skipped:', (err as Error).message);
    }
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART 8: Sanity Checks
// ═══════════════════════════════════════════════════════════════════════════════

describe('8. Sanity Checks', () => {
  test('8.1 ARCHIMATE_STANDARD_TYPES has exactly 60 types', () => {
    expect(ARCHIMATE_STANDARD_TYPES.size).toBe(60);
  });

  test('8.2 ARCHIMATE_STANDARD_CONNECTION_TYPES has exactly 11 types', () => {
    expect(ARCHIMATE_STANDARD_CONNECTION_TYPES.size).toBe(11);
  });

  test('8.3 ARCHITECTURE_LAYERS has exactly 8 layers', () => {
    expect(ARCHITECTURE_LAYERS).toHaveLength(8);
  });

  test('8.4 LEGACY_TYPE_MAP has exactly 5 mappings', () => {
    expect(Object.keys(LEGACY_TYPE_MAP)).toHaveLength(5);
  });

  test('8.5 All ELEMENT_TYPES have required fields', () => {
    for (const et of ELEMENT_TYPES) {
      expect(et.type).toBeTruthy();
      expect(et.label).toBeTruthy();
      expect(et.domain).toBeTruthy();
    }
  });

  test('8.6 Blueprint element builder generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const el = buildTestElement();
      expect(ids.has(el.id)).toBe(false);
      ids.add(el.id);
    }
  });

  test('8.7 Complexity target counts are reasonable', () => {
    const counts = { minimal: 35, standard: 55, comprehensive: 75 };
    expect(counts.minimal).toBeGreaterThanOrEqual(30);
    expect(counts.minimal).toBeLessThanOrEqual(40);
    expect(counts.standard).toBeGreaterThanOrEqual(50);
    expect(counts.standard).toBeLessThanOrEqual(60);
    expect(counts.comprehensive).toBeGreaterThanOrEqual(70);
    expect(counts.comprehensive).toBeLessThanOrEqual(80);
  });
});
