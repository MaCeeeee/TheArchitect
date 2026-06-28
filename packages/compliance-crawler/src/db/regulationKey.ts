/**
 * Canonical regulation identity helpers (ADR-0001).
 *
 * The key logic (`buildRegulationKey`, `normaliseParagraph`) is the single source
 * of truth in `@thearchitect/shared` so the crawler and the server produce
 * byte-identical keys. We re-export it here for existing crawler imports.
 * `computeVersionHash` uses node:crypto and stays node-side.
 */
import * as crypto from 'node:crypto';

export { buildRegulationKey, normaliseParagraph } from '@thearchitect/shared';

/** Content version fingerprint — sha256 hex of the full legal text. */
export function computeVersionHash(fullText: string): string {
  return crypto.createHash('sha256').update(fullText, 'utf8').digest('hex');
}
