/**
 * THE-442 Task 4 — severity/ruleId/enforcementLevel Daten-Migration.
 *
 * Run: cd packages/server && npx jest migrate-severity --verbose
 *
 * Test-Isolation (dokumentierte Wahl, Plan-Hinweis): die drei Tests teilen sich
 * eine DB-Instanz, brauchen aber KEIN beforeEach-Cleanup — nach jedem Test sind
 * dessen Dokumente vollständig migriert (severity gemappt, enforcementLevel +
 * ruleId gesetzt) und matchen die Migrations-Queries nicht mehr. Die
 * Idempotenz-Zähler pro Test zählen daher nur die frisch eingefügten Alt-Daten.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeverityEnforcementMigration } from '../scripts/migrate-severity-enforcement';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

// RAW-Insert (umgeht Mongoose-Enums — simuliert Alt-Daten)
async function insertLegacy() {
  const db = mongoose.connection.db!;
  const { insertedId: policyId } = await db.collection('policies').insertOne({
    projectId: new mongoose.Types.ObjectId(), name: 'Legacy', category: 'security',
    severity: 'error', enabled: true, status: 'active', source: 'custom',
    scope: { domains: [], elementTypes: [], layers: [] },
    rules: [
      { field: 'description', operator: 'exists', value: true, message: 'm1' },
      { field: 'riskLevel', operator: 'equals', value: 'low', message: 'm2' },
    ],
    createdBy: new mongoose.Types.ObjectId(), version: 1,
  });
  await db.collection('policyviolations').insertOne({
    projectId: new mongoose.Types.ObjectId(), policyId, elementId: 'el-1',
    violationType: 'violation', severity: 'warning', message: 'm1',
    field: 'description', status: 'open', detectedAt: new Date(), details: '',
  });
  return policyId;
}

describe('migrate-severity-enforcement (THE-442)', () => {
  it('maps legacy severities, backfills ruleIds + enforcementLevel, rewires violations', async () => {
    const policyId = await insertLegacy();
    const result = await runSeverityEnforcementMigration();

    const db = mongoose.connection.db!;
    const policy = await db.collection('policies').findOne({ _id: policyId });
    expect(policy!.severity).toBe('high');                 // error → high
    expect(policy!.enforcementLevel).toBe('advisory');     // Default
    expect(policy!.rules[0].ruleId).toMatch(/^r-/);
    expect(policy!.rules[1].ruleId).toMatch(/^r-/);
    expect(policy!.rules[0].ruleId).not.toBe(policy!.rules[1].ruleId);

    const violation = await db.collection('policyviolations').findOne({ policyId });
    expect(violation!.severity).toBe('medium');            // warning → medium
    expect(violation!.enforcementLevel).toBe('advisory');
    expect(violation!.ruleId).toBe(policy!.rules[0].ruleId); // via field-Match
    expect(violation!.resourcePath).toBe('/elements/el-1/description');

    expect(result.policiesMigrated).toBe(1);
    expect(result.violationsMigrated).toBe(1);

    // Idempotenz: zweiter Lauf ändert nichts
    const second = await runSeverityEnforcementMigration();
    expect(second.policiesMigrated).toBe(0);
    expect(second.violationsMigrated).toBe(0);
  });

  it('resolves violations whose rule cannot be identified', async () => {
    const db = mongoose.connection.db!;
    const { insertedId: policyId } = await db.collection('policies').insertOne({
      projectId: new mongoose.Types.ObjectId(), name: 'P', category: 'custom',
      severity: 'info', enabled: true, status: 'active', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [{ field: 'name', operator: 'exists', value: true, message: 'm' }],
      createdBy: new mongoose.Types.ObjectId(), version: 1,
    });
    await db.collection('policyviolations').insertOne({
      projectId: new mongoose.Types.ObjectId(), policyId, elementId: 'el-2',
      violationType: 'violation', severity: 'info', message: 'stale',
      field: 'deletedField', status: 'open', detectedAt: new Date(), details: '',
    });
    await runSeverityEnforcementMigration();
    const v = await db.collection('policyviolations').findOne({ elementId: 'el-2' });
    expect(v!.status).toBe('resolved');
    expect(v!.details).toContain('THE-442');
  });

  it('is counter-idempotent for policies with empty rules arrays (rules.0-Guard)', async () => {
    const db = mongoose.connection.db!;
    await db.collection('policies').insertOne({
      projectId: new mongoose.Types.ObjectId(), name: 'NoRules', category: 'custom',
      severity: 'warning', enabled: true, status: 'active', source: 'custom',
      scope: { domains: [], elementTypes: [], layers: [] },
      rules: [],
      createdBy: new mongoose.Types.ObjectId(), version: 1,
    });
    const first = await runSeverityEnforcementMigration();
    expect(first.policiesMigrated).toBe(1); // severity warning→medium gemappt
    const second = await runSeverityEnforcementMigration();
    expect(second.policiesMigrated).toBe(0); // ohne rules.0-Guard bliebe das >0
  });
});
