/**
 * Cron job: Clean up temporary Neo4j graphs older than 24 hours.
 * Temporary graphs are created by the public Health Check upload flow
 * and identified by projectId prefix "tmp-".
 */
import { cleanupTemporaryGraphs } from '../services/upload.service';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every hour
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startTempGraphCleanup(): void {
  // Run once at startup
  runCleanup();

  // Then every hour
  intervalId = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  console.log('[Cleanup] Temporary graph cleanup scheduled (every 1h)');
}

export function stopTempGraphCleanup(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function runCleanup(): Promise<void> {
  try {
    const deleted = await cleanupTemporaryGraphs();
    if (deleted > 0) {
      console.log(`[Cleanup] Removed ${deleted} expired temporary graph elements`);
    }
  } catch (err) {
    console.error('[Cleanup] Temp graph cleanup failed:', err);
  }
}
