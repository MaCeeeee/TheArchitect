/**
 * THE-418 (.6-Kern) AC-1 proof: onboarding a new law = one SOURCE_CRAWL_CONFIG
 * data row in crawl-config.ts, ZERO code change to source-registry.ts (or any
 * other .ts logic file). DORA (CELEX 32022R2554) is the proof subject — it has
 * an ontology `normSources` row (norm-ontology.v1.ts) but, as of this test's
 * initial (red) state, no crawl-config.ts row, so it is unwired.
 *
 * This test file itself is the ONLY change needed to observe the red state
 * (resolveSourceParser('dora', env) === null). The commit that follows adds
 * ONLY the `dora` entry to SOURCE_CRAWL_CONFIG — `git show --stat` on that
 * commit shows a single file (crawl-config.ts) changed. That diff IS the AC-1
 * evidence: no source-registry.ts edit was needed to make DORA crawlable.
 */
import { resolveSourceParser } from '../sources/source-registry';
import { SOURCE_CRAWL_CONFIG } from '../sources/crawl-config';
import { isNormSource } from '@thearchitect/shared';

const env = { firecrawlKey: undefined, firecrawlUrl: undefined };

describe('DORA onboarding is a pure data row (THE-418 AC-1)', () => {
  it('dora is a valid ontology norm source', () => {
    expect(isNormSource('dora')).toBe(true);
  });

  it('SOURCE_CRAWL_CONFIG carries a dora row with celex 32022R2554', () => {
    expect(SOURCE_CRAWL_CONFIG.dora).toBeDefined();
    expect(SOURCE_CRAWL_CONFIG.dora.celex).toBe('32022R2554');
    expect(SOURCE_CRAWL_CONFIG.dora.transport).toBe('eur-lex');
  });

  it('resolveSourceParser builds a working EurLexSource for dora — no registry code change needed', () => {
    const parser = resolveSourceParser('dora', env) as any;
    expect(parser).not.toBeNull();
    expect(typeof parser?.crawl).toBe('function');
    expect(parser.constructor.name).toBe('EurLexSource');
    expect(parser.config.celex).toBe('32022R2554');
    expect(parser.config.jurisdiction).toBe('EU');
  });
});
