// Regression: Enforce-Tor / Run Compliance Check
//
// Bug 1 (Float-Koersion): Neo4j speichert maturityLevel aus dem CSV-Import
// als FLOAT (3.0). Der Treiber liefert dafür eine plain JS-Number ohne
// toNumber() — die alte Koersion `?.toNumber?.() || 1` machte daraus 1,
// und maturity-Regeln (gte 2) schlugen für JEDES Element fehl ("1 → 2").
//
// Bug 2 (fehlende Persistenz): GET /:projectId/compliance rechnete den
// Report nur in-memory. Das Dashboard zeigte N Violations, aber
// GET /:projectId/violations?status=open las die (leere)
// PolicyViolation-Collection → 0.
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Policy } from '../models/Policy';
import { PolicyViolation } from '../models/PolicyViolation';
import { checkCompliance, coerceNeo4jNumber } from '../services/compliance.service';
import { runAndPersistComplianceCheck, evaluateAllForPolicy } from '../services/policy-evaluation.service';

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

const rec = (d: Record<string, unknown>) => ({ get: (k: string) => d[k] ?? null });

// Element wie es der Neo4j-Treiber für ein per CSV importiertes Element
// liefert: maturityLevel als FLOAT → plain JS-Number, KEIN toNumber().
function csvElement(id: string, maturity: unknown) {
  return rec({
    id,
    name: `Element ${id}`,
    type: 'application_component',
    layer: 'application',
    domain: 'application',
    maturity,
    riskLevel: 'low',
    status: 'current',
    description: 'A sufficiently long description for builtin checks.',
  });
}

// DORA/NIS2-Template-Form: field 'maturity', gte 2 (seed-policies.ts)
function maturityPolicy() {
  return Policy.create({
    projectId: PROJECT_ID,
    name: 'DORA ICT Maturity',
    description: 'ICT systems must have maturity >= 2',
    category: 'compliance',
    severity: 'high',
    enforcementLevel: 'soft_mandatory',
    enabled: true,
    status: 'active',
    source: 'custom',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [{ field: 'maturity', operator: 'gte', value: 2, message: 'Maturity must be >= 2' }],
    createdBy: USER_ID,
  });
}

describe('coerceNeo4jNumber (Bug 1: Float-Koersion)', () => {
  it('behält plain JS-Floats (FLOAT-Property aus dem CSV-Import)', () => {
    expect(coerceNeo4jNumber(3.0, 1)).toBe(3);
    expect(coerceNeo4jNumber(2.5, 1)).toBe(2.5);
  });

  it('behält 0 statt auf den Fallback zu kippen', () => {
    expect(coerceNeo4jNumber(0, 1)).toBe(0);
  });

  it('entpackt Neo4j-Integer-Objekte via toNumber()', () => {
    expect(coerceNeo4jNumber({ toNumber: () => 4 }, 1)).toBe(4);
  });

  it('fällt nur bei null/undefined/NaN auf den Fallback', () => {
    expect(coerceNeo4jNumber(null, 1)).toBe(1);
    expect(coerceNeo4jNumber(undefined, 1)).toBe(1);
    expect(coerceNeo4jNumber(NaN, 1)).toBe(1);
    expect(coerceNeo4jNumber('not-a-number', 1)).toBe(1);
  });

  it('koerziert numerische Strings', () => {
    expect(coerceNeo4jNumber('3', 1)).toBe(3);
  });
});

describe('checkCompliance mit Float-maturityLevel (Bug 1)', () => {
  it('meldet KEINE Violation für maturityLevel=3.0 bei Regel gte 2', async () => {
    await maturityPolicy();
    mockRunCypher.mockResolvedValue([csvElement('el-1', 3.0)]);

    const report = await checkCompliance(PROJECT_ID.toString());

    // Alte Koersion: 3.0 → toNumber fehlt → 1 → "Field: 1 → 2"-Falsch-Positiv
    expect(report.violations).toHaveLength(0);
    expect(report.summary.complianceScore).toBe(100);
  });

  it('meldet weiterhin eine echte Violation für maturityLevel=1', async () => {
    await maturityPolicy();
    mockRunCypher.mockResolvedValue([csvElement('el-1', 1.0)]);

    const report = await checkCompliance(PROJECT_ID.toString());

    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].currentValue).toBe(1);
    expect(report.violations[0].expectedValue).toBe(2);
  });

  it('funktioniert unverändert mit Neo4j-Integer-Objekten', async () => {
    await maturityPolicy();
    mockRunCypher.mockResolvedValue([csvElement('el-1', { toNumber: () => 3 })]);

    const report = await checkCompliance(PROJECT_ID.toString());
    expect(report.violations).toHaveLength(0);
  });
});

describe('evaluateAllForPolicy mit Float-maturityLevel (Bug 1, Persistenz-Pfad)', () => {
  it('persistiert KEINE Violation für maturityLevel=3.0 bei Regel gte 2', async () => {
    const policy = await maturityPolicy();
    mockRunCypher.mockResolvedValue([csvElement('el-1', 3.0)]);

    await evaluateAllForPolicy(PROJECT_ID.toString(), policy._id.toString());

    const open = await PolicyViolation.countDocuments({ status: 'open' });
    expect(open).toBe(0);
  });
});

describe('runAndPersistComplianceCheck (Bug 2: Persistenz)', () => {
  it('persistiert Report-Violations als offene PolicyViolations (Dashboard == GET /violations)', async () => {
    await maturityPolicy();
    // 3 Elemente, davon 2 unter der Schwelle
    mockRunCypher.mockResolvedValue([
      csvElement('el-1', 1.0),
      csvElement('el-2', 1.0),
      csvElement('el-3', 3.0),
    ]);

    const report = await runAndPersistComplianceCheck(PROJECT_ID.toString());

    expect(report.violations).toHaveLength(2);
    const open = await PolicyViolation.find({ projectId: PROJECT_ID, status: 'open' });
    // Kern der Regression: Dashboard-Zahl und Collection-Stand identisch
    expect(open).toHaveLength(report.violations.length);
    expect(open.map((v) => v.elementId).sort()).toEqual(['el-1', 'el-2']);
    expect(open[0].ruleId).toBeTruthy();
    expect(open[0].severity).toBe('high');
    expect(open[0].enforcementLevel).toBe('soft_mandatory');
  });

  it('ist idempotent — zweiter Lauf erzeugt keine Duplikate', async () => {
    await maturityPolicy();
    mockRunCypher.mockResolvedValue([csvElement('el-1', 1.0)]);

    await runAndPersistComplianceCheck(PROJECT_ID.toString());
    await runAndPersistComplianceCheck(PROJECT_ID.toString());

    const open = await PolicyViolation.countDocuments({ projectId: PROJECT_ID, status: 'open' });
    expect(open).toBe(1);
  });

  it('resolved offene Violations, wenn das Element gefixt wurde', async () => {
    await maturityPolicy();
    mockRunCypher.mockResolvedValue([csvElement('el-1', 1.0)]);
    await runAndPersistComplianceCheck(PROJECT_ID.toString());
    expect(await PolicyViolation.countDocuments({ status: 'open' })).toBe(1);

    // Element auf maturity 3 angehoben → nächster Check räumt auf
    mockRunCypher.mockResolvedValue([csvElement('el-1', 3.0)]);
    await runAndPersistComplianceCheck(PROJECT_ID.toString());

    expect(await PolicyViolation.countDocuments({ status: 'open' })).toBe(0);
    const resolved = await PolicyViolation.findOne({ elementId: 'el-1' });
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolvedAt).toBeTruthy();
  });
});
