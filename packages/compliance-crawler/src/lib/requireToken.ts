/**
 * Optional shared-secret guard for the crawler's write endpoints (security review).
 *
 * Defense-in-depth: the crawler is otherwise unauthenticated and relies on Tailnet
 * isolation. If CRAWLER_SHARED_SECRET is set, callers (the App's
 * complianceCrawler.service) must send a matching `X-Crawler-Token` header — so a
 * network misconfiguration alone no longer exposes an unauth write endpoint.
 * If the secret is empty/unset, the guard is a no-op (backward compatible).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';

export async function requireCrawlerToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const secret = config.CRAWLER_SHARED_SECRET;
  if (!secret) return; // not enforced
  const provided = req.headers['x-crawler-token'];
  if (provided !== secret) {
    reply.code(401).send({ error: 'unauthorized' });
  }
}
