/**
 * @thearchitect/compliance-crawler — Fastify entrypoint.
 *
 * Runs on Server B (Coolify), writes to Server A's MongoDB via Tailscale.
 * Triggered from the main backend's POST /api/projects/:id/regulations/crawl
 * (which proxies to this service over Tailscale).
 *
 * Linear: THE-272 (UC-ICM-001)
 */
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { config } from './config';
import { connectMongo, disconnectMongo } from './db/mongo';
import { healthRoutes } from './routes/health';
import { crawlRoutes } from './routes/crawl';

async function buildApp() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(healthRoutes);
  await app.register(crawlRoutes);

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await connectMongo();
    app.log.info('MongoDB connection established');
  } catch (err) {
    app.log.error({ err }, 'MongoDB connection failed — service starts in degraded mode');
    // Don't exit — /health will report degraded; ops can fix MONGODB_URI without redeploy
  }

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start Fastify');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await disconnectMongo();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  start();
}

export { buildApp };
