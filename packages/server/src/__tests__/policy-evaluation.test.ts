// packages/server/src/__tests__/policy-evaluation.test.ts
// UC-GOV-001: Policy-as-Data — Integration Tests
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Policy, IPolicy } from '../models/Policy';
import { PolicyViolation } from '../models/PolicyViolation';
import { evaluateRule, elementMatchesScope, getFieldValue } from '../services/compliance.service';
import { SEED_POLICIES } from '../data/seed-policies';

// ─── Mock Neo4j + WebSocket (not available in test env) ───

jest.mock('../config/neo4j', () => ({
  runCypher: jest.fn().mockResolvedValue([]),
  runCypherTransaction: jest.fn().mockResolvedValue([]),
}));

jest.mock('../websocket/socketServer', () => ({
  getIO: jest.fn().mockReturnValue({
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  }),
}));

jest.mock('../services/policy-graph.service', () => ({
  syncPolicyToNeo4j: jest.fn().mockResolvedValue(undefined),
  syncPolicyInfluenceRelationships: jest.fn().mockResolvedValue(undefined),
  removePolicyFromNeo4j: jest.fn().mockResolvedValue(undefined),
  syncViolationToNeo4j: jest.fn().mockResolvedValue(undefined),
  removeViolationFromNeo4j: jest.fn().mockResolvedValue(undefined),
}));

// Mock loadElement/loadProjectElements in evaluation service
const mockRunCypher = jest.requireMock('../config/neo4j').runCypher as jest.Mock;

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Policy.deleteMany({});
  await PolicyViolation.deleteMany({});
  mockRunCypher.mockReset().mockResolvedValue([]);
});

const PROJECT_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

// ─── Helper: create a policy ───
function createPolicyDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    projectId: PROJECT_ID,
    name: 'Test Policy',
    description: 'Test description',
    category: 'architecture',
    framework: 'TOGAF 10',
    severity: 'warning' as const,
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [{ field: 'description', operator: 'exists', value: true, message: 'Description required' }],
    createdBy: USER_ID,
    ...overrides,
  };
}

