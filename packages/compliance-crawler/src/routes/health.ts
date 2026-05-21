import type { FastifyInstance } from 'fastify';
import { mongoConnectionState } from '../db/mongo';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const mongo = mongoConnectionState();
    return {
      status: mongo.connected ? 'ok' : 'degraded',
      service: '@thearchitect/compliance-crawler',
      mongo,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
}
