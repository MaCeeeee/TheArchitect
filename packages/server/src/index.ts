import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import * as Sentry from '@sentry/node';
import { connectMongoDB } from './config/database';
import { connectNeo4j } from './config/neo4j';
import { initSocketServer } from './websocket/socketServer';
import authRoutes from './routes/auth.routes';
import projectRoutes from './routes/project.routes';
import architectureRoutes from './routes/architecture.routes';
import adminRoutes from './routes/admin.routes';
import analyticsRoutes from './routes/analytics.routes';
import governanceRoutes from './routes/governance.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import aiRoutes from './routes/ai.routes';
import standardsRoutes from './routes/standards.routes';
import xrayRoutes from './routes/xray.routes';
import settingsRoutes from './routes/settings.routes';
import workspaceRoutes from './routes/workspace.routes';
import simulationRoutes from './routes/simulation.routes';
import reportRoutes from './routes/report.routes';
import invitationRoutes from './routes/invitation.routes';
import advisorRoutes from './routes/advisor.routes';
import roadmapRoutes from './routes/roadmap.routes';
import demoRoutes from './routes/demo.routes';
import blueprintRoutes from './routes/blueprint.routes';
import remediationRoutes from './routes/remediation.routes';
import portfolioRoutes from './routes/portfolio.routes';
import importRoutes from './routes/import.routes';
import connectorRoutes from './routes/connector.routes';
import scenarioRoutes from './routes/scenario.routes';
import oracleRoutes from './routes/oracle.routes';
import snapshotRoutes from './routes/snapshot.routes';
import healthcheckRoutes from './routes/healthcheck.routes';
import waitlistRoutes from './routes/waitlist.routes';
import envisionAIRoutes from './routes/envision-ai.routes';
import { rateLimit } from './middleware/rateLimit.middleware';
import { startTempGraphCleanup } from './jobs/cleanup-temp-graphs';
import { startSyncScheduler } from './services/sync-scheduler.service';
import { log } from './config/logger';

dotenv.config();

// Sentry — initialize before anything else so it captures all errors
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
  log.info('[Sentry] Initialized');
}

// Process-level error handlers — prevent crashes during live demo
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'Unhandled promise rejection');
  if (process.env.SENTRY_DSN) Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'Uncaught exception — shutting down');
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
    Sentry.close(2000).then(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

const PORT = process.env.PORT || 4000;

async function main() {
  const app = express();
  const server = http.createServer(app);

  // Trust proxy for correct IP detection (rate limiting, logging) behind Caddy/nginx
  app.set('trust proxy', 1);

  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

  // Health check — verifies database connectivity
  app.get('/api/health', async (_req, res) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    // MongoDB
    try {
      const mongoose = await import('mongoose');
      checks.mongodb = mongoose.default.connection.readyState === 1 ? 'ok' : 'error';
    } catch { checks.mongodb = 'error'; }

    // Neo4j
    try {
      const { getNeo4jDriver } = await import('./config/neo4j');
      const session = getNeo4jDriver().session();
      await session.run('RETURN 1');
      await session.close();
      checks.neo4j = 'ok';
    } catch { checks.neo4j = 'error'; }

    // Redis
    try {
      const { getRedis } = await import('./config/redis');
      await getRedis().ping();
      checks.redis = 'ok';
    } catch { checks.redis = 'error'; }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      checks,
    });
  });

  // Global rate limit — disabled in dev to avoid 429s during rapid testing
  // SPA fires 30–50 parallel reads per page; API scripts add bursts on top.
  // AI routes have their own strict per-endpoint limits, so the global limit
  // only blocks actual abuse — keep it generous.
  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) {
    app.use(rateLimit({ windowMs: 60_000, max: 5000, name: 'global' }));
  }

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/projects', architectureRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/projects', analyticsRoutes);
  app.use('/api/projects', governanceRoutes);
  app.use('/api/marketplace', marketplaceRoutes);
  app.use('/api/projects', aiRoutes);
  app.use('/api/projects', standardsRoutes);
  app.use('/api/projects', xrayRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/workspaces', workspaceRoutes);
  app.use('/api/projects', simulationRoutes);
  app.use('/api/projects', reportRoutes);
  app.use('/api/projects', invitationRoutes);
  app.use('/api', invitationRoutes);
  app.use('/api/projects', advisorRoutes);
  app.use('/api/projects', roadmapRoutes);
  app.use('/api/demo', demoRoutes);
  app.use('/api', snapshotRoutes);        // Public: /api/snapshots/:token
  app.use('/api/projects', snapshotRoutes); // Protected: /api/projects/:projectId/snapshots
  app.use('/api/healthcheck', healthcheckRoutes);
  app.use('/api/projects', blueprintRoutes);
  app.use('/api/projects', remediationRoutes);
  app.use('/api/projects', portfolioRoutes);
  app.use('/api/projects', importRoutes);
  app.use('/api/projects', connectorRoutes);
  app.use('/api/projects', scenarioRoutes);
  app.use('/api/projects', oracleRoutes);
  app.use('/api/waitlist', waitlistRoutes);
  app.use('/api/projects', envisionAIRoutes);

  // Serve static client in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res, next) => {
      if (_req.path.startsWith('/api/') || _req.path.startsWith('/socket.io/')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error({ err }, 'Unhandled error');
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Connect databases
  await connectMongoDB();
  await connectNeo4j();

  // Initialize WebSocket
  initSocketServer(server);

  // Start temp graph cleanup cron
  startTempGraphCleanup();

  // Start integration sync scheduler
  startSyncScheduler();

  server.listen(PORT, () => {
    log.info({ port: PORT }, 'Server running');
    log.info('WebSocket ready');
  });
}

main().catch((err) => {
  log.fatal({ err }, 'Failed to start server');
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
    Sentry.close(2000).then(() => process.exit(1));
  } else {
    process.exit(1);
  }
});
