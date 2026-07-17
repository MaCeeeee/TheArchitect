import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Policy } from '../models/Policy';

jest.mock('../config/neo4j', () => ({ runCypher: jest.fn(), runCypherTransaction: jest.fn().mockResolvedValue([]) }));
const mockRunCypher = jest.requireMock('../config/neo4j').runCypher as jest.Mock;
const rec = (d: Record<string, unknown>) => ({ get: (k: string) => d[k] ?? null });

let mongod: MongoMemoryServer;
beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });
afterEach(async () => { await Policy.deleteMany({}); mockRunCypher.mockReset(); });

const PROJECT_ID = new mongoose.Types.ObjectId();
const USER_ID = new mongoose.Types.ObjectId();

describe('REQ-FIX-001.1: checkCompliance surfaces operator (THE-499)', () => {
  it('includes rule.operator on each ComplianceViolation', async () => {
    await Policy.create({
      projectId: PROJECT_ID, name: 'Desc', category: 'architecture',
      severity: 'high', enforcementLevel: 'advisory', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'description', operator: 'exists', value: true, message: 'needs desc' }],
      createdBy: USER_ID,
    });
    mockRunCypher.mockResolvedValue([rec({
      id: 'el-1', name: 'X', type: 'application_component', layer: 'application', description: '',
    })]);

    const { checkCompliance } = await import('../services/compliance.service');
    const report = await checkCompliance(PROJECT_ID.toString());

    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.violations[0].operator).toBe('exists');
  });
});