// ─── Helper: build a fake Neo4j element record ───
function fakeNeo4jRecord(data: Record<string, unknown>) {
  return {
    get: (key: string) => data[key] ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// 1. Policy Model — new fields (status, source, version)
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: Policy Model Extensions', () => {
  it('creates a policy with default status=active, source=custom, version=1', async () => {
    const policy = await Policy.create(createPolicyDoc());
    expect(policy.status).toBe('active');
    expect(policy.source).toBe('custom');
    expect(policy.version).toBe(1);
  });

  it('creates a policy with explicit status=draft and source=dora', async () => {
    const policy = await Policy.create(createPolicyDoc({
      status: 'draft',
      source: 'dora',
      name: 'DORA Draft Policy',
    }));
    expect(policy.status).toBe('draft');
    expect(policy.source).toBe('dora');
    expect(policy.enabled).toBe(true);
  });

  it('supports effectiveFrom and effectiveUntil dates', async () => {
    const from = new Date('2026-01-01');
    const until = new Date('2026-12-31');
    const policy = await Policy.create(createPolicyDoc({
      effectiveFrom: from,
      effectiveUntil: until,
      name: 'Dated Policy',
    }));
    expect(policy.effectiveFrom).toEqual(from);
    expect(policy.effectiveUntil).toEqual(until);
  });

  it('increments version on update', async () => {
    const policy = await Policy.create(createPolicyDoc({ name: 'Versioned' }));
    expect(policy.version).toBe(1);

    await Policy.findByIdAndUpdate(policy._id, {
      $inc: { version: 1 },
      $set: { updatedBy: USER_ID, description: 'Updated' },
    });
    const updated = await Policy.findById(policy._id);
    expect(updated!.version).toBe(2);
    expect(updated!.updatedBy!.toString()).toBe(USER_ID.toString());
  });

  it('backward compatible: enabled=true + status=active is evaluatable', async () => {
    await Policy.create(createPolicyDoc({ name: 'Active Enabled' }));
    await Policy.create(createPolicyDoc({ name: 'Draft', status: 'draft' }));
    await Policy.create(createPolicyDoc({ name: 'Disabled', enabled: false }));
    await Policy.create(createPolicyDoc({ name: 'Archived', status: 'archived', enabled: false }));

    const evaluatable = await Policy.find({
      projectId: PROJECT_ID,
      enabled: true,
      status: { $in: ['active', undefined, null] },
    });
    expect(evaluatable).toHaveLength(1);
    expect(evaluatable[0].name).toBe('Active Enabled');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Soft-Delete (status=archived)
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: Soft-Delete', () => {
  it('archives a policy instead of hard-deleting', async () => {
    const policy = await Policy.create(createPolicyDoc({ name: 'To Archive' }));

    // Simulate soft-delete as governance.routes does
    await Policy.findByIdAndUpdate(policy._id, {
      $set: { status: 'archived', enabled: false },
    });

    const archived = await Policy.findById(policy._id);
    expect(archived).not.toBeNull();
    expect(archived!.status).toBe('archived');
    expect(archived!.enabled).toBe(false);
  });

  it('resolves all open violations on archive', async () => {
    const policy = await Policy.create(createPolicyDoc({ name: 'Will Archive' }));

    // Create open violations
    await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId: 'elem-1',
      message: 'Violation 1',
      field: 'description',
      status: 'open',
    });
    await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId: 'elem-2',
      message: 'Violation 2',
      field: 'description',
      status: 'open',
    });

    // Soft-delete + resolve violations
    await Policy.findByIdAndUpdate(policy._id, {
      $set: { status: 'archived', enabled: false },
    });
    await PolicyViolation.updateMany(
      { policyId: policy._id, status: 'open' },
      { $set: { status: 'resolved', resolvedAt: new Date(), details: 'Policy archived' } },
    );

    const openViolations = await PolicyViolation.countDocuments({
      policyId: policy._id, status: 'open',
    });
    const resolvedViolations = await PolicyViolation.countDocuments({
      policyId: policy._id, status: 'resolved',
    });

    expect(openViolations).toBe(0);
    expect(resolvedViolations).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. PolicyViolation Model
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: PolicyViolation Model', () => {
  it('creates a violation with default status=open', async () => {
    const policy = await Policy.create(createPolicyDoc());
    const violation = await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId: 'elem-abc',
      message: 'Missing description',
      field: 'description',
      currentValue: null,
      expectedValue: true,
    });
    expect(violation.status).toBe('open');
    expect(violation.violationType).toBe('violation');
    expect(violation.severity).toBe('warning');
  });

  it('enforces unique index on policyId+elementId+field (deduplication)', async () => {
    const policy = await Policy.create(createPolicyDoc());
    await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId: 'elem-1',
      message: 'Missing desc',
      field: 'description',
    });

    await expect(PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId: 'elem-1',
      message: 'Duplicate',
      field: 'description',
    })).rejects.toThrow(/duplicate key|E11000/);
  });

  it('allows same policy+element with different fields', async () => {
    const policy = await Policy.create(createPolicyDoc());
    await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId: 'elem-1',
      message: 'Missing desc',
      field: 'description',
    });
    const v2 = await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId: 'elem-1',
      message: 'Bad risk',
      field: 'riskLevel',
    });
    expect(v2).toBeDefined();
  });

  it('upsert pattern updates existing violation instead of duplicating', async () => {
    const policy = await Policy.create(createPolicyDoc());
    const elementId = 'elem-upsert';

    // First upsert creates
    await PolicyViolation.findOneAndUpdate(
      { policyId: policy._id, elementId, field: 'description' },
      {
        $set: {
          projectId: PROJECT_ID,
          message: 'First detection',
          status: 'open',
          detectedAt: new Date(),
        },
      },
      { upsert: true },
    );

    // Second upsert updates
    await PolicyViolation.findOneAndUpdate(
      { policyId: policy._id, elementId, field: 'description' },
      {
        $set: {
          projectId: PROJECT_ID,
          message: 'Re-detected',
          status: 'open',
          detectedAt: new Date(),
        },
      },
      { upsert: true },
    );

    const count = await PolicyViolation.countDocuments({ policyId: policy._id, elementId });
    expect(count).toBe(1);

    const v = await PolicyViolation.findOne({ policyId: policy._id, elementId });
    expect(v!.message).toBe('Re-detected');
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Rule Evaluation Engine (evaluateRule, elementMatchesScope, getFieldValue)
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: Rule Evaluation Engine', () => {
  describe('evaluateRule', () => {
    it('equals: matches exact value', () => {
      expect(evaluateRule('active', 'equals', 'active')).toBe(true);
      expect(evaluateRule('active', 'equals', 'retired')).toBe(false);
    });

    it('not_equals: passes when different', () => {
      expect(evaluateRule('low', 'not_equals', 'critical')).toBe(true);
      expect(evaluateRule('critical', 'not_equals', 'critical')).toBe(false);
    });

    it('contains: string substring match', () => {
      expect(evaluateRule('API Gateway Service', 'contains', 'Gateway')).toBe(true);
      expect(evaluateRule('Simple', 'contains', 'complex')).toBe(false);
    });

    it('gt/gte/lt/lte: numeric comparisons', () => {
      expect(evaluateRule(3, 'gte', 2)).toBe(true);
      expect(evaluateRule(2, 'gte', 2)).toBe(true);
      expect(evaluateRule(1, 'gte', 2)).toBe(false);
      expect(evaluateRule(3, 'gt', 2)).toBe(true);
      expect(evaluateRule(2, 'gt', 2)).toBe(false);
      expect(evaluateRule(1, 'lt', 2)).toBe(true);
      expect(evaluateRule(2, 'lte', 2)).toBe(true);
    });

    it('exists: checks for presence/absence (empty string = not exists)', () => {
      expect(evaluateRule('some value', 'exists', true)).toBe(true);
      expect(evaluateRule(null, 'exists', true)).toBe(false);
      expect(evaluateRule(undefined, 'exists', true)).toBe(false);
      expect(evaluateRule('', 'exists', true)).toBe(false); // empty string = not exists
      expect(evaluateRule(null, 'exists', false)).toBe(true);
      expect(evaluateRule('', 'exists', false)).toBe(true); // empty string = absent
    });

    it('regex: pattern matching', () => {
      expect(evaluateRule('API Gateway', 'regex', '^.{3,}$')).toBe(true);
      expect(evaluateRule('AB', 'regex', '^.{3,}$')).toBe(false);
      expect(evaluateRule('order-service', 'regex', '^[a-z-]+$')).toBe(true);
    });
  });

  describe('getFieldValue', () => {
    it('retrieves top-level fields', () => {
      expect(getFieldValue({ name: 'Test', description: 'A desc' }, 'name')).toBe('Test');
      expect(getFieldValue({ description: 'Hello' }, 'description')).toBe('Hello');
    });

    it('retrieves nested fields via dot notation', () => {
      expect(getFieldValue({ scope: { layers: ['app'] } } as Record<string, unknown>, 'scope.layers')).toEqual(['app']);
    });

    it('returns undefined for missing fields', () => {
      expect(getFieldValue({ name: 'X' }, 'nonExistent')).toBeUndefined();
    });
  });

  describe('elementMatchesScope', () => {
    const baseElement = { type: 'application', domain: 'IT', layer: 'application' };

    it('matches when scope is empty (all elements)', () => {
      const policy = { scope: { domains: [], elementTypes: [], layers: [] } } as unknown as IPolicy;
      expect(elementMatchesScope(baseElement, policy)).toBe(true);
    });

    it('matches when element layer is in scope', () => {
      const policy = { scope: { domains: [], elementTypes: [], layers: ['application', 'technology'] } } as unknown as IPolicy;
      expect(elementMatchesScope(baseElement, policy)).toBe(true);
    });

    it('rejects when element layer not in scope', () => {
      const policy = { scope: { domains: [], elementTypes: [], layers: ['business'] } } as unknown as IPolicy;
      expect(elementMatchesScope(baseElement, policy)).toBe(false);
    });

    it('filters by elementType', () => {
      const policy = { scope: { domains: [], elementTypes: ['application_component'], layers: [] } } as unknown as IPolicy;
      expect(elementMatchesScope(baseElement, policy)).toBe(false);
      expect(elementMatchesScope({ ...baseElement, type: 'application_component' }, policy)).toBe(true);
    });

    it('filters by domain', () => {
      const policy = { scope: { domains: ['Finance'], elementTypes: [], layers: [] } } as unknown as IPolicy;
      expect(elementMatchesScope(baseElement, policy)).toBe(false);
      expect(elementMatchesScope({ ...baseElement, domain: 'Finance' }, policy)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. evaluateElementPolicies — violation detection + auto-resolve
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: evaluateElementPolicies', () => {
  // We need to import this with mocks already in place
  let evaluateElementPolicies: typeof import('../services/policy-evaluation.service').evaluateElementPolicies;

  beforeAll(async () => {
    const mod = await import('../services/policy-evaluation.service');
    evaluateElementPolicies = mod.evaluateElementPolicies;
  });

  it('creates violation when element is non-compliant', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'No Critical Risk',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [{ field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'Must not be critical risk' }],
    }));

    const elementId = 'elem-critical';

    // Mock Neo4j to return an element with critical risk (violates policy)
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Bad Element',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 2 },
        riskLevel: 'critical',
        status: 'current',
        description: 'Has desc',
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'create');

    const violations = await PolicyViolation.find({ elementId, status: 'open' });
    expect(violations).toHaveLength(1);
    expect(violations[0].policyId.toString()).toBe(policy._id.toString());
    expect(violations[0].message).toBe('Must not be critical risk');
    expect(violations[0].field).toBe('riskLevel');
  });

  it('does NOT create violation when element is compliant', async () => {
    await Policy.create(createPolicyDoc({
      name: 'Desc Check',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [{ field: 'description', operator: 'exists', value: true, message: 'Need desc' }],
    }));

    const elementId = 'elem-good';

    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Good Element',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 3 },
        riskLevel: 'low',
        status: 'current',
        description: 'A proper description',
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'create');

    const violations = await PolicyViolation.find({ elementId, status: 'open' });
    expect(violations).toHaveLength(0);
  });

  it('auto-resolves violation when element becomes compliant', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'Resolve Test',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [{ field: 'description', operator: 'exists', value: true, message: 'Need desc' }],
    }));

    const elementId = 'elem-resolve';

    // Pre-create an open violation
    await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId,
      message: 'Need desc',
      field: 'description',
      status: 'open',
      detectedAt: new Date(),
    });

    // Now the element has a description (compliant)
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Fixed Element',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 2 },
        riskLevel: 'low',
        status: 'current',
        description: 'Now has a description!',
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'update');

    const openV = await PolicyViolation.find({ elementId, status: 'open' });
    const resolvedV = await PolicyViolation.find({ elementId, status: 'resolved' });
    expect(openV).toHaveLength(0);
    expect(resolvedV).toHaveLength(1);
    expect(resolvedV[0].resolvedAt).toBeDefined();
  });

  it('resolves all violations on element delete', async () => {
    const policy = await Policy.create(createPolicyDoc({ name: 'Delete Resolve' }));
    const elementId = 'elem-to-delete';

    await PolicyViolation.create({
      projectId: PROJECT_ID,
      policyId: policy._id,
      elementId,
      message: 'V1',
      field: 'description',
      status: 'open',
    });

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'delete');

    const remaining = await PolicyViolation.find({ elementId, status: 'open' });
    expect(remaining).toHaveLength(0);

    const resolved = await PolicyViolation.find({ elementId, status: 'resolved' });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].details).toBe('Element deleted');
  });

  it('skips policy nodes (metadata.isPolicyNode)', async () => {
    await Policy.create(createPolicyDoc({
      name: 'Skip Policy Nodes',
      scope: { domains: [], elementTypes: [], layers: [] },
    }));

    const elementId = 'policy-node-123';

    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Policy Tile',
        type: 'constraint',
        layer: 'motivation',
        domain: '',
        maturity: { toNumber: () => 1 },
        riskLevel: 'low',
        status: 'current',
        description: '',
        metadata: JSON.stringify({ isPolicyNode: true }),
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'create');

    const violations = await PolicyViolation.find({ elementId });
    expect(violations).toHaveLength(0);
  });

  it('respects effectiveFrom date — skips future policies', async () => {
    await Policy.create(createPolicyDoc({
      name: 'Future Policy',
      effectiveFrom: new Date('2099-01-01'),
      scope: { domains: [], elementTypes: [], layers: [] },
    }));

    const elementId = 'elem-future';

    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Some Element',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 1 },
        riskLevel: 'low',
        status: 'current',
        description: '',
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'create');

    const violations = await PolicyViolation.find({ elementId });
    expect(violations).toHaveLength(0);
  });

  it('respects effectiveUntil date — skips expired policies', async () => {
    await Policy.create(createPolicyDoc({
      name: 'Expired Policy',
      effectiveUntil: new Date('2020-01-01'),
      scope: { domains: [], elementTypes: [], layers: [] },
    }));

    const elementId = 'elem-expired';

    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Some Element',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 1 },
        riskLevel: 'low',
        status: 'current',
        description: '',
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'create');

    const violations = await PolicyViolation.find({ elementId });
    expect(violations).toHaveLength(0);
  });

  it('evaluates multiple policies with scope filtering', async () => {
    // Policy 1: applies to application layer — checks maturity >= 3
    await Policy.create(createPolicyDoc({
      name: 'App Maturity Policy',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [{ field: 'maturity', operator: 'gte', value: 3, message: 'App maturity must be >= 3' }],
    }));

    // Policy 2: applies only to technology layer — should NOT match
    await Policy.create(createPolicyDoc({
      name: 'Tech Layer Policy',
      scope: { domains: [], elementTypes: [], layers: ['technology'] },
      rules: [{ field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'No critical risk' }],
    }));

    const elementId = 'elem-app';

    // Element is in application layer with maturity 2 — violates Policy 1 only
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'App Element',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 2 },
        riskLevel: 'critical', // would violate Policy 2, but it's tech-only
        status: 'current',
        description: 'Has description',
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'create');

    const violations = await PolicyViolation.find({ elementId, status: 'open' });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toBe('App maturity must be >= 3');
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. evaluateAllForPolicy — bulk evaluation for policy create/update
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: evaluateAllForPolicy', () => {
  let evaluateAllForPolicy: typeof import('../services/policy-evaluation.service').evaluateAllForPolicy;

  beforeAll(async () => {
    const mod = await import('../services/policy-evaluation.service');
    evaluateAllForPolicy = mod.evaluateAllForPolicy;
  });

  it('evaluates all elements in scope and creates violations', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'Bulk Eval Policy',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [{ field: 'maturity', operator: 'gte', value: 2, message: 'Maturity must be >= 2' }],
    }));

    // Mock: 3 elements, 2 with maturity < 2
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({ id: 'e1', name: 'Elem1', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 1 }, riskLevel: 'low', status: 'current', description: 'desc', metadata: null }),
      fakeNeo4jRecord({ id: 'e2', name: 'Elem2', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 3 }, riskLevel: 'low', status: 'current', description: 'desc', metadata: null }),
      fakeNeo4jRecord({ id: 'e3', name: 'Elem3', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 1 }, riskLevel: 'low', status: 'current', description: 'desc', metadata: null }),
    ]);

    await evaluateAllForPolicy(PROJECT_ID.toString(), policy._id.toString());

    const violations = await PolicyViolation.find({ policyId: policy._id, status: 'open' });
    expect(violations).toHaveLength(2);
    const violatedIds = violations.map(v => v.elementId).sort();
    expect(violatedIds).toEqual(['e1', 'e3']);
  });

  it('skips draft policies', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'Draft Policy',
      status: 'draft',
      scope: { domains: [], elementTypes: [], layers: [] },
    }));

    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({ id: 'e1', name: 'E1', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 1 }, riskLevel: 'low', status: 'current', description: '', metadata: null }),
    ]);

    await evaluateAllForPolicy(PROJECT_ID.toString(), policy._id.toString());

    const violations = await PolicyViolation.find({ policyId: policy._id });
    expect(violations).toHaveLength(0);
  });

  it('skips disabled policies', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'Disabled Policy',
      enabled: false,
    }));

    await evaluateAllForPolicy(PROJECT_ID.toString(), policy._id.toString());

    const violations = await PolicyViolation.find({ policyId: policy._id });
    expect(violations).toHaveLength(0);
  });

  it('filters policy nodes from evaluation targets', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'Policy with policy nodes',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'maturity', operator: 'gte', value: 3, message: 'Maturity too low' }],
    }));

    // loadProjectElements query already excludes isPolicyNode in WHERE clause
    // Here we simulate that: only regular elements returned (maturity 1 → violates)
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({ id: 'regular-1', name: 'Regular', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 1 }, riskLevel: 'low', status: 'current', description: 'desc', metadata: null }),
    ]);

    await evaluateAllForPolicy(PROJECT_ID.toString(), policy._id.toString());

    const violations = await PolicyViolation.find({ policyId: policy._id });
    expect(violations).toHaveLength(1);
    expect(violations[0].elementId).toBe('regular-1');
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Violations API — filter by status + by-element
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: Violations Query Patterns', () => {
  it('filters violations by status', async () => {
    const policy = await Policy.create(createPolicyDoc());
    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: policy._id, elementId: 'e1',
      message: 'Open', field: 'description', status: 'open',
    });
    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: policy._id, elementId: 'e2',
      message: 'Resolved', field: 'description', status: 'resolved',
    });
    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: policy._id, elementId: 'e3',
      message: 'Suppressed', field: 'description', status: 'suppressed',
    });

    const openViolations = await PolicyViolation.find({ projectId: PROJECT_ID, status: 'open' });
    expect(openViolations).toHaveLength(1);
    expect(openViolations[0].elementId).toBe('e1');

    const resolvedViolations = await PolicyViolation.find({ projectId: PROJECT_ID, status: 'resolved' });
    expect(resolvedViolations).toHaveLength(1);
  });

  it('queries violations by element', async () => {
    const p1 = await Policy.create(createPolicyDoc({ name: 'P1' }));
    const p2 = await Policy.create(createPolicyDoc({ name: 'P2' }));

    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: p1._id, elementId: 'target-elem',
      message: 'V1', field: 'description', status: 'open',
    });
    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: p2._id, elementId: 'target-elem',
      message: 'V2', field: 'riskLevel', status: 'open',
    });
    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: p1._id, elementId: 'other-elem',
      message: 'V3', field: 'description', status: 'open',
    });

    const elementViolations = await PolicyViolation.find({
      projectId: PROJECT_ID,
      elementId: 'target-elem',
      status: 'open',
    });
    expect(elementViolations).toHaveLength(2);
  });

  it('supports limit/offset pagination', async () => {
    const policy = await Policy.create(createPolicyDoc());
    for (let i = 0; i < 5; i++) {
      await PolicyViolation.create({
        projectId: PROJECT_ID, policyId: policy._id, elementId: `e-${i}`,
        message: `V${i}`, field: 'description', status: 'open',
      });
    }

    const page1 = await PolicyViolation.find({ projectId: PROJECT_ID, status: 'open' })
      .sort({ detectedAt: -1 }).limit(2).skip(0);
    expect(page1).toHaveLength(2);

    const page2 = await PolicyViolation.find({ projectId: PROJECT_ID, status: 'open' })
      .sort({ detectedAt: -1 }).limit(2).skip(2);
    expect(page2).toHaveLength(2);

    const page3 = await PolicyViolation.find({ projectId: PROJECT_ID, status: 'open' })
      .sort({ detectedAt: -1 }).limit(2).skip(4);
    expect(page3).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Seed Policy Templates
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: Seed Policy Templates', () => {
  it('has 12 seed policies (5 DORA + 4 NIS2 + 3 TOGAF)', () => {
    expect(SEED_POLICIES).toHaveLength(12);

    const dora = SEED_POLICIES.filter(p => p.source === 'dora');
    const nis2 = SEED_POLICIES.filter(p => p.source === 'nis2');
    const togaf = SEED_POLICIES.filter(p => p.source === 'togaf');

    expect(dora).toHaveLength(5);
    expect(nis2).toHaveLength(4);
    expect(togaf).toHaveLength(3);
  });

  it('all seed policies have required fields', () => {
    for (const sp of SEED_POLICIES) {
      expect(sp.name).toBeTruthy();
      expect(sp.description).toBeTruthy();
      expect(sp.category).toBeTruthy();
      expect(sp.framework).toBeTruthy();
      expect(sp.severity).toBeTruthy();
      expect(sp.source).toBeTruthy();
      expect(sp.rules.length).toBeGreaterThan(0);
      for (const rule of sp.rules) {
        expect(rule.field).toBeTruthy();
        expect(rule.operator).toBeTruthy();
        expect(rule.message).toBeTruthy();
      }
    }
  });

  it('seeds policies as draft with correct source', async () => {
    const templates = ['dora', 'nis2'];
    const toSeed = SEED_POLICIES.filter(sp => templates.includes(sp.source));

    let created = 0;
    for (const sp of toSeed) {
      const existing = await Policy.findOne({ projectId: PROJECT_ID, name: sp.name });
      if (!existing) {
        await Policy.create({
          ...sp,
          projectId: PROJECT_ID,
          status: 'draft',
          enabled: false,
          createdBy: USER_ID,
        });
        created++;
      }
    }

    expect(created).toBe(9); // 5 DORA + 4 NIS2

    const drafts = await Policy.find({ projectId: PROJECT_ID, status: 'draft' });
    expect(drafts).toHaveLength(9);
    for (const d of drafts) {
      expect(d.enabled).toBe(false);
      expect(['dora', 'nis2']).toContain(d.source);
    }
  });

  it('skips duplicate templates on re-seed', async () => {
    // First seed
    for (const sp of SEED_POLICIES.filter(s => s.source === 'togaf')) {
      await Policy.create({
        ...sp,
        projectId: PROJECT_ID,
        status: 'draft',
        enabled: false,
        createdBy: USER_ID,
      });
    }

    // Second seed — should skip existing
    let created = 0;
    for (const sp of SEED_POLICIES.filter(s => s.source === 'togaf')) {
      const existing = await Policy.findOne({ projectId: PROJECT_ID, name: sp.name });
      if (!existing) {
        await Policy.create({ ...sp, projectId: PROJECT_ID, status: 'draft', enabled: false, createdBy: USER_ID });
        created++;
      }
    }

    expect(created).toBe(0);
    const togafPolicies = await Policy.find({ projectId: PROJECT_ID, source: 'togaf' });
    expect(togafPolicies).toHaveLength(3); // no duplicates
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. Multi-Rule Policies
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: Multi-Rule Policy Evaluation', () => {
  let evaluateElementPolicies: typeof import('../services/policy-evaluation.service').evaluateElementPolicies;

  beforeAll(async () => {
    const mod = await import('../services/policy-evaluation.service');
    evaluateElementPolicies = mod.evaluateElementPolicies;
  });

  it('creates separate violations per rule in a multi-rule policy', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'DORA ICT Risk (multi)',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [
        { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'No critical risk' },
        { field: 'maturity', operator: 'gte', value: 3, message: 'Maturity too low' },
      ],
    }));

    const elementId = 'elem-multi-fail';

    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Bad Element',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 1 }, // violates rule 2 (gte 3)
        riskLevel: 'critical', // violates rule 1
        status: 'current',
        description: 'Has desc',
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'create');

    const violations = await PolicyViolation.find({ elementId, status: 'open' });
    expect(violations).toHaveLength(2);

    const fields = violations.map(v => v.field).sort();
    expect(fields).toEqual(['maturity', 'riskLevel']);
  });

  it('partially resolves — fixes one rule, keeps violation for another', async () => {
    const policy = await Policy.create(createPolicyDoc({
      name: 'Partial Fix',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [
        { field: 'riskLevel', operator: 'not_equals', value: 'critical', message: 'No critical risk' },
        { field: 'description', operator: 'exists', value: true, message: 'Desc required' },
      ],
    }));

    const elementId = 'elem-partial';

    // Step 1: both rules violated
    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: policy._id, elementId,
      message: 'No critical risk', field: 'riskLevel', status: 'open',
    });
    await PolicyViolation.create({
      projectId: PROJECT_ID, policyId: policy._id, elementId,
      message: 'Desc required', field: 'description', status: 'open',
    });

    // Step 2: user adds description but keeps critical risk
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({
        id: elementId,
        name: 'Partially Fixed',
        type: 'application',
        layer: 'application',
        domain: 'IT',
        maturity: { toNumber: () => 2 },
        riskLevel: 'critical', // still violates
        status: 'current',
        description: 'Now has description', // fixed!
        metadata: null,
      }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), elementId, 'update');

    const openV = await PolicyViolation.find({ elementId, status: 'open' });
    const resolvedV = await PolicyViolation.find({ elementId, status: 'resolved' });

    expect(openV).toHaveLength(1);
    expect(openV[0].field).toBe('riskLevel');

    expect(resolvedV).toHaveLength(1);
    expect(resolvedV[0].field).toBe('description');
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. End-to-End Scenario: Full Policy Lifecycle
// ═══════════════════════════════════════════════════════════════

