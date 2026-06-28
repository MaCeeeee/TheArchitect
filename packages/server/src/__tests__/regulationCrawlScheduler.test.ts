/**
 * Regulation Crawl Scheduler Tests (THE-362)
 *
 * Run: cd packages/server && npx jest regulationCrawlScheduler --verbose
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Mock only triggerCrawl; keep CrawlerUnreachableError real so we can throw it.
jest.mock('../services/complianceCrawler.service', () => {
  const actual = jest.requireActual('../services/complianceCrawler.service');
  return { ...actual, triggerCrawl: jest.fn() };
});

import { triggerCrawl, CrawlerUnreachableError } from '../services/complianceCrawler.service';
import {
  CrawlLog,
  buildJobRegistry,
  isJobDue,
  runCrawlJob,
  type CrawlJob,
} from '../services/regulationCrawlScheduler.service';

const mockTrigger = triggerCrawl as jest.Mock;

const JOB: CrawlJob = { id: 'regulation-corpus', sources: ['lksg'], intervalMinutes: 60 };

const OK_RESPONSE = {
  results: [{ source: 'lksg', inserted: 7, updated: 0, embedded: 7, embedErrors: 0, skipped: 0 }],
  errors: [],
  embeddingEnabled: true,
};

describe('buildJobRegistry (env parsing)', () => {
  const ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ENV };
  });

  it('defaults to nis2,lksg,dsgvo weekly', () => {
    delete process.env.REGULATION_CRAWL_SOURCES;
    delete process.env.REGULATION_CRAWL_INTERVAL_MINUTES;
    delete process.env.REGULATION_CRAWL_ENABLED;
    const reg = buildJobRegistry();
    expect(reg).toHaveLength(1);
    expect(reg[0]).toMatchObject({ id: 'regulation-corpus', sources: ['nis2', 'lksg', 'dsgvo'], intervalMinutes: 10080 });
  });

  it('honours custom sources + interval, drops invalid sources', () => {
    process.env.REGULATION_CRAWL_SOURCES = 'lksg, bogus, DSGVO';
    process.env.REGULATION_CRAWL_INTERVAL_MINUTES = '1440';
    expect(buildJobRegistry()[0]).toMatchObject({ sources: ['lksg', 'dsgvo'], intervalMinutes: 1440 });
  });

  it('returns [] when disabled or no valid sources', () => {
    process.env.REGULATION_CRAWL_ENABLED = 'false';
    expect(buildJobRegistry()).toEqual([]);
    process.env.REGULATION_CRAWL_ENABLED = 'true';
    process.env.REGULATION_CRAWL_SOURCES = 'nonsense';
    expect(buildJobRegistry()).toEqual([]);
  });
});

describe('isJobDue + runCrawlJob (DB)', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await CrawlLog.ensureIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await CrawlLog.deleteMany({});
    mockTrigger.mockReset();
  });

  it('isJobDue: true when never run, false right after a run', async () => {
    expect(await isJobDue(JOB)).toBe(true);
    await CrawlLog.create({ jobId: JOB.id, sources: JOB.sources, status: 'success' });
    expect(await isJobDue(JOB)).toBe(false);
  });

  it('isJobDue: true again once the interval has elapsed', async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago, interval 60min
    await CrawlLog.create({ jobId: JOB.id, sources: JOB.sources, status: 'success', crawledAt: old });
    expect(await isJobDue(JOB)).toBe(true);
  });

  it('runCrawlJob: success writes a CrawlLog with aggregated counts + triggeredBy', async () => {
    mockTrigger.mockResolvedValue(OK_RESPONSE);
    const doc = await runCrawlJob(JOB);
    expect(mockTrigger).toHaveBeenCalledWith({ sources: ['lksg'] });
    expect(doc).toMatchObject({
      jobId: 'regulation-corpus',
      status: 'success',
      inserted: 7,
      embedded: 7,
      triggeredBy: 'scheduler',
    });
    expect(await CrawlLog.countDocuments({ status: 'success' })).toBe(1);
  });

  it('runCrawlJob: crawler unreachable → error CrawlLog, no throw', async () => {
    mockTrigger.mockRejectedValue(new CrawlerUnreachableError('crawler unreachable at http://…'));
    const doc = await runCrawlJob(JOB);
    expect(doc.status).toBe('error');
    expect(doc.error).toMatch(/unreachable/);
    expect(await CrawlLog.countDocuments({ status: 'error' })).toBe(1);
  });

  it('runCrawlJob: records manual trigger source', async () => {
    mockTrigger.mockResolvedValue(OK_RESPONSE);
    const doc = await runCrawlJob(JOB, 'manual');
    expect(doc.triggeredBy).toBe('manual');
  });
});
