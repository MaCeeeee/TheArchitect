/**
 * ContextTrace-Service Tests — best-effort recorder (THE-423 Task 3).
 *
 * Mirrors the mongodb-memory-server harness from ContextTrace.model.test.ts
 * (repo convention for service/model tests touching Mongoose). All cases
 * share one in-memory Mongo connection so `isContextTracingEnabled()`'s
 * `readyState === 1` check is exercised honestly — toggling
 * CONTEXT_TRACING_ENABLED per test isolates the enabled/disabled behavior.
 *
 * Run: cd packages/server && npx jest src/__tests__/contextTrace.service.test.ts --verbose
 */
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContextTrace } from '../models/ContextTrace';
import { recordContextTrace } from '../services/contextTrace.service';

describe('recordContextTrace() (THE-423 Task 3)', () => {
  let mongoServer: MongoMemoryServer;
  const originalContext = process.env.CONTEXT_TRACING_ENABLED;
  const originalAi = process.env.AI_TRACING_ENABLED;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await ContextTrace.deleteMany({});
    if (originalContext === undefined) delete process.env.CONTEXT_TRACING_ENABLED;
    else process.env.CONTEXT_TRACING_ENABLED = originalContext;
    if (originalAi === undefined) delete process.env.AI_TRACING_ENABLED;
    else process.env.AI_TRACING_ENABLED = originalAi;
  });

  it('returns provided requestId and never throws when tracing disabled', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    const projectId = new Types.ObjectId().toString();
    const id = await recordContextTrace({
      requestId: 'r9',
      feature: 'rag-query',
      projectId,
      consumed: [],
    });
    expect(id).toBe('r9');
    expect(await ContextTrace.countDocuments()).toBe(0);
  });

  it('persists and returns an id matching the doc when enabled + mongo ready', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'true';
    const projectId = new Types.ObjectId().toString();
    const id = await recordContextTrace({
      requestId: 'r-persist-1',
      feature: 'mapping',
      projectId,
      consumed: [
        {
          regulationKey: 'gdpr-art-30',
          versionHash: 'v1',
          retrievalMethod: 'direct',
        },
      ],
    });

    expect(id).toBe('r-persist-1');
    const docs = await ContextTrace.find({});
    expect(docs).toHaveLength(1);
    expect(docs[0].requestId).toBe(id);
    expect(docs[0].feature).toBe('mapping');
  });

  it('returns a generated uuid when no requestId is passed', async () => {
    process.env.CONTEXT_TRACING_ENABLED = 'false';
    const projectId = new Types.ObjectId().toString();
    const id = await recordContextTrace({
      feature: 'rag-query',
      projectId,
      consumed: [],
    });
    expect(typeof id).toBe('string');
    expect(id).toHaveLength(36); // uuid v4
  });
});
