import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MONGODB_URI: z.string().url().or(z.string().startsWith('mongodb://')).or(z.string().startsWith('mongodb+srv://')),

  EMBEDDING_SERVICE_URL: z.string().url().optional(),
  QDRANT_URL: z.string().url().optional(),
  QDRANT_API_KEY: z.string().optional(),

  CRAWLER_USER_AGENT: z.string().default('TheArchitect-Compliance-Crawler/1.0'),
  CRAWLER_REQUEST_DELAY_MS: z.coerce.number().int().nonnegative().default(200),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config: Config = ConfigSchema.parse(process.env);
