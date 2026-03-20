import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
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
import { rateLimit } from './middleware/rateLimit.middleware';

dotenv.config();

const PORT = process.env.PORT || 4000;

async function main() {
  const app = express();
  const server = http.createServer(app);

  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('dev'));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '0.1.0' });
  });

  // Global rate limit
  app.use(rateLimit({ windowMs: 60_000, max: 200, name: 'global' }));

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
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Connect databases
  await connectMongoDB();
  await connectNeo4j();

  // Initialize WebSocket
  initSocketServer(server);

  server.listen(PORT, () => {
    console.log(`[TheArchitect] Server running on http://localhost:${PORT}`);
    console.log(`[TheArchitect] WebSocket ready`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
