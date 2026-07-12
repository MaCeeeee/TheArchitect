/**
 * @thearchitect/compliance-crawler — Fastify entrypoint.
 *
 * Runs on Server B (Coolify), writes the canonical corpus to the dedicated
 * corpus MongoDB (ADR-0001), keyed by regulationKey. Triggered from the main
 * backend's POST /api/projects/:id/regulations/crawl (proxied over Tailscale).
 *
 * Linear: THE-272 (UC-ICM-001)
 */
import Fastify from 'fastify';
import sensible from '@fastify/sensible';
import { config } from './config';
import { connectMongo, disconnectMongo, setMongoLogger } from './db/mongo';
import { healthRoutes } from './routes/health';
import { crawlRoutes } from './routes/crawl';
import { embedAllRoutes } from './routes/embed-all';
import { corpusStatusRoutes } from './routes/corpus-status';

async function buildApp() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(healthRoutes);
  await app.register(crawlRoutes);
  await app.register(embedAllRoutes);
  await app.register(corpusStatusRoutes);

  return app;
}

async function start() {
  const app = await buildApp();

  // Route Mongo lifecycle/reconnect logs through pino.
  setMongoLogger(app.log);

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
