/**
 * Sentry PII-scrub (REQ-WFCOMP-001.8 / THE-360 — Live-Wiring Landmine #1).
 *
 * The WFCOMP assess route ingests raw n8n workflow JSON, which may carry
 * personal data (hardcoded values, pinData). Sentry can attach the request
 * body to error events → that would export PII to Sentry (US SaaS) and make
 * the Art.-30 tool itself a data exporter. This strips the request body from
 * every event before it leaves the process. Global defense-in-depth.
 */
// Structural shape only (no index signatures) so Sentry's `ErrorEvent` is
// assignable to it and the function stays decoupled from the SDK + testable.
export interface ScrubbableEvent {
  request?: { data?: unknown };
}

/** Remove the request body from a Sentry event. Returns the same event. */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.request && 'data' in event.request) {
    delete event.request.data;
  }
  return event;
}
