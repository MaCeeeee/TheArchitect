/**
 * Secret redaction helpers for safe logging (security hardening, THE-368 review).
 *
 * Mongoose/driver connection errors frequently embed the full connection string
 * (incl. password) in their message / nested fields. Never log such an error
 * object raw — run its text through `redactMongoUri` first.
 */

/** Replace credentials in any mongodb(+srv) URI with ***: "mongodb://user:pw@h" → "mongodb://***@h". */
export function redactMongoUri(text: string): string {
  return String(text).replace(/mongodb(\+srv)?:\/\/[^@\s/]+@/gi, 'mongodb$1://***@');
}

/** Safe one-line message for an unknown error, with any Mongo URI credentials scrubbed. */
export function safeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redactMongoUri(msg);
}
