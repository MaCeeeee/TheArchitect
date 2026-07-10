// routes/crawl.ts pulls in config, which requires MONGODB_URI (eager Zod parse
// on module load). Set before the import so config parses cleanly (see health.test.ts).
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/test';

import { CrawlBodySchema } from '../routes/crawl';

describe('crawl body source validation (THE-414)', () => {
  it('accepts ai-act-en (ontology source, no z.enum gate)', () => {
    expect(CrawlBodySchema.safeParse({ sources: ['ai-act-en'] }).success).toBe(true);
  });
  it('accepts a currently-unwired ontology source (dora) at the schema — registry emits not-implemented later', () => {
    expect(CrawlBodySchema.safeParse({ sources: ['dora'] }).success).toBe(true);
  });
  it('rejects a non-ontology source', () => {
    expect(CrawlBodySchema.safeParse({ sources: ['totally-made-up'] }).success).toBe(false);
  });
  it('still bounds the array (min 1, max 12)', () => {
    expect(CrawlBodySchema.safeParse({ sources: [] }).success).toBe(false);
  });
});
