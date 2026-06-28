/**
 * Canonical corpus reference for Art. 30 (ADR-0001). WFCOMP assessments store
 * this `{ regulationKey, versionHash }` for audit ("against which version?").
 *
 * - Key is ARTICLE-level `dsgvo:art-30` (the corpus crawls at article granularity);
 *   the Abs.-1 selection lives in WFCOMP's spec (ART30_FIELDS).
 * - versionHash is computed over OUR officially-verified verbatim — which seeds
 *   the canonical corpus entry — so the reference hash matches the corpus by
 *   construction once the ingest path (THE-368) exists.
 */
import { ART30_FULLTEXT } from './art30.seed-data';
import { buildRegulationKey, computeVersionHash } from '../services/wfcomp/regulationKey';

export const ART30_REGULATION_REF = {
  regulationKey: buildRegulationKey('dsgvo', 'Art. 30'),
  versionHash: computeVersionHash(ART30_FULLTEXT),
} as const;
