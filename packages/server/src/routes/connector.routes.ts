import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { getAllConnectorTypes, getConnector, getEnrichmentConnector, getAllEnrichmentConnectorTypes } from '../services/connectors';
import { createTemporaryGraph, migrateTemporaryGraph } from '../services/upload.service';
import type { ConnectorConfig, ConnectorType, AuthMethod } from '../services/connectors';
import { Connection, decryptCredentials } from '../models/Connection';
import { ConnectorConfigModel, toConnectorConfig, encryptCredentials } from '../models/ConnectorConfig';
import { Project } from '../models/Project';
import { SyncLog } from '../services/sync-scheduler.service';
import { matchEnrichments } from '../services/enrichment-matcher.service';
import { runCypher } from '../config/neo4j';
import type { CostFields, ConflictStrategy, CostEnrichmentResult } from '@thearchitect/shared';

const router = Router();

router.use(authenticate);

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
    const docs = await ConnectorConfigModel.find({ projectId }).lean();
    const configs = docs.map((d) => ({
      type: d.type,
      name: d.name,
      baseUrl: d.baseUrl,
      authMethod: d.authMethod,
      hasCredentials: !!d.credentials,
      mappingRules: d.mappingRules,
      syncIntervalMinutes: d.syncIntervalMinutes,
      filters: d.filters,
      enabled: d.enabled,
      projectId: d.projectId,
    }));
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

      const doc = await ConnectorConfigModel.create({
        projectId, type, name, baseUrl,
        authMethod: authMethod || 'api_key',
        credentials: credentials ? encryptCredentials(credentials) : '',
        mappingRules: mappingRules || [],
        syncIntervalMinutes: syncIntervalMinutes || 0,
        filters: filters || {},
        enabled: true,
      });

      res.json({ success: true, data: sanitize(toConnectorConfig(doc)) });
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
      const doc = await ConnectorConfigModel.findOne({ projectId, name: connectorName });

      if (!doc) return res.status(404).json({ success: false, error: 'Connector not found' });

      const config = toConnectorConfig(doc);
      const connector = getConnector(config.type as ConnectorType);
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
      const doc = await ConnectorConfigModel.findOne({ projectId, name: connectorName });

      if (!doc) return res.status(404).json({ success: false, error: 'Connector not found' });

      const config = toConnectorConfig(doc);
      const connector = getConnector(config.type as ConnectorType);
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
      await migrateTemporaryGraph(graph.projectId, projectId);

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
    await ConnectorConfigModel.deleteOne({ projectId, name: connectorName });
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

// ─── Cost Enrichment Endpoints ───

// GET enrichment connector types
router.get(
  '/:projectId/enrichment/connector-types',
  requireProjectAccess('viewer'),
  async (_req: Request, res: Response) => {
    res.json({ success: true, data: getAllEnrichmentConnectorTypes() });
  },
);

// POST CSV enrichment preview — match CSV rows to elements via AI
router.post(
  '/:projectId/enrichment/csv-preview',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { rows } = req.body as {
        rows: Array<{ matchColumn: string; fields: Partial<CostFields> }>;
      };

      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, error: 'rows array is required' });
      }

      // Convert CSV rows to CostEnrichmentResult format for matching
      const enrichments: CostEnrichmentResult[] = rows.map((row, i) => ({
        sourceKey: row.matchColumn || `row-${i}`,
        sourceName: row.matchColumn || `Row ${i + 1}`,
        fields: row.fields,
        confidence: 1.0,
        metadata: { source: 'csv' },
      }));

      const preview = await matchEnrichments(projectId, enrichments, 'csv');
      res.json({ success: true, data: preview });
    } catch (err: any) {
      console.error('[Enrichment] CSV preview error:', err);
      res.status(500).json({ success: false, error: err.message || 'Preview failed' });
    }
  },
);

// POST connector enrichment preview — fetch from connector + match
router.post(
  '/:projectId/enrichment/connector-preview',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { connectionId, filters } = req.body;

      if (!connectionId) {
        return res.status(400).json({ success: false, error: 'connectionId is required' });
      }

      const conn = await Connection.findOne({ _id: connectionId, userId: req.user!._id });
      if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

      const enrichConnector = getEnrichmentConnector(conn.type as ConnectorType);
      if (!enrichConnector) {
        return res.status(400).json({ success: false, error: `No enrichment connector for type: ${conn.type}` });
      }

      const config: ConnectorConfig = {
        type: conn.type as ConnectorType,
        name: conn.name,
        baseUrl: conn.baseUrl,
        authMethod: conn.authMethod as AuthMethod,
        credentials: decryptCredentials(conn.credentials),
        projectId,
        mappingRules: [],
        syncIntervalMinutes: 0,
        filters: filters || {},
        enabled: true,
      };

      const { enrichments, warnings } = await enrichConnector.fetchCostData(config);
      const preview = await matchEnrichments(projectId, enrichments, conn.type);

      res.json({ success: true, data: { ...preview, warnings } });
    } catch (err: any) {
      console.error('[Enrichment] Connector preview error:', err);
      res.status(500).json({ success: false, error: err.message || 'Preview failed' });
    }
  },
);

