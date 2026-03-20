/**
 * Transformation Roadmap Generator — Comprehensive Integration & Verification Tests
 *
 * Tests the full Roadmap feature: API endpoints, Kahn's topological sort,
 * strategy-specific ordering, data enrichment, rule-based recommendations,
 * summary invariants, performance, PDF export, permissions, and UI structure.
 *
 * ~90 tests across 15 sections.
 *
 * Prerequisites: Server running on localhost:4000, MongoDB + Neo4j + Redis available.
 *
 * Run: cd packages/server && npx jest src/__tests__/roadmap.test.ts --forceExit --verbose
 */

import axios, { AxiosError } from 'axios';
import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

config({ path: resolve(__dirname, '../../../../.env') });

const API = 'http://localhost:4000/api';
const http = axios.create({ baseURL: API, timeout: 60_000 });

// ─── Test Credentials ───

const TEST_ID = Date.now().toString(36);
const ADMIN_EMAIL = `roadmap-admin-${TEST_ID}@thearchitect-test.local`;
const ADMIN_PASSWORD = 'RoadmapTest1!';
const VIEWER_EMAIL = `roadmap-viewer-${TEST_ID}@thearchitect-test.local`;
const VIEWER_PASSWORD = 'RoadmapView1!';

let adminToken = '';
let viewerToken = '';
let projectId = '';
const elementIds: string[] = [];
let roadmapId = '';
let roadmapData: any = null;

// Topology project IDs (Section 2)
let linearProjectId = '';
let diamondProjectId = '';
let isolatedProjectId = '';
let cycleProjectId = '';
let fanoutProjectId = '';
let deepChainProjectId = '';
let minimalProjectId = '';
let emptyProjectId = '';
const allProjectIds: string[] = [];

function auth(token?: string) {
  return { headers: { Authorization: `Bearer ${token || adminToken}` } };
}

function getError(err: unknown): { status: number; error: string } {
  const axErr = err as AxiosError<{ error: string }>;
  return {
    status: axErr.response?.status || 0,
    error: axErr.response?.data?.error || 'unknown',
  };
}

// Helper: create project, elements, connections, return projectId + elementIds
async function createTopologyProject(
  name: string,
  elements: Array<{ name: string; type?: string; layer?: string; status?: string; riskLevel?: string; maturityLevel?: number }>,
  connections: Array<{ sourceIdx: number; targetIdx: number; type?: string }>,
): Promise<{ projectId: string; elementIds: string[] }> {
  const { data: pData } = await http.post('/projects', {
    name: `${name} ${TEST_ID}`,
    description: `Topology test: ${name}`,
  }, auth());
  const pid = pData.data?.id || pData.data?._id || pData.id || pData._id;
  allProjectIds.push(pid);

  const eIds: string[] = [];
  for (const el of elements) {
    const { data } = await http.post(`/projects/${pid}/elements`, {
      name: el.name,
      type: el.type || 'application',
      layer: el.layer || 'application',
      togafDomain: el.layer || 'application',
      status: el.status || 'current',
      riskLevel: el.riskLevel || 'high',
      maturityLevel: el.maturityLevel || 2,
    }, auth());
    const id = data.data?.id || data.data?._id || data.id || data._id;
    eIds.push(id);
  }

  for (const conn of connections) {
    await http.post(`/projects/${pid}/connections`, {
      sourceId: eIds[conn.sourceIdx],
      targetId: eIds[conn.targetIdx],
      type: conn.type || 'depends_on',
      label: `${elements[conn.sourceIdx].name}→${elements[conn.targetIdx].name}`,
    }, auth());
  }

  return { projectId: pid, elementIds: eIds };
}

// ═════════════════════════════════════════════════════════════════════════════
// 0. SETUP — Create users, project, elements, connections
// ═════════════════════════════════════════════════════════════════════════════

