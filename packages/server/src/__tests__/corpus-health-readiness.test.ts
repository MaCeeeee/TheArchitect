/**
 * Corpus health readiness-race regression (THE-470).
 *
 * The lazy corpus connection (mongoose.createConnection, bufferCommands:false) may
 * still be handshaking on the very first corpus/health poll right after an app
 * container recreate. corpusHealth() must wait out that handshake instead of racing
 * it and false-alarming {ok:false} — the original bug threw
 * "before initial connection is complete" on that first estimatedDocumentCount().
 *
 * Run: cd packages/server && npx jest corpus-health-readiness --verbose
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  corpusHealth,
  getCorpusConnection,
  isCorpusReachable,
  __resetCorpusForTests,
} from '../services/corpusClient.service';

describe('corpusHealth readiness race (THE-470)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await __resetCorpusForTests();
    delete process.env.CORPUS_MONGODB_URI;
    await mongoServer.stop();
  });

  it('does not false-alarm {ok:false} while the connection is still handshaking (AC1)', async () => {
    process.env.CORPUS_MONGODB_URI = mongoServer.getUri();
    await __resetCorpusForTests(); // guarantee a fresh, not-yet-opened connection

    // Force the lazy connection open and capture that it is NOT connected yet
    // (readyState !== 1) — exactly the state the first health poll hits right
    // after a container recreate. JS is single-threaded, so between this
    // createConnection and the assertion the handshake cannot have completed.
    const conn = getCorpusConnection();
    expect(conn.readyState).not.toBe(1); // 1 = connected; here it is mid-handshake

    // The fix waits for readiness and reports the truth instead of racing it.
    const health = await corpusHealth();
    expect(health.ok).toBe(true);
    expect(typeof health.count).toBe('number');
    expect(isCorpusReachable()).toBe(true);
  });

  it('stays {ok:true} on a subsequent call over the now-warm connection (fast path)', async () => {
    // Reuses the connection warmed by the previous test → waitForCorpusReadyIfConnected
    // is a no-op (readyState 1) and estimatedDocumentCount() succeeds directly.
    const health = await corpusHealth();
    expect(health.ok).toBe(true);
    expect(typeof health.count).toBe('number');
  });
});
