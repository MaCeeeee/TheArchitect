import type { FastifyInstance, FastifyReply } from 'fastify';
import { mongoConnectionState } from '../db/mongo';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply: FastifyReply) => {
    const mongo = mongoConnectionState();
    // Return 503 when the data sink (Mongo) is unreachable so the Docker HEALTHCHECK
    // and Coolify reflect real readiness — a crawler that can't write isn't healthy.
    // The reconnect loop in db/mongo.ts heals this automatically once Mongo is back.
    reply.code(mongo.connected ? 200 : 503);
    return {
      status: mongo.connected ? 'ok' : 'degraded',
      service: '@thearchitect/compliance-crawler',
      mongo,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
}
