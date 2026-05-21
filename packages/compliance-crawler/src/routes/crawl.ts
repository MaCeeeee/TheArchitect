import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Regulation } from '../db/regulation.model';
import { nis2EurLexSource, dsgvoEurLexSource } from '../sources/eur-lex';
import { lksgSource } from '../sources/gesetze-im-internet';
import type { SourceParser } from '../sources/types';
import type { RegulationSource } from '@thearchitect/shared';

const CrawlBodySchema = z.object({
  projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'projectId must be a valid ObjectId hex'),
  sources: z
    .array(z.enum(['nis2', 'lksg', 'dsgvo', 'dora', 'iso27001', 'custom']))
    .min(1),
});

/**
 * Source factory registry. Each entry returns a fresh `SourceParser` instance.
 * Add new sources here when adding new parsers (no further wiring needed).
 */
const SOURCE_REGISTRY: Partial<Record<RegulationSource, () => SourceParser>> = {
  nis2: () => nis2EurLexSource({ articleNumbers: [20, 21, 22, 23, 24] }),
  dsgvo: () => dsgvoEurLexSource({ articleNumbers: [5, 6, 9, 32] }),
  lksg: () => lksgSource({ paragraphNumbers: [3, 4, 5, 6, 7, 8, 9] }),
};

export async function crawlRoutes(app: FastifyInstance): Promise<void> {
  app.post('/crawl', async (request, reply) => {
    const parse = CrawlBodySchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', details: parse.error.flatten() });
    }
    const { projectId, sources } = parse.data;

    const projectObjectId = new mongoose.Types.ObjectId(projectId);
    const results: Array<{ source: string; inserted: number; updated: number; skipped: number }> = [];
    const errors: Array<{ source: string; message: string }> = [];

    for (const sourceKey of sources) {
      const factory = SOURCE_REGISTRY[sourceKey];
      if (!factory) {
        errors.push({ source: sourceKey, message: 'source not yet implemented' });
        continue;
      }

      try {
        const parser = factory();
        const parsed = await parser.crawl();

        let inserted = 0;
        let updated = 0;

        for (const p of parsed) {
          const filter = {
            projectId: projectObjectId,
            source: p.source,
            paragraphNumber: p.paragraphNumber,
            version: 1,
          };
          const result = await Regulation.updateOne(
            filter,
            {
              $set: {
                ...p,
                projectId: projectObjectId,
                crawledAt: new Date(),
              },
              $setOnInsert: { version: 1 },
            },
            { upsert: true, runValidators: true }
          );
          if (result.upsertedCount > 0) inserted += 1;
          else if (result.modifiedCount > 0) updated += 1;
        }

        results.push({
          source: sourceKey,
          inserted,
          updated,
          skipped: parsed.length - inserted - updated,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        request.log.error({ err, source: sourceKey }, 'crawl failed');
        errors.push({ source: sourceKey, message: msg });
      }
    }

    return reply.code(200).send({ results, errors });
  });
}
