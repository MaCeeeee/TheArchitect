/**
 * Regulation Crawl Scheduler (THE-362 / UC-AUTOCRAWL-001).
 *
 * Background cron on Server A that periodically triggers the corpus crawler on
 * Server B (via complianceCrawler.service) to keep the canonical regulation corpus
 * fresh — without a manual trigger. Corpus-native (ADR-0001): no projectId, the
 * crawler writes to the dedicated corpus store it's configured for.
 *
 * Job-registry shaped so RADAR (THE-310) can later register further sources without
 * touching the scheduler. Mirrors the proven sync-scheduler.service pattern.
 *
 * Config (env):
 *   REGULATION_CRAWL_SOURCES          comma list, default "nis2,lksg,dsgvo"
 *   REGULATION_CRAWL_INTERVAL_MINUTES default 10080 (weekly — laws change rarely)
 *   REGULATION_CRAWL_ENABLED          "false" to disable entirely
 */
import mongoose, { Schema, Document } from 'mongoose';
import { triggerCrawl, CrawlerUnreachableError, type RegulationSourceKey } from './complianceCrawler.service';
import { log } from '../config/logger';

// ─── CrawlLog Model (analog SyncLog) ───

export interface ICrawlLog extends Document {
  jobId: string;
  sources: string[];
  status: 'success' | 'error';
  inserted: number;
  updated: number;
  embedded: number;
  embedErrors: number;
  sourceErrors: number;
  durationMs: number;
  triggeredBy: 'scheduler' | 'manual';
  error?: string;
  crawledAt: Date;
}

const crawlLogSchema = new Schema<ICrawlLog>({
  jobId: { type: String, required: true },
  sources: [{ type: String }],
  status: { type: String, enum: ['success', 'error'], required: true },
  inserted: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  embedded: { type: Number, default: 0 },
  embedErrors: { type: Number, default: 0 },
  sourceErrors: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  triggeredBy: { type: String, enum: ['scheduler', 'manual'], default: 'scheduler' },
  error: { type: String },
  crawledAt: { type: Date, default: Date.now },
});

crawlLogSchema.index({ jobId: 1, crawledAt: -1 });
crawlLogSchema.index({ crawledAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // auto-delete after 90 days

export const CrawlLog = mongoose.model<ICrawlLog>('CrawlLog', crawlLogSchema);

// ─── Job registry ───

export interface CrawlJob {
  id: string;
  sources: RegulationSourceKey[];
  intervalMinutes: number;
}

const VALID_SOURCES: RegulationSourceKey[] = ['nis2', 'lksg', 'dsgvo', 'dora', 'iso27001', 'custom'];

/** Build the crawl-job registry from env. Returns [] when disabled / no valid sources. */
export function buildJobRegistry(): CrawlJob[] {
  if ((process.env.REGULATION_CRAWL_ENABLED ?? 'true').toLowerCase() === 'false') return [];

  const sources = (process.env.REGULATION_CRAWL_SOURCES ?? 'nis2,lksg,dsgvo')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter((s): s is RegulationSourceKey => (VALID_SOURCES as string[]).includes(s));

  if (sources.length === 0) return [];

  const intervalMinutes = Number(process.env.REGULATION_CRAWL_INTERVAL_MINUTES ?? 7 * 24 * 60);

  return [{ id: 'regulation-corpus', sources, intervalMinutes }];
}

// ─── Due-check + run (testable cores) ───

/** A job is due if it has never run, or interval has elapsed since its last run. */
export async function isJobDue(job: CrawlJob, now: number = Date.now()): Promise<boolean> {
  const last = await CrawlLog.findOne({ jobId: job.id }).sort({ crawledAt: -1 }).select('crawledAt');
  const lastRun = last?.crawledAt?.getTime() ?? 0;
  return now - lastRun >= job.intervalMinutes * 60 * 1000;
}

/**
 * Run one crawl job: trigger the corpus crawler, persist a CrawlLog. Never throws —
 * a crawler outage is recorded as a failed CrawlLog so the next tick simply retries.
 */
export async function runCrawlJob(
  job: CrawlJob,
  triggeredBy: 'scheduler' | 'manual' = 'scheduler',
): Promise<ICrawlLog> {
  const start = Date.now();
  try {
    const res = await triggerCrawl({ sources: job.sources });
    const agg = res.results.reduce(
      (a, r) => ({
        inserted: a.inserted + r.inserted,
        updated: a.updated + r.updated,
        embedded: a.embedded + r.embedded,
        embedErrors: a.embedErrors + r.embedErrors,
      }),
      { inserted: 0, updated: 0, embedded: 0, embedErrors: 0 },
    );
    const doc = await CrawlLog.create({
      jobId: job.id,
      sources: job.sources,
      status: 'success',
      ...agg,
      sourceErrors: res.errors.length,
      durationMs: Date.now() - start,
      triggeredBy,
    });
    log.info(
      { jobId: job.id, ...agg, sourceErrors: res.errors.length },
      '[crawl-scheduler] crawl completed',
    );
    return doc;
  } catch (err) {
    const message =
      err instanceof CrawlerUnreachableError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    log.warn({ jobId: job.id, err: message }, '[crawl-scheduler] crawl failed — will retry next tick');
    return CrawlLog.create({
      jobId: job.id,
      sources: job.sources,
      status: 'error',
      durationMs: Date.now() - start,
      triggeredBy,
      error: message,
    });
  }
}

// ─── Scheduler loop ───

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-evaluate "is anything due?" hourly
const activeJobs = new Set<string>();
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

async function runSchedulerCycle(): Promise<void> {
  try {
    const registry = buildJobRegistry();
    for (const job of registry) {
      if (activeJobs.has(job.id)) continue;
      if (!(await isJobDue(job))) continue;
      activeJobs.add(job.id);
      // Don't await — run in background; release the lock when done.
      runCrawlJob(job)
        .catch(err => log.error({ jobId: job.id, err }, '[crawl-scheduler] unhandled job error'))
        .finally(() => activeJobs.delete(job.id));
    }
  } catch (err) {
    log.error({ err }, '[crawl-scheduler] cycle error');
  }
}

export function startRegulationCrawlScheduler(): void {
  if (schedulerTimer) return;
  const registry = buildJobRegistry();
  if (registry.length === 0) {
    log.info('[crawl-scheduler] disabled / no sources configured — not starting');
    return;
  }
  log.info(
    { jobs: registry.map(j => ({ id: j.id, sources: j.sources, intervalMinutes: j.intervalMinutes })) },
    '[crawl-scheduler] starting',
  );
  setTimeout(() => runSchedulerCycle(), 60_000); // first check after boot settle
  schedulerTimer = setInterval(() => runSchedulerCycle(), CHECK_INTERVAL_MS);
}

export function stopRegulationCrawlScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
