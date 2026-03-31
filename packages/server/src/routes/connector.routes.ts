import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { getAllConnectorTypes, getConnector } from '../services/connectors';
import { createTemporaryGraph, migrateTemporaryGraph } from '../services/upload.service';
import type { ConnectorConfig } from '../services/connectors';

const router = Router();

router.use(authenticate);

// In-memory connector configs (per project).
// Production: move to MongoDB with encrypted credentials.
const connectorStore = new Map<string, ConnectorConfig[]>();

function getProjectConnectors(projectId: string): ConnectorConfig[] {
  if (!connectorStore.has(projectId)) connectorStore.set(projectId, []);
  return connectorStore.get(projectId)!;
}

// GET /api/projects/:projectId/connectors/types
router.get(
  '/:projectId/connectors/types',
  requireProjectAccess('viewer'),
  async (_req: Request, res: Response) => {
    res.json({ success: true, data: getAllConnectorTypes() });
  },
);

// GET /api/projects/:projectId/connectors
router.get(
  '/:projectId/connectors',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const configs = getProjectConnectors(projectId).map(sanitize);
    res.json({ success: true, data: configs });
  },
);

// POST /api/projects/:projectId/connectors
router.post(
  '/:projectId/connectors',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { type, name, baseUrl, authMethod, credentials, mappingRules, syncIntervalMinutes, filters } = req.body;

      if (!type || !name || !baseUrl) {
        return res.status(400).json({ success: false, error: 'type, name, and baseUrl are required' });
      }

      const connector = getConnector(type);
      if (!connector) {
        return res.status(400).json({ success: false, error: `Unknown connector type: ${type}` });
      }

      const config: ConnectorConfig = {
        type, name, baseUrl, authMethod: authMethod || 'api_key',
        credentials: credentials || {},
        projectId,
        mappingRules: mappingRules || [],
        syncIntervalMinutes: syncIntervalMinutes || 0,
        filters: filters || {},
        enabled: true,
      };

      getProjectConnectors(projectId).push(config);
      res.json({ success: true, data: sanitize(config) });
    } catch (err) {
      console.error('[Connector] Create error:', err);
      res.status(500).json({ success: false, error: 'Failed to create connector' });
    }
  },
);

// POST /api/projects/:projectId/connectors/:connectorName/test
router.post(
  '/:projectId/connectors/:connectorName/test',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const connectorName = String(req.params.connectorName);
      const configs = getProjectConnectors(projectId);
      const config = configs.find(c => c.name === connectorName);

      if (!config) return res.status(404).json({ success: false, error: 'Connector not found' });

      const connector = getConnector(config.type);
      if (!connector) return res.status(400).json({ success: false, error: 'Connector type not registered' });

      const result = await connector.testConnection(config);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Test failed' });
    }
  },
);

// POST /api/projects/:projectId/connectors/:connectorName/sync
router.post(
  '/:projectId/connectors/:connectorName/sync',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const connectorName = String(req.params.connectorName);
      const configs = getProjectConnectors(projectId);
      const config = configs.find(c => c.name === connectorName);

      if (!config) return res.status(404).json({ success: false, error: 'Connector not found' });

      const connector = getConnector(config.type);
      if (!connector) return res.status(400).json({ success: false, error: 'Connector type not registered' });

      const start = Date.now();
      const fetchResult = await connector.fetchData(config);

      // Create temp graph, then migrate to project
      const parsed = {
        elements: fetchResult.elements,
        connections: fetchResult.connections,
        warnings: fetchResult.warnings,
        format: `connector:${config.type}`,
      };

      const graph = await createTemporaryGraph(parsed);
      const migrated = await migrateTemporaryGraph(graph.projectId, projectId);

      const syncResult = {
        connectorId: connectorName,
        status: 'success' as const,
        elementsCreated: fetchResult.elements.length,
        elementsUpdated: 0,
        connectionsCreated: fetchResult.connections.length,
        warnings: fetchResult.warnings,
        syncedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
        metadata: fetchResult.metadata,
      };

      res.json({ success: true, data: syncResult });
    } catch (err: any) {
      console.error('[Connector] Sync error:', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Sync failed',
        data: { status: 'error', error: err.message },
      });
    }
  },
);

// DELETE /api/projects/:projectId/connectors/:connectorName
router.delete(
  '/:projectId/connectors/:connectorName',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const connectorName = String(req.params.connectorName);
    const configs = getProjectConnectors(projectId);
    const idx = configs.findIndex(c => c.name === connectorName);
    if (idx >= 0) configs.splice(idx, 1);
    res.json({ success: true });
  },
);

// Sanitize: strip credentials from response
function sanitize(config: ConnectorConfig) {
  return {
    type: config.type,
    name: config.name,
    baseUrl: config.baseUrl,
    authMethod: config.authMethod,
    hasCredentials: Object.keys(config.credentials).length > 0,
    mappingRules: config.mappingRules,
    syncIntervalMinutes: config.syncIntervalMinutes,
    filters: config.filters,
    enabled: config.enabled,
    projectId: config.projectId,
  };
}

export default router;