describe('UC-GOV-001: E2E Policy Lifecycle', () => {
  let evaluateElementPolicies: typeof import('../services/policy-evaluation.service').evaluateElementPolicies;
  let evaluateAllForPolicy: typeof import('../services/policy-evaluation.service').evaluateAllForPolicy;

  beforeAll(async () => {
    const mod = await import('../services/policy-evaluation.service');
    evaluateElementPolicies = mod.evaluateElementPolicies;
    evaluateAllForPolicy = mod.evaluateAllForPolicy;
  });

  it('full lifecycle: create policy → detect violations → fix → resolve → archive', async () => {
    // 1. Create a DORA policy — checks maturity >= 2
    const policy = await Policy.create(createPolicyDoc({
      name: 'E2E DORA ICT Risk',
      source: 'dora',
      severity: 'error',
      scope: { domains: [], elementTypes: [], layers: ['application'] },
      rules: [
        { field: 'maturity', operator: 'gte', value: 2, message: 'DORA: Maturity must be >= 2' },
      ],
    }));

    expect(policy.status).toBe('active');
    expect(policy.version).toBe(1);

    // 2. evaluateAllForPolicy — 2 elements, 1 non-compliant (maturity 1)
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({ id: 'api-gw', name: 'API Gateway', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 3 }, riskLevel: 'low', status: 'current', description: 'Gateway', metadata: null }),
      fakeNeo4jRecord({ id: 'core-db', name: 'Core DB', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 1 }, riskLevel: 'medium', status: 'current', description: 'DB', metadata: null }),
    ]);

    await evaluateAllForPolicy(PROJECT_ID.toString(), policy._id.toString());

    let violations = await PolicyViolation.find({ policyId: policy._id, status: 'open' });
    expect(violations).toHaveLength(1);
    expect(violations[0].elementId).toBe('core-db');
    expect(violations[0].severity).toBe('error');

    // 3. User fixes element (maturity → 2) → auto-resolve
    mockRunCypher.mockResolvedValueOnce([
      fakeNeo4jRecord({ id: 'core-db', name: 'Core DB', type: 'application', layer: 'application', domain: '', maturity: { toNumber: () => 2 }, riskLevel: 'medium', status: 'current', description: 'DB', metadata: null }),
    ]);

    await evaluateElementPolicies(PROJECT_ID.toString(), 'core-db', 'update');

    violations = await PolicyViolation.find({ policyId: policy._id, status: 'open' });
    expect(violations).toHaveLength(0);

    const resolved = await PolicyViolation.find({ policyId: policy._id, status: 'resolved' });
    expect(resolved).toHaveLength(1);

    // 4. Version bump on update
    await Policy.findByIdAndUpdate(policy._id, { $inc: { version: 1 } });
    const updated = await Policy.findById(policy._id);
    expect(updated!.version).toBe(2);

    // 5. Soft-delete (archive)
    await Policy.findByIdAndUpdate(policy._id, {
      $set: { status: 'archived', enabled: false },
    });
    await PolicyViolation.updateMany(
      { policyId: policy._id, status: 'open' },
      { $set: { status: 'resolved', resolvedAt: new Date() } },
    );

    const archived = await Policy.findById(policy._id);
    expect(archived!.status).toBe('archived');
    expect(archived!.enabled).toBe(false);
  });
});
