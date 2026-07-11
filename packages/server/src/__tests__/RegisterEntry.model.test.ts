/**
 * THE-445 AC-2 — WORM register model (schema + append-only guard).
 * Run: cd packages/server && npx jest src/__tests__/RegisterEntry.model.test.ts
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RegisterEntry } from '../models/RegisterEntry';

describe('RegisterEntry model — WORM + schema (THE-445 AC-2)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await RegisterEntry.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await RegisterEntry.deleteMany({});
  });

  const base = () => ({
    projectId: new mongoose.Types.ObjectId(),
    kind: 'defect' as const,
    fingerprint: 'abc123def456',
    source: 'manual' as const,
    systemComponent: 'backend_api',
    environment: 'production',
    title: 'Memory leak in data parsing module',
    severity: 4,
    urgency: 3,
    criticality: 5,
    mitigation: 0,
    pScore: 20,
    weightsVersion: 'v1',
    routingPath: 'critical' as const,
    status: 'assessed' as const,
  });

  it('persists a valid entry with defaults', async () => {
    const e = await new RegisterEntry(base()).save();
    expect(e.occurrenceCounter).toBe(1);
    expect(e.proposedActions).toEqual([]);
    expect(e.supersedes).toBeNull();
    expect(e.createdAt).toBeInstanceOf(Date);
  });

  it('rejects re-saving an existing row (WORM append-only guard)', async () => {
    const e = await new RegisterEntry(base()).save();
    e.status = 'resolved';
    await expect(e.save()).rejects.toThrow(/append-only/i);
  });

  it('rejects an invalid kind and out-of-range severity', async () => {
    await expect(
      new RegisterEntry({ ...base(), kind: 'bogus' as unknown as 'defect' }).save(),
    ).rejects.toThrow();
    await expect(new RegisterEntry({ ...base(), severity: 9 }).save()).rejects.toThrow();
  });

  it('requires the core fields', async () => {
    await expect(
      new RegisterEntry({ kind: 'defect' } as unknown as Record<string, unknown>).save(),
    ).rejects.toThrow();
  });
});
