import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGODB_URI: z.string().url().or(z.string().startsWith('mongodb://')).or(z.string().startsWith('mongodb+srv://')),

  // Coolify passes empty strings for unset vars (not undefined). Treat "" as not-set
  // so deploys with EMBEDDING_SERVICE_URL= or QDRANT_URL= don't crash on Zod URL validation.
  EMBEDDING_SERVICE_URL: z.string().url().optional().or(z.literal('')),
  QDRANT_URL: z.string().url().optional().or(z.literal('')),
  QDRANT_API_KEY: z.string().optional(),

  // Firecrawl — JS-render scraper used for WAF-protected sources (EUR-Lex).
  // Linear: THE-285. If empty, nis2/dsgvo factories fall back to direct cheerio.
  FIRECRAWL_API_KEY: z.string().optional(),
  FIRECRAWL_API_URL: z.string().url().optional().or(z.literal('')),

  CRAWLER_USER_AGENT: z.string().default('TheArchitect-Compliance-Crawler/1.0'),
  CRAWLER_REQUEST_DELAY_MS: z.coerce.number().int().nonnegative().default(200),

  // Optional shared-secret for the write endpoints (/crawl, /embed-all). Defense-in-depth
  // for the otherwise-unauth crawler (security review): if set, callers must send a matching
  // X-Crawler-Token header. Empty = not enforced (Tailnet isolation only).
  CRAWLER_SHARED_SECRET: z.string().optional().or(z.literal('')),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config: Config = ConfigSchema.parse(process.env);
