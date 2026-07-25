/**
 * ContextTrace Model Tests — UC-CTXGOV/THE-423 Task 2.
 *
 * Muster ComplianceMapping.model.test.ts / lawDiscoveryFinding.model.test.ts
 * (mongodb-memory-server, Repo-Konvention für Model-Tests). Verifiziert:
 *   - append-only durable store (AC-1): persists a corpus-less oracle trace
 *     with UNCAPPED audit.rawResponse (mirrors AiTrace but WITHOUT the
 *     4000-char cap — ContextTrace's audit is source-of-truth for the oracle)
 *   - reverse-lookup index on consumed.regulationKey/versionHash
 *
 * Run: cd packages/server && npx jest src/__tests__/ContextTrace.model.test.ts --verbose
 */
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContextTrace } from '../models/ContextTrace';

describe('ContextTrace Model (THE-423 Task 2)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await ContextTrace.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await ContextTrace.deleteMany({});
  });

  it('persists a corpus-less oracle trace with uncapped audit', async () => {
    const big = 'x'.repeat(9000);
    const doc = await ContextTrace.create({
      requestId: 'r1',
      feature: 'oracle',
      projectId: new Types.ObjectId(),
      consumed: [],
      audit: { rawResponse: big },
    });
    expect(doc.audit!.rawResponse!.length).toBe(9000);
  });

  // THE-516 / ADR-0006 E4: ConsumedRef-Erweiterung ist ADDITIV — alt-geformte
  // Trace-Inputs (ohne origin/scopeGuarantee) müssen unverändert validieren.
  it('ConsumedRef additive (THE-516): old-shaped input still validates, new fields persist', async () => {
    const oldShaped = await ContextTrace.create({
      requestId: 'r-old',
      feature: 'discovery',
      projectId: new Types.ObjectId(),
      consumed: [{ regulationKey: 'ai-act-en:16', versionHash: 'v1', retrievalMethod: 'dense' }],
    });
    expect(oldShaped.consumed[0].origin).toBeUndefined();
    expect(oldShaped.scopeGuarantee).toBeUndefined();

    const newShaped = await ContextTrace.create({
      requestId: 'r-new',
      feature: 'discovery',
      projectId: new Types.ObjectId(),
      consumed: [
        { regulationKey: 'ai-act-en:16', versionHash: 'v1', retrievalMethod: 'dense' },
        { regulationKey: 'ai-act-en:2', versionHash: 'v2', retrievalMethod: 'dense', origin: 'scope-guarantee' },
      ],
      scopeGuarantee: 'applied',
    });
    expect(newShaped.consumed[1].origin).toBe('scope-guarantee');
    expect(newShaped.scopeGuarantee).toBe('applied');
  });

  it('indexes consumed for reverse-lookup', () => {
    const idx = ContextTrace.schema.indexes().map((i) => JSON.stringify(i[0]));
    expect(idx).toContain(JSON.stringify({ 'consumed.regulationKey': 1, 'consumed.versionHash': 1 }));
  });
});
