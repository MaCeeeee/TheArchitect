/**
 * lawDiscoveryFinding.service Tests — UC-LAW-002 Slice-2 (THE-463).
 *
 * Real mongodb-memory-server (Muster complianceMapping.service.test.ts) — die
 * Persist/Lifecycle-Logik lebt in Upsert-/Update-Semantik, die ohne echte
 * Mongo-Roundtrips (Unique-Index-Konflikte, Upsert-Race) nicht ehrlich
 * getestet ist.
 *
 * Coverage:
 *   - upsertFindings: persist = status 'auto', createdBy 'llm'
 *   - setFindingStatus: confirm → 'confirmed' (+ createdBy human), reject → 'rejected'
 *   - Review-Fix 5 (AC-3): ein bereits confirmed/rejected Finding wird von einem
 *     erneuten upsertFindings NICHT angefasst (weder status noch Content) —
 *     ein 'auto' Finding dagegen WIRD aktualisiert.
 *   - findExisting / listFindings Roundtrip + Dedup (Re-Run erzeugt kein Duplikat)
 *
 * Run: cd packages/server && npx jest src/__tests__/lawDiscoveryFinding.service.test.ts --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { LawDiscoveryFinding } from '../models/LawDiscoveryFinding';
import {
  upsertFindings,
  setFindingStatus,
  findExisting,
  listFindings,
} from '../services/lawDiscoveryFinding.service';

describe('lawDiscoveryFinding.service (UC-LAW-002 Slice-2 / THE-463)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await LawDiscoveryFinding.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await LawDiscoveryFinding.deleteMany({});
  });

  const projectId = () => new mongoose.Types.ObjectId().toString();

  const finding = (overrides: Partial<Parameters<typeof upsertFindings>[1][number]> = {}) => ({
    family: 'ai-act',
    sources: ['ai-act-en'],
    jurisdiction: 'EU',
    applies: true,
    confidence: 0.8,
    reasoning: 'High-risk AI component detected.',
    elementIds: ['e1'],
    keyParagraphs: ['ai-act-en:5'],
    retrievalScore: 0.75,
    corpusVersionHash: 'hash-1',
    judgeModel: 'claude-haiku-4-5-20251001',
    ...overrides,
  });

  describe('upsertFindings — persist as auto/llm', () => {
    it('creates a new finding with status=auto, createdBy=llm', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding()]);
      const found = await findExisting(pid, 'ai-act', 'hash-1');
      expect(found).not.toBeNull();
      expect(found!.status).toBe('auto');
      expect(found!.createdBy).toBe('llm');
      expect(found!.confidence).toBe(0.8);
    });

    it('re-running upsertFindings with the same evidence set is idempotent (AC-3 dedup)', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding()]);
      await upsertFindings(pid, [finding({ confidence: 0.9 })]);
      const all = await listFindings(pid);
      expect(all).toHaveLength(1);
      expect(all[0].confidence).toBe(0.9); // auto findings DO get refreshed content
    });

    it('a new corpusVersionHash creates a NEW finding (evidence changed)', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding()]);
      await upsertFindings(pid, [finding({ corpusVersionHash: 'hash-2' })]);
      const all = await listFindings(pid);
      expect(all).toHaveLength(2);
    });

    it('survives an E11000 upsert race (parallel /discover) and falls back to a plain update (Code-Review-Fix)', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding({ confidence: 0.5 })]); // der "Gewinner" des Race

      // Der Verlierer: sein upsert wirft E11000, weil das Dokument inzwischen existiert.
      const spy = jest.spyOn(LawDiscoveryFinding, 'updateOne').mockImplementationOnce(() => {
        const err = new Error('E11000 duplicate key error') as Error & { code: number };
        err.code = 11000;
        throw err;
      });
      await expect(upsertFindings(pid, [finding({ confidence: 0.99 })])).resolves.toBeUndefined();
      spy.mockRestore();

      const found = await findExisting(pid, 'ai-act', 'hash-1');
      expect(found!.confidence).toBe(0.99); // per plain update nachgezogen, kein Crash
    });
  });

  describe('setFindingStatus — lifecycle transitions', () => {
    it('confirm sets status=confirmed and createdBy=human', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding()]);
      const ok = await setFindingStatus(pid, 'ai-act', 'hash-1', 'confirmed');
      expect(ok).toBe(true);
      const found = await findExisting(pid, 'ai-act', 'hash-1');
      expect(found!.status).toBe('confirmed');
      expect(found!.createdBy).toBe('human');
    });

    it('reject sets status=rejected', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding()]);
      const ok = await setFindingStatus(pid, 'ai-act', 'hash-1', 'rejected');
      expect(ok).toBe(true);
      const found = await findExisting(pid, 'ai-act', 'hash-1');
      expect(found!.status).toBe('rejected');
    });

    it('returns false when no matching finding exists', async () => {
      const ok = await setFindingStatus(projectId(), 'ghost-law', 'hash-x', 'confirmed');
      expect(ok).toBe(false);
    });
  });

  describe('Review-Fix 5 (AC-3): human decisions are protected from re-upsert', () => {
    it('a rejected finding stays rejected AND its content is unchanged on re-run', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding({ confidence: 0.8, reasoning: 'original reasoning' })]);
      await setFindingStatus(pid, 'ai-act', 'hash-1', 'rejected');

      // Re-run with different content — must be skipped entirely.
      await upsertFindings(pid, [finding({ confidence: 0.99, reasoning: 'DIFFERENT reasoning' })]);

      const found = await findExisting(pid, 'ai-act', 'hash-1');
      expect(found!.status).toBe('rejected');
      expect(found!.confidence).toBe(0.8);
      expect(found!.reasoning).toBe('original reasoning');
    });

    it('a confirmed finding stays confirmed AND its content is unchanged on re-run', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding({ confidence: 0.8 })]);
      await setFindingStatus(pid, 'ai-act', 'hash-1', 'confirmed');

      await upsertFindings(pid, [finding({ confidence: 0.5 })]);

      const found = await findExisting(pid, 'ai-act', 'hash-1');
      expect(found!.status).toBe('confirmed');
      expect(found!.confidence).toBe(0.8);
    });

    it('an auto finding (not yet human-reviewed) IS updated on re-run', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding({ confidence: 0.6 })]);
      await upsertFindings(pid, [finding({ confidence: 0.7 })]);
      const found = await findExisting(pid, 'ai-act', 'hash-1');
      expect(found!.status).toBe('auto');
      expect(found!.confidence).toBe(0.7);
    });
  });

  describe('listFindings', () => {
    it('lists all findings for a project', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding({ family: 'ai-act' }), finding({ family: 'dora', corpusVersionHash: 'hash-3' })]);
      const all = await listFindings(pid);
      expect(all.map(f => f.family).sort()).toEqual(['ai-act', 'dora']);
    });

    it('filters by corpusVersionHash when given', async () => {
      const pid = projectId();
      await upsertFindings(pid, [finding({ family: 'ai-act', corpusVersionHash: 'hash-1' }), finding({ family: 'dora', corpusVersionHash: 'hash-2' })]);
      const filtered = await listFindings(pid, 'hash-1');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].family).toBe('ai-act');
    });

    it('is tenant-isolated per project', async () => {
      const pidA = projectId();
      const pidB = projectId();
      await upsertFindings(pidA, [finding()]);
      const forB = await listFindings(pidB);
      expect(forB).toHaveLength(0);
    });
  });
});
