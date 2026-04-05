import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { getAllConnectorTypes, getConnector } from '../services/connectors';
import { createTemporaryGraph, migrateTemporaryGraph } from '../services/upload.service';
import type { ConnectorConfig, ConnectorType, AuthMethod } from '../services/connectors';
import { Connection, decryptCredentials } from '../models/Connection';
import { Project } from '../models/Project';

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

// ─── Project Integrations (references user Connections) ───

// GET available connections for the current user
router.get(
  '/:projectId/integrations/connections',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const conns = await Connection.find({ userId: req.user!._id }).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: conns.map((c) => ({ id: c._id, name: c.name, type: c.type, baseUrl: c.baseUrl })),
    });
  },
);

// GET project integrations
router.get(
  '/:projectId/integrations',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Populate connection info
    const connIds = (project.integrations || []).map((i) => i.connectionId);
    const conns = await Connection.find({ _id: { $in: connIds } });
    const connMap = new Map(conns.map((c) => [String(c._id), c]));

    const data = (project.integrations || []).map((integ) => {
      const conn = connMap.get(String(integ.connectionId));
      return {
        id: integ._id,
        connectionId: integ.connectionId,
        connectionName: conn?.name || '(deleted)',
        connectionType: conn?.type || '',
        baseUrl: conn?.baseUrl || '',
        filters: integ.filters,
        mappingRules: integ.mappingRules,
        syncIntervalMinutes: integ.syncIntervalMinutes,
        enabled: integ.enabled,
        lastSync: integ.lastSync,
      };
    });

    res.json({ success: true, data });
  },
);

// POST add integration to project
router.post(
  '/:projectId/integrations',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const project = await Project.findById(req.params.projectId);
      if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

      const { connectionId, filters, mappingRules, syncIntervalMinutes } = req.body;
      if (!connectionId) return res.status(400).json({ success: false, error: 'connectionId is required' });

      // Verify user owns the connection
      const conn = await Connection.findOne({ _id: connectionId, userId: req.user!._id });
      if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

      if (!project.integrations) project.integrations = [];
      project.integrations.push({
        connectionId: conn._id,
        filters: filters || {},
        mappingRules: mappingRules || [],
        syncIntervalMinutes: syncIntervalMinutes || 0,
        enabled: true,
      });
      await project.save();

      const added = project.integrations[project.integrations.length - 1];
      res.status(201).json({
        success: true,
        data: {
          id: added._id,
          connectionId: conn._id,
          connectionName: conn.name,
          connectionType: conn.type,
          baseUrl: conn.baseUrl,
          filters: added.filters,
          mappingRules: added.mappingRules,
          syncIntervalMinutes: added.syncIntervalMinutes,
          enabled: added.enabled,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to add integration' });
    }
  },
);

// DELETE remove integration from project
router.delete(
  '/:projectId/integrations/:integrationId',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    project.integrations = (project.integrations || []).filter(
      (i) => String(i._id) !== req.params.integrationId,
    );
    await project.save();
    res.json({ success: true });
  },
);

// POST sync integration
router.post(
  '/:projectId/integrations/:integrationId/sync',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const project = await Project.findById(req.params.projectId);
      if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

      const integ = (project.integrations || []).find(
        (i) => String(i._id) === req.params.integrationId,
      );
      if (!integ) return res.status(404).json({ success: false, error: 'Integration not found' });

      const conn = await Connection.findOne({ _id: integ.connectionId, userId: req.user!._id });
      if (!conn) return res.status(404).json({ success: false, error: 'Connection not found or access denied' });

      const connector = getConnector(conn.type as ConnectorType);
      if (!connector) return res.status(400).json({ success: false, error: 'Connector type not registered' });

      const config: ConnectorConfig = {
        type: conn.type as ConnectorType,
        name: conn.name,
        baseUrl: conn.baseUrl,
        authMethod: conn.authMethod as AuthMethod,
        credentials: decryptCredentials(conn.credentials),
        projectId: String(project._id),
        mappingRules: integ.mappingRules.map((r) => ({ ...r, fieldMappings: [] })),
        syncIntervalMinutes: integ.syncIntervalMinutes,
        filters: integ.filters as Record<string, string>,
        enabled: integ.enabled,
      };

      const start = Date.now();
      const fetchResult = await connector.fetchData(config);

      const parsed = {
        elements: fetchResult.elements,
        connections: fetchResult.connections,
        warnings: fetchResult.warnings,
        format: `connector:${conn.type}`,
      };

      const graph = await createTemporaryGraph(parsed);
      await migrateTemporaryGraph(graph.projectId, String(project._id));

      integ.lastSync = {
        status: 'success',
        syncedAt: new Date(),
        elementsCreated: fetchResult.elements.length,
        connectionsCreated: fetchResult.connections.length,
        durationMs: Date.now() - start,
        warnings: fetchResult.warnings,
      };
      project.markModified('integrations');
      await project.save();

      res.json({ success: true, data: integ.lastSync });
    } catch (err: any) {
      console.error('[Integration] Sync error:', err);
      res.status(500).json({ success: false, error: err.message || 'Sync failed' });
    }
  },
);

// POST test integration connection
router.post(
  '/:projectId/integrations/:integrationId/test',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const integ = (project.integrations || []).find(
      (i) => String(i._id) === req.params.integrationId,
    );
    if (!integ) return res.status(404).json({ success: false, error: 'Integration not found' });

    const conn = await Connection.findOne({ _id: integ.connectionId, userId: req.user!._id });
    if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

    const connector = getConnector(conn.type as ConnectorType);
    if (!connector) return res.status(400).json({ success: false, error: 'Connector type not registered' });

    const config: ConnectorConfig = {
      type: conn.type as ConnectorType,
      name: conn.name,
      baseUrl: conn.baseUrl,
      authMethod: conn.authMethod as AuthMethod,
      credentials: decryptCredentials(conn.credentials),
      projectId: '',
      mappingRules: [],
      syncIntervalMinutes: 0,
      filters: integ.filters as Record<string, string>,
      enabled: true,
    };

    const result = await connector.testConnection(config);
    res.json({ success: true, data: result });
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
