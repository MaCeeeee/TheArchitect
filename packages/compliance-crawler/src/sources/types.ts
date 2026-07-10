import type {
  RegulationSource,
  RegulationJurisdiction,
  RegulationLanguage,
} from '@thearchitect/shared';

/**
 * Output of a source-specific parser — pre-DB-write Regulation candidate.
 * The orchestrator then attaches projectId, sets defaults, and upserts to Mongo.
 */
export interface ParsedRegulation {
  source: RegulationSource;
  jurisdiction: RegulationJurisdiction;
  paragraphNumber: string;
  title: string;
  fullText: string;
  summary?: string;
  sourceUrl: string;
  effectiveFrom: Date;
  effectiveUntil?: Date;
  language: RegulationLanguage;
}

/** Provenance for every ingested fact (THE-414 AC-3, UC-PROV hook). Set at the write site from the registry entry. */
export interface Provenance {
  adapter: string;            // ingest adapter id, e.g. 'eur-lex'
  format: string;             // source format, e.g. 'html'
  fetchedAt?: Date;           // set at ingest
  sourceUri?: string;         // resolvable origin (per-paragraph URL)
}

export interface SourceParser {
  readonly source: RegulationSource;
  readonly description: string;
  /**
   * Fetch raw content from the source, parse, and return Regulation candidates.
   * Implementations should be idempotent and defensive against minor format changes.
   */
  crawl(): Promise<ParsedRegulation[]>;
}

export class SourceParseError extends Error {
  constructor(public readonly source: RegulationSource, message: string, public readonly cause?: unknown) {
    super(`[${source}] ${message}`);
    this.name = 'SourceParseError';
  }
}