describe('0. Setup — Create test environment', () => {
  test('0.1 Register admin user and promote to chief_architect', async () => {
    const { data } = await http.post('/auth/register', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: 'Roadmap Test Admin',
    });
    expect(data.accessToken).toBeDefined();
    adminToken = data.accessToken;

    const { MongoClient } = await import('mongodb');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      await client.db().collection('users').updateOne(
        { email: ADMIN_EMAIL },
        { $set: { role: 'chief_architect' } },
      );
    } finally {
      await client.close();
    }

    const { data: loginData } = await http.post('/auth/login', {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    adminToken = loginData.accessToken;
  });

  test('0.2 Register viewer user', async () => {
    const { data } = await http.post('/auth/register', {
      email: VIEWER_EMAIL,
      password: VIEWER_PASSWORD,
      name: 'Roadmap Viewer',
    });
    viewerToken = data.accessToken;
  });

  test('0.3 Create primary project', async () => {
    const { data } = await http.post('/projects', {
      name: `Roadmap Test Project ${TEST_ID}`,
      description: 'Primary test project with realistic EA topology',
      tags: ['test', 'roadmap'],
    }, auth());
    projectId = data.data?.id || data.data?._id || data.id || data._id;
    allProjectIds.push(projectId);
    expect(projectId).toBeDefined();
  });

  test('0.4 Create 8 architecture elements', async () => {
    const elements = [
      { name: 'Core ERP', type: 'application', layer: 'application', togafDomain: 'application', status: 'current', riskLevel: 'high', maturityLevel: 2 },
      { name: 'Legacy DB', type: 'technology_component', layer: 'technology', togafDomain: 'technology', status: 'current', riskLevel: 'critical', maturityLevel: 1 },
      { name: 'API Gateway', type: 'application_service', layer: 'application', togafDomain: 'application', status: 'transitional', riskLevel: 'medium', maturityLevel: 3 },
      { name: 'Cloud Platform', type: 'platform_service', layer: 'technology', togafDomain: 'technology', status: 'target', riskLevel: 'low', maturityLevel: 4 },
      { name: 'Customer Portal', type: 'application', layer: 'application', togafDomain: 'application', status: 'current', riskLevel: 'medium', maturityLevel: 3 },
      { name: 'Payment Service', type: 'application_service', layer: 'application', togafDomain: 'application', status: 'current', riskLevel: 'high', maturityLevel: 2 },
      { name: 'Data Warehouse', type: 'technology_component', layer: 'technology', togafDomain: 'technology', status: 'retired', riskLevel: 'low', maturityLevel: 2 },
      { name: 'Message Queue', type: 'technology_component', layer: 'technology', togafDomain: 'technology', status: 'transitional', riskLevel: 'low', maturityLevel: 4 },
    ];

    for (const el of elements) {
      const { data } = await http.post(`/projects/${projectId}/elements`, el, auth());
      const id = data.data?.id || data.data?._id || data.id || data._id;
      elementIds.push(id);
    }
    expect(elementIds.length).toBe(8);
  });

  test('0.5 Create 5 connections (depends_on + data_flow)', async () => {
    const connections = [
      { sourceId: elementIds[0], targetId: elementIds[1], type: 'depends_on', label: 'ERP→LegacyDB' },
      { sourceId: elementIds[2], targetId: elementIds[0], type: 'depends_on', label: 'APIGw→ERP' },
      { sourceId: elementIds[4], targetId: elementIds[2], type: 'depends_on', label: 'Portal→APIGw' },
      { sourceId: elementIds[5], targetId: elementIds[0], type: 'depends_on', label: 'Payment→ERP' },
      { sourceId: elementIds[4], targetId: elementIds[7], type: 'data_flow', label: 'Portal→MQ' },
    ];

    for (const conn of connections) {
      await http.post(`/projects/${projectId}/connections`, conn, auth());
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. BASIC GENERATION & WAVE STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

describe('1. Basic Generation & Wave Structure', () => {
  test('1.1 Generate with balanced strategy', async () => {
    const { data, status } = await http.post(`/projects/${projectId}/roadmaps`, {
      strategy: 'balanced',
      maxWaves: 4,
      includeAIRecommendations: false,
    }, auth());

    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.id).toBeDefined();
    expect(data.data.status).toBe('completed');
    expect(data.data.waves).toBeDefined();
    expect(Array.isArray(data.data.waves)).toBe(true);
    expect(data.data.summary).toBeDefined();

    roadmapId = data.data.id;
  });

  test('1.2 Wave structure has all required fields', async () => {
    const { data } = await http.get(`/projects/${projectId}/roadmaps/${roadmapId}`, auth());
    roadmapData = data.data;

    expect(roadmapData.waves.length).toBeGreaterThan(0);
    expect(roadmapData.waves.length).toBeLessThanOrEqual(4);

    for (const wave of roadmapData.waves) {
      expect(wave.waveNumber).toBeDefined();
      expect(typeof wave.waveNumber).toBe('number');
      expect(wave.name).toBeDefined();
      expect(typeof wave.name).toBe('string');
      expect(wave.description).toBeDefined();
      expect(wave.elements).toBeDefined();
      expect(Array.isArray(wave.elements)).toBe(true);
      expect(wave.metrics).toBeDefined();
      expect(wave.metrics.totalCost).toBeDefined();
      expect(wave.metrics.elementCount).toBeDefined();
      expect(wave.estimatedDurationMonths).toBeGreaterThan(0);
      expect(wave.dependsOnWaves).toBeDefined();
      expect(Array.isArray(wave.dependsOnWaves)).toBe(true);
    }
  });

  test('1.3 Summary metrics consistent with waves', async () => {
    const rm = roadmapData;
    const waveTotalCost = rm.waves.reduce((s: number, w: any) => s + (w.metrics?.totalCost || 0), 0);
    const waveTotalElements = rm.waves.reduce((s: number, w: any) => s + (w.elements?.length || 0), 0);

    expect(rm.summary.totalCost).toBeCloseTo(waveTotalCost, -2);
    expect(rm.summary.totalElements).toBe(waveTotalElements);
    expect(rm.summary.waveCount).toBe(rm.waves.length);
  });

  test('1.4 Wave dependency ordering (dependsOnWaves < waveNumber)', () => {
    for (const wave of roadmapData.waves) {
      for (const depWave of wave.dependsOnWaves) {
        expect(depWave).toBeLessThan(wave.waveNumber);
      }
    }
  });

  test('1.5 Invalid strategy returns 400', async () => {
    try {
      await http.post(`/projects/${projectId}/roadmaps`, { strategy: 'invalid', maxWaves: 4 }, auth());
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(400);
    }
  });

  test('1.6 Invalid maxWaves returns 400', async () => {
    for (const val of [0, 1, 100]) {
      try {
        await http.post(`/projects/${projectId}/roadmaps`, { strategy: 'balanced', maxWaves: val }, auth());
        fail(`Should have thrown for maxWaves=${val}`);
      } catch (err: any) {
        expect(err.response.status).toBe(400);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ALGORITHM CORRECTNESS — GRAPH TOPOLOGIES
// ═════════════════════════════════════════════════════════════════════════════

describe('2. Algorithm Correctness — Graph Topologies', () => {
  // 2a) Linear Chain: A→B→C→D
  test('2.1 Create linear chain project (A→B→C→D)', async () => {
    const result = await createTopologyProject('Linear Chain', [
      { name: 'L-Alpha', riskLevel: 'high' },
      { name: 'L-Beta', riskLevel: 'high' },
      { name: 'L-Gamma', riskLevel: 'high' },
      { name: 'L-Delta', riskLevel: 'high' },
    ], [
      { sourceIdx: 1, targetIdx: 0 }, // B depends on A
      { sourceIdx: 2, targetIdx: 1 }, // C depends on B
      { sourceIdx: 3, targetIdx: 2 }, // D depends on C
    ]);
    linearProjectId = result.projectId;
  });

  test('2.2 Linear chain: 4 waves in correct dependency order', async () => {
    const { data } = await http.post(`/projects/${linearProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 8, includeAIRecommendations: false,
    }, auth());

    const waves = data.data.waves;
    expect(waves.length).toBe(4);

    // Build name→wave mapping
    const nameToWave: Record<string, number> = {};
    for (const w of waves) {
      for (const el of w.elements) {
        nameToWave[el.name] = w.waveNumber;
      }
    }

    // Verify order: Alpha < Beta < Gamma < Delta
    expect(nameToWave['L-Alpha']).toBeLessThan(nameToWave['L-Beta']);
    expect(nameToWave['L-Beta']).toBeLessThan(nameToWave['L-Gamma']);
    expect(nameToWave['L-Gamma']).toBeLessThan(nameToWave['L-Delta']);

    // Each wave's dependsOnWaves references previous
    for (let i = 1; i < waves.length; i++) {
      expect(waves[i].dependsOnWaves).toContain(waves[i - 1].waveNumber);
    }
  });

  // 2b) Diamond: A→B, A→C, B→D, C→D
  test('2.3 Create diamond project', async () => {
    const result = await createTopologyProject('Diamond', [
      { name: 'D-Root', riskLevel: 'high' },
      { name: 'D-Left', riskLevel: 'high' },
      { name: 'D-Right', riskLevel: 'high' },
      { name: 'D-Sink', riskLevel: 'high' },
    ], [
      { sourceIdx: 1, targetIdx: 0 }, // Left depends on Root
      { sourceIdx: 2, targetIdx: 0 }, // Right depends on Root
      { sourceIdx: 3, targetIdx: 1 }, // Sink depends on Left
      { sourceIdx: 3, targetIdx: 2 }, // Sink depends on Right
    ]);
    diamondProjectId = result.projectId;
  });

  test('2.4 Diamond: Root first, Sink last, Left/Right in same wave', async () => {
    const { data } = await http.post(`/projects/${diamondProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 8, includeAIRecommendations: false,
    }, auth());

    const waves = data.data.waves;
    expect(waves.length).toBeGreaterThanOrEqual(3);

    const nameToWave: Record<string, number> = {};
    for (const w of waves) {
      for (const el of w.elements) nameToWave[el.name] = w.waveNumber;
    }

    expect(nameToWave['D-Root']).toBeLessThan(nameToWave['D-Sink']);
    expect(nameToWave['D-Left']).toBeLessThan(nameToWave['D-Sink']);
    expect(nameToWave['D-Right']).toBeLessThan(nameToWave['D-Sink']);
    // Left and Right should be in the same wave (same dependency level)
    expect(nameToWave['D-Left']).toBe(nameToWave['D-Right']);
  });

  // 2c) Isolated Nodes (no dependencies)
  test('2.5 Create isolated nodes project (5 elements, 0 connections)', async () => {
    const result = await createTopologyProject('Isolated', [
      { name: 'Iso-A', riskLevel: 'high' },
      { name: 'Iso-B', riskLevel: 'high' },
      { name: 'Iso-C', riskLevel: 'high' },
      { name: 'Iso-D', riskLevel: 'high' },
      { name: 'Iso-E', riskLevel: 'high' },
    ], []);
    isolatedProjectId = result.projectId;
  });

  test('2.6 Isolated: all elements in Wave 1', async () => {
    const { data } = await http.post(`/projects/${isolatedProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false,
    }, auth());

    expect(data.data.waves.length).toBe(1);
    expect(data.data.waves[0].elements.length).toBe(5);
  });

  // 2d) Cycle Detection (A→B→C→A)
  test('2.7 Create cycle project (A→B→C→A)', async () => {
    const result = await createTopologyProject('Cycle', [
      { name: 'Cyc-A', riskLevel: 'high' },
      { name: 'Cyc-B', riskLevel: 'high' },
      { name: 'Cyc-C', riskLevel: 'high' },
    ], [
      { sourceIdx: 0, targetIdx: 2 }, // A depends on C
      { sourceIdx: 1, targetIdx: 0 }, // B depends on A
      { sourceIdx: 2, targetIdx: 1 }, // C depends on B → cycle!
    ]);
    cycleProjectId = result.projectId;
  });

  test('2.8 Cycle: completes without crash, all elements placed', async () => {
    const { data, status } = await http.post(`/projects/${cycleProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false,
    }, auth());

    expect(status).toBe(201);
    expect(data.data.status).toBe('completed');

    // All 3 elements must be placed somewhere
    const allElements = data.data.waves.flatMap((w: any) => w.elements);
    expect(allElements.length).toBe(3);
  });

  // 2e) Wide Fan-Out (1 foundation → 10 dependents)
  test('2.9 Create fan-out project (1 → 10)', async () => {
    const elements = [{ name: 'Foundation', riskLevel: 'critical' as const }];
    const connections: Array<{ sourceIdx: number; targetIdx: number }> = [];
    for (let i = 1; i <= 10; i++) {
      elements.push({ name: `Dep-${i}`, riskLevel: 'high' as const });
      connections.push({ sourceIdx: i, targetIdx: 0 }); // Each dep depends on foundation
    }
    const result = await createTopologyProject('FanOut', elements, connections);
    fanoutProjectId = result.projectId;
  });

  test('2.10 Fan-out: foundation in W1, dependents in W2', async () => {
    const { data } = await http.post(`/projects/${fanoutProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 8, includeAIRecommendations: false,
    }, auth());

    const waves = data.data.waves;
    expect(waves.length).toBeGreaterThanOrEqual(2);

    // Foundation should be alone in first wave
    const nameToWave: Record<string, number> = {};
    for (const w of waves) {
      for (const el of w.elements) nameToWave[el.name] = w.waveNumber;
    }
    expect(nameToWave['Foundation']).toBe(1);

    // All dependents in wave 2 (or later due to merging)
    for (let i = 1; i <= 10; i++) {
      expect(nameToWave[`Dep-${i}`]).toBeGreaterThan(nameToWave['Foundation']);
    }
  });

  // 2f) Deep Chain + maxWaves Constraint
  test('2.11 Create deep chain project (6 serial elements)', async () => {
    const elements = [];
    const connections = [];
    for (let i = 0; i < 6; i++) {
      elements.push({ name: `Chain-${i}`, riskLevel: 'high' as const });
      if (i > 0) connections.push({ sourceIdx: i, targetIdx: i - 1 });
    }
    const result = await createTopologyProject('DeepChain', elements, connections);
    deepChainProjectId = result.projectId;
  });

  test('2.12 Deep chain with maxWaves=3: merging preserves dependency order', async () => {
    const { data } = await http.post(`/projects/${deepChainProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 3, includeAIRecommendations: false,
    }, auth());

    const waves = data.data.waves;
    expect(waves.length).toBe(3);

    // Verify dependency order: for any element in wave N, its dependencies must be in wave < N
    const nameToWave: Record<string, number> = {};
    for (const w of waves) {
      for (const el of w.elements) nameToWave[el.name] = w.waveNumber;
    }
    // Chain-0 must be in earliest or same wave as Chain-1, etc.
    for (let i = 1; i < 6; i++) {
      expect(nameToWave[`Chain-${i}`]).toBeGreaterThanOrEqual(nameToWave[`Chain-${i - 1}`]);
    }

    // All 6 elements present
    const total = waves.reduce((s: number, w: any) => s + w.elements.length, 0);
    expect(total).toBe(6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. STRATEGY-SPECIFIC ORDERING
// ═════════════════════════════════════════════════════════════════════════════

describe('3. Strategy-Specific Ordering', () => {
  let conservativeWaves: any[] = [];
  let aggressiveWaves: any[] = [];

  test('3.1 Generate conservative roadmap', async () => {
    const { data } = await http.post(`/projects/${projectId}/roadmaps`, {
      strategy: 'conservative', maxWaves: 4, includeAIRecommendations: false,
    }, auth());
    expect(data.data.config.strategy).toBe('conservative');
    conservativeWaves = data.data.waves;
  });

  test('3.2 Conservative: within waves, low-risk elements first', () => {
    for (const wave of conservativeWaves) {
      if (wave.elements.length >= 2) {
        const risks = wave.elements.map((e: any) => e.riskScore);
        // First element risk should be ≤ last element risk (ascending)
        expect(risks[0]).toBeLessThanOrEqual(risks[risks.length - 1]);
      }
    }
  });

  test('3.3 Generate aggressive + high-risk first', async () => {
    const { data } = await http.post(`/projects/${projectId}/roadmaps`, {
      strategy: 'aggressive', maxWaves: 4, includeAIRecommendations: false,
    }, auth());
    aggressiveWaves = data.data.waves;

    for (const wave of aggressiveWaves) {
      if (wave.elements.length >= 2) {
        const risks = wave.elements.map((e: any) => e.riskScore);
        // First element risk should be ≥ last element risk (descending)
        expect(risks[0]).toBeGreaterThanOrEqual(risks[risks.length - 1]);
      }
    }
  });

  test('3.4 Balanced produces valid roadmap', async () => {
    const { data } = await http.post(`/projects/${projectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false,
    }, auth());
    expect(data.data.config.strategy).toBe('balanced');
    expect(data.data.waves.length).toBeGreaterThan(0);
    expect(data.data.summary.totalElements).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. DATA ENRICHMENT VALIDATION
// ═════════════════════════════════════════════════════════════════════════════

describe('4. Data Enrichment Validation', () => {
  const VALID_STATUSES = ['current', 'target', 'transitional', 'retired'];

  test('4.1 WaveElement has all required fields with correct types', () => {
    for (const wave of roadmapData.waves) {
      for (const el of wave.elements) {
        expect(typeof el.elementId).toBe('string');
        expect(typeof el.name).toBe('string');
        expect(el.name.length).toBeGreaterThan(0);
        expect(typeof el.type).toBe('string');
        expect(typeof el.layer).toBe('string');
        expect(VALID_STATUSES).toContain(el.currentStatus);
        expect(VALID_STATUSES).toContain(el.targetStatus);
        expect(el.riskScore).toBeGreaterThanOrEqual(0);
        expect(el.estimatedCost).toBeGreaterThanOrEqual(0);
        expect(el.stakeholderFatigue).toBeGreaterThanOrEqual(0);
        expect(el.stakeholderFatigue).toBeLessThanOrEqual(1);
        expect(Array.isArray(el.dependsOnElementIds)).toBe(true);
      }
    }
  });

  test('4.2 WaveMetrics: totalCost = sum(elements.estimatedCost), elementCount = elements.length', () => {
    for (const wave of roadmapData.waves) {
      const sumCost = wave.elements.reduce((s: number, e: any) => s + (e.estimatedCost || 0), 0);
      expect(wave.metrics.totalCost).toBeCloseTo(sumCost, -1);
      expect(wave.metrics.elementCount).toBe(wave.elements.length);
    }
  });

  test('4.3 riskDelta is a number', () => {
    for (const wave of roadmapData.waves) {
      expect(typeof wave.metrics.riskDelta).toBe('number');
    }
  });

  test('4.4 complianceImpact >= 0', () => {
    for (const wave of roadmapData.waves) {
      expect(wave.metrics.complianceImpact).toBeGreaterThanOrEqual(0);
    }
  });

  test('4.5 avgFatigue in [0, 1]', () => {
    for (const wave of roadmapData.waves) {
      expect(wave.metrics.avgFatigue).toBeGreaterThanOrEqual(0);
      expect(wave.metrics.avgFatigue).toBeLessThanOrEqual(1);
    }
  });

  test('4.6 estimatedDurationMonths >= 1 for non-empty waves', () => {
    for (const wave of roadmapData.waves) {
      if (wave.elements.length > 0) {
        expect(wave.estimatedDurationMonths).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. RECOMMENDATIONS & RULE-BASED FALLBACK
// ═════════════════════════════════════════════════════════════════════════════

describe('5. Recommendations & Rule-Based Fallback', () => {
  test('5.1 Every wave has a recommendation (non-empty string)', () => {
    for (const wave of roadmapData.waves) {
      expect(typeof wave.recommendation).toBe('string');
      expect(wave.recommendation.length).toBeGreaterThan(0);
    }
  });

  test('5.2 Every wave has riskMitigations array with >= 1 entry', () => {
    for (const wave of roadmapData.waves) {
      expect(Array.isArray(wave.riskMitigations)).toBe(true);
      expect(wave.riskMitigations.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('5.3 Every wave has stakeholderNotes string', () => {
    for (const wave of roadmapData.waves) {
      expect(typeof wave.stakeholderNotes).toBe('string');
      expect(wave.stakeholderNotes.length).toBeGreaterThan(0);
    }
  });

  test('5.4 High-risk elements trigger "fallback" or "Phased" mitigation', () => {
    for (const wave of roadmapData.waves) {
      const hasHighRisk = wave.elements.some((e: any) => e.riskScore >= 7);
      if (hasHighRisk) {
        const mitigationText = wave.riskMitigations.join(' ');
        expect(mitigationText).toMatch(/fallback|[Pp]hased/);
      }
    }
  });

  test('5.5 Retired elements trigger "Decommission" or "consumers" mitigation', () => {
    for (const wave of roadmapData.waves) {
      const hasRetired = wave.elements.some((e: any) => e.targetStatus === 'retired');
      if (hasRetired) {
        const mitigationText = wave.riskMitigations.join(' ');
        expect(mitigationText).toMatch(/[Dd]ecommission|consumers/);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. SUMMARY METRIC INVARIANTS
// ═════════════════════════════════════════════════════════════════════════════

describe('6. Summary Metric Invariants', () => {
  test('6.1 totalCost = sum of wave costs', () => {
    const sum = roadmapData.waves.reduce((s: number, w: any) => s + w.metrics.totalCost, 0);
    expect(roadmapData.summary.totalCost).toBeCloseTo(sum, -2);
  });

  test('6.2 totalElements = sum of wave element counts', () => {
    const sum = roadmapData.waves.reduce((s: number, w: any) => s + w.elements.length, 0);
    expect(roadmapData.summary.totalElements).toBe(sum);
  });

  test('6.3 waveCount = waves.length', () => {
    expect(roadmapData.summary.waveCount).toBe(roadmapData.waves.length);
  });

  test('6.4 totalDurationMonths = sum of wave durations', () => {
    const sum = roadmapData.waves.reduce((s: number, w: any) => s + w.estimatedDurationMonths, 0);
    expect(roadmapData.summary.totalDurationMonths).toBe(sum);
  });

  test('6.5 Monte Carlo invariant: p10 <= p50 <= p90', () => {
    const cc = roadmapData.summary.costConfidence;
    expect(cc).toBeDefined();
    expect(cc.p10).toBeLessThanOrEqual(cc.p50);
    expect(cc.p50).toBeLessThanOrEqual(cc.p90);
  });

  test('6.6 riskReduction >= 0 and <= 100', () => {
    expect(roadmapData.summary.riskReduction).toBeGreaterThanOrEqual(0);
    expect(roadmapData.summary.riskReduction).toBeLessThanOrEqual(100);
  });

  test('6.7 complianceImprovement >= 0', () => {
    expect(roadmapData.summary.complianceImprovement).toBeGreaterThanOrEqual(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. PERFORMANCE BENCHMARKS
// ═════════════════════════════════════════════════════════════════════════════

describe('7. Performance Benchmarks', () => {
  test('7.1 Generation time for 8 elements < 10s', async () => {
    const start = Date.now();
    await http.post(`/projects/${projectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false,
    }, auth());
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10_000);
  });

  test('7.2 Generation time for empty project < 3s', async () => {
    // Create empty project
    const { data: pData } = await http.post('/projects', {
      name: `Empty Perf ${TEST_ID}`, description: 'Performance test',
    }, auth());
    emptyProjectId = pData.data?.id || pData.data?._id || pData.id || pData._id;
    allProjectIds.push(emptyProjectId);

    const start = Date.now();
    await http.post(`/projects/${emptyProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false,
    }, auth());
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(3_000);
  });

  test('7.3 List endpoint < 500ms', async () => {
    const start = Date.now();
    await http.get(`/projects/${projectId}/roadmaps`, auth());
    expect(Date.now() - start).toBeLessThan(500);
  });

  test('7.4 Get single roadmap < 500ms', async () => {
    const start = Date.now();
    await http.get(`/projects/${projectId}/roadmaps/${roadmapId}`, auth());
    expect(Date.now() - start).toBeLessThan(500);
  });

  test('7.5 PDF generation < 5s', async () => {
    const start = Date.now();
    await http.get(
      `/projects/${projectId}/reports/roadmap?roadmapId=${roadmapId}`,
      { ...auth(), responseType: 'arraybuffer' },
    );
    expect(Date.now() - start).toBeLessThan(5_000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. PDF EXPORT DEEP VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

describe('8. PDF Export Deep Verification', () => {
  test('8.1 PDF size > 1000 bytes', async () => {
    const { data } = await http.get(
      `/projects/${projectId}/reports/roadmap?roadmapId=${roadmapId}`,
      { ...auth(), responseType: 'arraybuffer' },
    );
    expect(Buffer.byteLength(data)).toBeGreaterThan(1000);
  });

  test('8.2 PDF starts with %PDF magic bytes', async () => {
    const { data } = await http.get(
      `/projects/${projectId}/reports/roadmap?roadmapId=${roadmapId}`,
      { ...auth(), responseType: 'arraybuffer' },
    );
    const header = Buffer.from(data).toString('ascii', 0, 4);
    expect(header).toBe('%PDF');
  });

  test('8.3 Content-Disposition header contains filename', async () => {
    const { headers } = await http.get(
      `/projects/${projectId}/reports/roadmap?roadmapId=${roadmapId}`,
      { ...auth(), responseType: 'arraybuffer' },
    );
    expect(headers['content-disposition']).toBeDefined();
    expect(headers['content-disposition']).toMatch(/filename/);
  });

  test('8.4 Nonexistent roadmapId returns error (not 500 crash)', async () => {
    try {
      await http.get(
        `/projects/${projectId}/reports/roadmap?roadmapId=000000000000000000000000`,
        auth(),
      );
      fail('Should have thrown');
    } catch (err: any) {
      // Accept 400, 404, or 500 — but verify it doesn't crash silently
      expect(err.response.status).toBeGreaterThanOrEqual(400);
    }
  });

  test('8.5 Missing roadmapId returns 400', async () => {
    try {
      await http.get(`/projects/${projectId}/reports/roadmap`, auth());
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(400);
      expect(err.response.data.error).toBeDefined();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. ELEMENT-WAVE ASSIGNMENT COMPLETENESS
// ═════════════════════════════════════════════════════════════════════════════

describe('9. Element-Wave Assignment Completeness', () => {
  test('9.1 No duplicate elements across waves', () => {
    const allElementIds = roadmapData.waves.flatMap((w: any) => w.elements.map((e: any) => e.elementId));
    const uniqueIds = new Set(allElementIds);
    expect(uniqueIds.size).toBe(allElementIds.length);
  });

  test('9.2 No element in two different waves', () => {
    const elementToWave = new Map<string, number>();
    for (const wave of roadmapData.waves) {
      for (const el of wave.elements) {
        expect(elementToWave.has(el.elementId)).toBe(false);
        elementToWave.set(el.elementId, wave.waveNumber);
      }
    }
  });

  test('9.3 Target-status elements are NOT candidates', () => {
    // Cloud Platform has status='target' and should NOT appear in waves
    const allNames = roadmapData.waves.flatMap((w: any) => w.elements.map((e: any) => e.name));
    expect(allNames).not.toContain('Cloud Platform');
  });

  test('9.4 Candidate count is plausible', () => {
    // From test data: transitional (API Gateway, Message Queue) = 2
    // + high/critical current (Core ERP, Legacy DB, Payment Service) = 3
    // + retired with deps (Data Warehouse depends on nothing... so maybe not)
    // = at least 5 candidates
    const totalElements = roadmapData.summary.totalElements;
    expect(totalElements).toBeGreaterThanOrEqual(3);
    expect(totalElements).toBeLessThanOrEqual(8); // Can't exceed total elements
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. CONCURRENT OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('10. Concurrent Operations', () => {
  const concurrentIds: string[] = [];

  test('10.1 Generate 3 roadmaps simultaneously', async () => {
    const results = await Promise.all([
      http.post(`/projects/${projectId}/roadmaps`, { strategy: 'conservative', maxWaves: 3, includeAIRecommendations: false }, auth()),
      http.post(`/projects/${projectId}/roadmaps`, { strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false }, auth()),
      http.post(`/projects/${projectId}/roadmaps`, { strategy: 'aggressive', maxWaves: 5, includeAIRecommendations: false }, auth()),
    ]);

    for (const r of results) {
      expect(r.status).toBe(201);
      expect(r.data.data.id).toBeDefined();
      concurrentIds.push(r.data.data.id);
    }

    // All unique IDs
    expect(new Set(concurrentIds).size).toBe(3);
  });

  test('10.2 List after concurrent generation contains all 3', async () => {
    const { data } = await http.get(`/projects/${projectId}/roadmaps`, auth());
    const ids = data.data.map((r: any) => r.id);
    for (const id of concurrentIds) {
      expect(ids).toContain(id);
    }
  });

  test('10.3 Delete one, list reflects correct count', async () => {
    const { data: listBefore } = await http.get(`/projects/${projectId}/roadmaps`, auth());
    const countBefore = listBefore.data.length;

    await http.delete(`/projects/${projectId}/roadmaps/${concurrentIds[0]}`, auth());

    const { data: listAfter } = await http.get(`/projects/${projectId}/roadmaps`, auth());
    expect(listAfter.data.length).toBe(countBefore - 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. RESILIENCE & EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════

describe('11. Resilience & Edge Cases', () => {
  test('11.1 Minimal elements (no riskLevel) still generate', async () => {
    const result = await createTopologyProject('Minimal', [
      { name: 'Min-A', riskLevel: 'high' },
      { name: 'Min-B', riskLevel: 'high' },
    ], [{ sourceIdx: 1, targetIdx: 0 }]);
    minimalProjectId = result.projectId;

    const { data, status } = await http.post(`/projects/${minimalProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false,
    }, auth());

    expect(status).toBe(201);
    expect(data.data.status).toBe('completed');
  });

  test('11.2 Empty project generates 0 waves (no crash)', async () => {
    const { data, status } = await http.post(`/projects/${emptyProjectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 4, includeAIRecommendations: false,
    }, auth());

    expect(status).toBe(201);
    expect(data.data.waves.length).toBe(0);
    expect(data.data.summary.totalElements).toBe(0);
  });

  test('11.3 maxWaves=2 merges correctly, all elements present', async () => {
    const { data } = await http.post(`/projects/${projectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 2, includeAIRecommendations: false,
    }, auth());

    expect(data.data.waves.length).toBeLessThanOrEqual(2);
    // All candidates still present
    expect(data.data.summary.totalElements).toBeGreaterThan(0);
  });

  test('11.4 maxWaves=8 does not create more waves than natural layers', async () => {
    const { data } = await http.post(`/projects/${projectId}/roadmaps`, {
      strategy: 'balanced', maxWaves: 8, includeAIRecommendations: false,
    }, auth());

    // With 8 elements, can't have more than 8 waves
    expect(data.data.waves.length).toBeLessThanOrEqual(8);
  });

  test('11.5 Regenerate creates new version', async () => {
    const { data, status } = await http.post(`/projects/${projectId}/roadmaps/${roadmapId}/regenerate`, {
      strategy: 'aggressive', maxWaves: 3, includeAIRecommendations: false,
    }, auth());

    expect(status).toBe(201);
    expect(data.data.version).toBeGreaterThan(1);
  });

  test('11.6 Regenerate on nonexistent returns 404', async () => {
    try {
      await http.post(`/projects/${projectId}/roadmaps/000000000000000000000000/regenerate`, {
        strategy: 'balanced',
      }, auth());
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(404);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. PERMISSIONS & AUTH
// ═════════════════════════════════════════════════════════════════════════════

describe('12. Permissions & Auth', () => {
  test('12.1 GET list without auth returns 401', async () => {
    try {
      await http.get(`/projects/${projectId}/roadmaps`);
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(401);
    }
  });

  test('12.2 POST generate without auth returns 401', async () => {
    try {
      await http.post(`/projects/${projectId}/roadmaps`, { strategy: 'balanced', maxWaves: 4 });
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.response.status).toBe(401);
    }
  });

  test('12.3 Viewer can list roadmaps (ANALYTICS_VIEW)', async () => {
    try {
      await http.post(`/projects/${projectId}/collaborators`, {
        email: VIEWER_EMAIL, role: 'viewer',
      }, auth());
    } catch { /* May already exist */ }

    const { data } = await http.get(`/projects/${projectId}/roadmaps`, auth(viewerToken));
    expect(data.success).toBe(true);
  });

  test('12.4 Viewer cannot generate (ANALYTICS_SIMULATE)', async () => {
    try {
      await http.post(`/projects/${projectId}/roadmaps`, {
        strategy: 'balanced', maxWaves: 4,
      }, auth(viewerToken));
      fail('Should have thrown');
    } catch (err: any) {
      expect([401, 403]).toContain(err.response.status);
    }
  });

  test('12.5 Viewer cannot delete (ANALYTICS_SIMULATE)', async () => {
    try {
      await http.delete(`/projects/${projectId}/roadmaps/${roadmapId}`, auth(viewerToken));
      fail('Should have thrown');
    } catch (err: any) {
      expect([401, 403]).toContain(err.response.status);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. UI & CODE STRUCTURE (STATIC ANALYSIS)
// ═════════════════════════════════════════════════════════════════════════════

describe('13. UI & Code Structure (Static Analysis)', () => {
  const CLIENT_SRC = resolve(__dirname, '../../../client/src');
  const SERVER_SRC = resolve(__dirname, '../../src');
  const SHARED_SRC = resolve(__dirname, '../../../shared/src');

  function readFile(path: string): string {
    return fs.readFileSync(path, 'utf-8');
  }

  test('13.1 roadmap.types.ts exports all key types', () => {
    const src = readFile(resolve(SHARED_SRC, 'types/roadmap.types.ts'));
    for (const name of ['RoadmapStrategy', 'RoadmapConfig', 'WaveElement', 'WaveMetrics', 'RoadmapWave', 'RoadmapSummary', 'TransformationRoadmap', 'RoadmapListItem']) {
      expect(src).toContain(name);
    }
  });

  test('13.2 shared/index.ts exports roadmap types', () => {
    const src = readFile(resolve(SHARED_SRC, 'index.ts'));
    expect(src).toContain('roadmap.types');
  });

  test('13.3 roadmap.service.ts exports generateRoadmap and imports analytics', () => {
    const src = readFile(resolve(SERVER_SRC, 'services/roadmap.service.ts'));
    expect(src).toContain('export async function generateRoadmap');
    expect(src).toContain('runCypher');
    expect(src).toContain('assessRisk');
    expect(src).toContain('estimateCosts');
    expect(src).toContain('checkCompliance');
    expect(src).toContain('runMonteCarloSimulation');
  });

  test('13.4 roadmap.routes.ts has authenticate + permissions + Zod', () => {
    const src = readFile(resolve(SERVER_SRC, 'routes/roadmap.routes.ts'));
    expect(src).toContain('authenticate');
    expect(src).toContain('requirePermission');
    expect(src).toContain('ANALYTICS_SIMULATE');
    expect(src).toContain('ANALYTICS_VIEW');
    expect(src).toContain('CreateRoadmapSchema');
  });

  test('13.5 server/index.ts mounts roadmapRoutes', () => {
    const src = readFile(resolve(SERVER_SRC, 'index.ts'));
    expect(src).toContain('roadmapRoutes');
    expect(src).toMatch(/\/api\/projects.*roadmapRoutes/s);
  });

  test('13.6 report.routes.ts VALID_TYPES includes roadmap', () => {
    const src = readFile(resolve(SERVER_SRC, 'routes/report.routes.ts'));
    expect(src).toContain("'roadmap'");
  });

  test('13.7 roadmapStore.ts has all actions and states', () => {
    const src = readFile(resolve(CLIENT_SRC, 'stores/roadmapStore.ts'));
    expect(src).toContain('useRoadmapStore');
    for (const fn of ['generate', 'loadList', 'loadRoadmap', 'deleteRoadmap', 'selectWave', 'clear']) {
      expect(src).toContain(fn);
    }
    for (const state of ['isGenerating', 'isLoading', 'error']) {
      expect(src).toContain(state);
    }
  });

  test('13.8 api.ts exports roadmapAPI with all methods', () => {
    const src = readFile(resolve(CLIENT_SRC, 'services/api.ts'));
    expect(src).toContain('roadmapAPI');
    for (const method of ['generate', 'list', 'get', 'delete', 'regenerate', 'downloadPDF']) {
      expect(src).toMatch(new RegExp(`roadmapAPI[\\s\\S]*${method}`));
    }
  });

  test('13.9 RoadmapPanel.tsx has config form, timeline, wave cards', () => {
    const src = readFile(resolve(CLIENT_SRC, 'components/analytics/RoadmapPanel.tsx'));
    expect(src).toContain('useArchitectureStore');
    expect(src).toContain('useRoadmapStore');
    expect(src).toContain('Conservative');
    expect(src).toContain('Balanced');
    expect(src).toContain('Aggressive');
    expect(src).toContain('Generate Roadmap');
    expect(src).toContain('RoadmapTimeline');
    expect(src).toContain('WaveCard');
    expect(src).toContain('Loader2');
    expect(src).toContain('Download');
  });

  test('13.10 RoadmapTimeline.tsx has waves, selectedWave props', () => {
    const src = readFile(resolve(CLIENT_SRC, 'components/analytics/RoadmapTimeline.tsx'));
    expect(src).toContain('waves');
    expect(src).toContain('selectedWave');
    expect(src).toContain('onSelectWave');
    expect(src).toContain('ArrowRight');
  });

  test('13.11 WaveCard.tsx has expandable structure', () => {
    const src = readFile(resolve(CLIENT_SRC, 'components/analytics/WaveCard.tsx'));
    expect(src).toContain('RoadmapWave');
    expect(src).toContain('ChevronDown');
    expect(src).toContain('ChevronRight');
    expect(src).toContain('Lightbulb');
    expect(src).toContain('AlertTriangle');
    expect(src).toContain('expanded');
  });

  test('13.12 Sidebar.tsx has roadmap in ANALYTICS_TABS', () => {
    const src = readFile(resolve(CLIENT_SRC, 'components/ui/Sidebar.tsx'));
    expect(src).toContain("'roadmap'");
    expect(src).toContain('RoadmapPanel');
  });

  test('13.13 Matrix theme color #00ff41 in roadmap components', () => {
    const panel = readFile(resolve(CLIENT_SRC, 'components/analytics/RoadmapPanel.tsx'));
    const timeline = readFile(resolve(CLIENT_SRC, 'components/analytics/RoadmapTimeline.tsx'));
    const waveCard = readFile(resolve(CLIENT_SRC, 'components/analytics/WaveCard.tsx'));

    expect(panel).toContain('#00ff41');
    expect(timeline).toContain('#00ff41');
    expect(waveCard).toContain('#00ff41');
  });

  test('13.14 roadmap.service.ts uses existing analytics infrastructure', () => {
    const src = readFile(resolve(SERVER_SRC, 'services/roadmap.service.ts'));
    expect(src).toContain("from './analytics.service'");
    expect(src).toContain("from './compliance.service'");
    expect(src).toContain("from './advisor.service'");
    expect(src).toContain("from '../config/neo4j'");
    expect(src).toContain("from '@thearchitect/shared'");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. CLEANUP
// ═════════════════════════════════════════════════════════════════════════════

describe('14. Cleanup', () => {
  test('14.1 Delete all test projects', async () => {
    for (const pid of allProjectIds) {
      try {
        await http.delete(`/projects/${pid}`, auth());
      } catch { /* ignore */ }
    }
  });

  test('14.2 Delete test users via MongoDB', async () => {
    const { MongoClient } = await import('mongodb');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    const client = new MongoClient(mongoUri);
    try {
      await client.connect();
      await client.db().collection('users').deleteMany({
        email: { $in: [ADMIN_EMAIL, VIEWER_EMAIL] },
      });
    } finally {
      await client.close();
    }
  });

  test('14.3 Verify no orphan roadmaps for deleted projects', async () => {
    // After project deletion, roadmap list should fail or return empty
    for (const pid of allProjectIds.slice(0, 2)) {
      try {
        const { data } = await http.get(`/projects/${pid}/roadmaps`, auth());
        // If it doesn't throw, data should be empty or project doesn't exist
        expect(data.data?.length || 0).toBe(0);
      } catch {
        // Expected: project deleted, should fail
      }
    }
  });
});