// POST connector discover sources (list projects in external tool)
router.post(
  '/:projectId/enrichment/discover',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const { connectionId } = req.body;
      if (!connectionId) {
        return res.status(400).json({ success: false, error: 'connectionId is required' });
      }

      const conn = await Connection.findOne({ _id: connectionId, userId: req.user!._id });
      if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

      const enrichConnector = getEnrichmentConnector(conn.type as ConnectorType);
      if (!enrichConnector) {
        return res.status(400).json({ success: false, error: `No enrichment connector for type: ${conn.type}` });
      }

      const config: ConnectorConfig = {
        type: conn.type as ConnectorType,
        name: conn.name,
        baseUrl: conn.baseUrl,
        authMethod: conn.authMethod as AuthMethod,
        credentials: decryptCredentials(conn.credentials),
        projectId: '',
        mappingRules: [],
        syncIntervalMinutes: 0,
        filters: {},
        enabled: true,
      };

      const sources = await enrichConnector.discoverSources(config);
      res.json({ success: true, data: sources });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Discovery failed' });
    }
  },
);

// POST apply enrichment — update elements with cost data
router.post(
  '/:projectId/enrichment/apply',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { matches } = req.body as {
        matches: Array<{
          elementId: string;
          fields: Partial<CostFields>;
          conflictStrategy: ConflictStrategy;
        }>;
      };

      if (!matches || !Array.isArray(matches) || matches.length === 0) {
        return res.status(400).json({ success: false, error: 'matches array is required' });
      }

      const VALID_FIELDS = new Set([
        'annualCost', 'transformationStrategy', 'userCount', 'recordCount',
        'ksloc', 'technicalFitness', 'functionalFitness', 'errorRatePercent',
        'hourlyRate', 'monthlyInfraCost', 'technicalDebtRatio',
        'costEstimateOptimistic', 'costEstimateMostLikely', 'costEstimatePessimistic',
        'successProbability', 'costOfDelayPerWeek',
      ]);

      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const match of matches) {
        try {
          // Filter to valid cost fields only
          const safeFields: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(match.fields)) {
            if (VALID_FIELDS.has(key) && value !== null && value !== undefined && String(value) !== '') {
              safeFields[key] = value;
            }
          }

          if (Object.keys(safeFields).length === 0) {
            skipped++;
            continue;
          }

          if (match.conflictStrategy === 'skip') {
            // Only set fields that are currently null/undefined on the element
            const existing = await runCypher(
              `MATCH (e:ArchitectureElement {id: $id, projectId: $projectId})
               RETURN e`,
              { id: match.elementId, projectId },
            );

            if (existing.length === 0) {
              errors.push(`Element ${match.elementId} not found`);
              continue;
            }

            const props = serializeNeo4jProps(existing[0].get('e').properties);
            const fieldsToSet: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(safeFields)) {
              if (props[key] === null || props[key] === undefined) {
                fieldsToSet[key] = value;
              }
            }

            if (Object.keys(fieldsToSet).length === 0) {
              skipped++;
              continue;
            }

            await setCostFields(match.elementId, projectId, fieldsToSet);
            updated++;
          } else if (match.conflictStrategy === 'higher_wins') {
            // For numeric fields, keep whichever value is higher
            const existing = await runCypher(
              `MATCH (e:ArchitectureElement {id: $id, projectId: $projectId})
               RETURN e`,
              { id: match.elementId, projectId },
            );

            if (existing.length === 0) {
              errors.push(`Element ${match.elementId} not found`);
              continue;
            }

            const props = serializeNeo4jProps(existing[0].get('e').properties);
            const fieldsToSet: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(safeFields)) {
              const cur = props[key];
              if (cur === null || cur === undefined || typeof value !== 'number' || typeof cur !== 'number') {
                fieldsToSet[key] = value;
              } else if (value > cur) {
                fieldsToSet[key] = value;
              }
            }

            if (Object.keys(fieldsToSet).length === 0) {
              skipped++;
              continue;
            }

            await setCostFields(match.elementId, projectId, fieldsToSet);
            updated++;
          } else {
            // Default: overwrite
            await setCostFields(match.elementId, projectId, safeFields);
            updated++;
          }
        } catch (err: any) {
          errors.push(`${match.elementId}: ${err.message}`);
        }
      }

      res.json({ success: true, data: { updated, skipped, errors } });
    } catch (err: any) {
      console.error('[Enrichment] Apply error:', err);
      res.status(500).json({ success: false, error: err.message || 'Apply failed' });
    }
  },
);

async function setCostFields(elementId: string, projectId: string, fields: Record<string, unknown>): Promise<void> {
  const setParts: string[] = [];
  const params: Record<string, unknown> = { id: elementId, projectId };

  for (const [key, value] of Object.entries(fields)) {
    const paramKey = `f_${key}`;
    setParts.push(`e.${key} = $${paramKey}`);
    params[paramKey] = value;
  }

  setParts.push('e.updatedAt = datetime()');

  await runCypher(
    `MATCH (e:ArchitectureElement {id: $id, projectId: $projectId})
     SET ${setParts.join(', ')}`,
    params,
  );
}

function serializeNeo4jProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
      result[key] = (value as { low: number }).low;
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Sanitize: strip credentials from response
function sanitize(config: any) {
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

// ─── Sync History ───

// GET sync logs for a project
router.get(
  '/:projectId/sync-logs',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const [logs, total] = await Promise.all([
      SyncLog.find({ projectId })
        .sort({ syncedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      SyncLog.countDocuments({ projectId }),
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: { total, limit, offset },
    });
  },
);

export default router;
