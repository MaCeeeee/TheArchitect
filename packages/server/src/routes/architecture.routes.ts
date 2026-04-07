import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import axios from 'axios';
import { runCypher, serializeNeo4jProperties } from '../config/neo4j';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { evaluateElementPolicies } from '../services/policy-evaluation.service';

const router = Router();

// Validation schemas
const Position3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const LayerEnum = z.enum([
  'motivation', 'strategy', 'business', 'information', 'application',
  'technology', 'physical', 'implementation_migration',
]);

const TOGAFDomainEnum = z.enum([
  'business', 'data', 'application', 'technology', 'motivation', 'implementation', 'strategy',
]);

const ProviderEnum = z.enum(['openai', 'anthropic', 'google', 'azure', 'custom']);
const AutonomyEnum = z.enum(['copilot', 'semi_autonomous', 'autonomous']);

const SevenRsEnum = z.enum(['retain', 'retire', 'rehost', 'relocate', 'replatform', 'repurchase', 'refactor']);

const CreateElementSchema = z.object({
  id: z.string().optional(),
  type: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  layer: LayerEnum,
  togafDomain: TOGAFDomainEnum,
  maturityLevel: z.number().int().min(1).max(5).default(1),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
  status: z.enum(['current', 'target', 'transitional', 'retired']).default('current'),
  position3D: Position3DSchema.default({ x: 0, y: 0, z: 0 }),
  metadata: z.record(z.unknown()).default({}),
  // Cost fields (Tier 1)
  annualCost: z.number().min(0).optional(),
  userCount: z.number().int().min(0).optional(),
  recordCount: z.number().int().min(0).optional(),
  transformationStrategy: SevenRsEnum.optional(),
  // Cost fields (Tier 2)
  ksloc: z.number().min(0).optional(),
  technicalFitness: z.number().min(1).max(5).optional(),
  functionalFitness: z.number().min(1).max(5).optional(),
  errorRatePercent: z.number().min(0).max(100).optional(),
  hourlyRate: z.number().min(0).optional(),
  monthlyInfraCost: z.number().min(0).optional(),
  technicalDebtRatio: z.number().min(0).max(1).optional(),
  // Cost fields (Tier 3)
  costEstimateOptimistic: z.number().min(0).optional(),
  costEstimateMostLikely: z.number().min(0).optional(),
  costEstimatePessimistic: z.number().min(0).optional(),
  successProbability: z.number().min(0).max(1).optional(),
  costOfDelayPerWeek: z.number().min(0).optional(),
  // AI Agent fields
  agentProvider: ProviderEnum.optional(),
  agentModel: z.string().max(100).optional(),
  agentPurpose: z.string().max(500).optional(),
  autonomyLevel: AutonomyEnum.optional(),
  costPerMonth: z.number().min(0).optional(),
  lastActiveDate: z.string().optional(),
  dataSources: z.array(z.string()).optional(),
  outputTargets: z.array(z.string()).optional(),
});

const UpdateElementSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  layer: LayerEnum.optional(),
  togafDomain: TOGAFDomainEnum.optional(),
  maturityLevel: z.number().int().min(1).max(5).optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['current', 'target', 'transitional', 'retired']).optional(),
  position3D: Position3DSchema.optional(),
  // Cost fields (Tier 1)
  annualCost: z.number().min(0).optional(),
  userCount: z.number().int().min(0).optional(),
  recordCount: z.number().int().min(0).optional(),
  transformationStrategy: SevenRsEnum.optional(),
  // Cost fields (Tier 2)
  ksloc: z.number().min(0).optional(),
  technicalFitness: z.number().min(1).max(5).optional(),
  functionalFitness: z.number().min(1).max(5).optional(),
  errorRatePercent: z.number().min(0).max(100).optional(),
  hourlyRate: z.number().min(0).optional(),
  monthlyInfraCost: z.number().min(0).optional(),
  technicalDebtRatio: z.number().min(0).max(1).optional(),
  // Cost fields (Tier 3)
  costEstimateOptimistic: z.number().min(0).optional(),
  costEstimateMostLikely: z.number().min(0).optional(),
  costEstimatePessimistic: z.number().min(0).optional(),
  successProbability: z.number().min(0).max(1).optional(),
  costOfDelayPerWeek: z.number().min(0).optional(),
  // AI Agent fields
  agentProvider: ProviderEnum.optional(),
  agentModel: z.string().max(100).optional(),
  agentPurpose: z.string().max(500).optional(),
  autonomyLevel: AutonomyEnum.optional(),
  costPerMonth: z.number().min(0).optional(),
  lastActiveDate: z.string().optional(),
  dataSources: z.array(z.string()).optional(),
  outputTargets: z.array(z.string()).optional(),
});

const CreateConnectionSchema = z.object({
  id: z.string().optional(),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  type: z.string().default('depends_on'),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// All routes require authentication
router.use(authenticate);

// All routes with :projectId require project membership
router.use('/:projectId', requireProjectAccess('viewer'));

// Get all elements for a project
router.get(
  '/:projectId/elements',
  requirePermission(PERMISSIONS.ELEMENT_READ),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const records = await runCypher(
        'MATCH (e:ArchitectureElement {projectId: $projectId}) RETURN e',
        { projectId }
      );
      const elements = records.map((r) => {
        const props = serializeNeo4jProperties(r.get('e').properties);
        let metadata = {};
        try { if (props.metadataJson) metadata = JSON.parse(props.metadataJson as string); } catch { /* ignore */ }
        return {
          ...props,
          position3D: { x: props.posX || 0, y: props.posY || 0, z: props.posZ || 0 },
          metadata,
        };
      });
      res.json({ success: true, data: elements });
    } catch (err) {
      console.error('Get elements error:', err);
      res.status(500).json({ success: false, error: 'Failed to get elements' });
    }
  }
);

// Create element
router.post(
  '/:projectId/elements',
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  audit({ action: 'create_element', entityType: 'element', getAfter: (req) => req.body }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = CreateElementSchema.parse(req.body);
      const element = { id: parsed.id || uuid(), projectId, ...parsed };

      const cypher = `CREATE (e:ArchitectureElement {
          id: $id, projectId: $projectId, type: $type, name: $name,
          description: $description, layer: $layer, togafDomain: $togafDomain,
          maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
          posX: $posX, posY: $posY, posZ: $posZ,
          metadataJson: $metadataJson,
          annualCost: $annualCost, userCount: $userCount,
          recordCount: $recordCount, transformationStrategy: $transformationStrategy,
          ksloc: $ksloc, technicalFitness: $technicalFitness,
          functionalFitness: $functionalFitness, errorRatePercent: $errorRatePercent,
          hourlyRate: $hourlyRate, monthlyInfraCost: $monthlyInfraCost,
          technicalDebtRatio: $technicalDebtRatio,
          costEstimateOptimistic: $costEstimateOptimistic,
          costEstimateMostLikely: $costEstimateMostLikely,
          costEstimatePessimistic: $costEstimatePessimistic,
          successProbability: $successProbability,
          costOfDelayPerWeek: $costOfDelayPerWeek,
          agentProvider: $agentProvider, agentModel: $agentModel,
          agentPurpose: $agentPurpose, autonomyLevel: $autonomyLevel,
          costPerMonth: $costPerMonth,
          createdAt: datetime(), updatedAt: datetime()
        }) RETURN e`;

      await runCypher(cypher, {
          id: element.id,
          projectId,
          type: element.type,
          name: element.name,
          description: element.description,
          layer: element.layer,
          togafDomain: element.togafDomain,
          maturityLevel: element.maturityLevel,
          riskLevel: element.riskLevel,
          status: element.status,
          posX: element.position3D.x,
          posY: element.position3D.y,
          posZ: element.position3D.z,
          metadataJson: JSON.stringify(element.metadata || {}),
          annualCost: element.annualCost ?? null,
          userCount: element.userCount ?? null,
          recordCount: element.recordCount ?? null,
          transformationStrategy: element.transformationStrategy || null,
          ksloc: element.ksloc ?? null,
          technicalFitness: element.technicalFitness ?? null,
          functionalFitness: element.functionalFitness ?? null,
          errorRatePercent: element.errorRatePercent ?? null,
          hourlyRate: element.hourlyRate ?? null,
          monthlyInfraCost: element.monthlyInfraCost ?? null,
          technicalDebtRatio: element.technicalDebtRatio ?? null,
          costEstimateOptimistic: element.costEstimateOptimistic ?? null,
          costEstimateMostLikely: element.costEstimateMostLikely ?? null,
          costEstimatePessimistic: element.costEstimatePessimistic ?? null,
          successProbability: element.successProbability ?? null,
          costOfDelayPerWeek: element.costOfDelayPerWeek ?? null,
          agentProvider: element.agentProvider || null,
          agentModel: element.agentModel || null,
          agentPurpose: element.agentPurpose || null,
          autonomyLevel: element.autonomyLevel || null,
          costPerMonth: element.costPerMonth ?? null,
        }
      );

      res.status(201).json({ success: true, data: element });

      // Fire-and-forget: evaluate policies against new element
      evaluateElementPolicies(String(projectId), element.id, 'create').catch((e) =>
        console.error('[PolicyEval] create hook error:', e),
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
        return;
      }
      console.error('Create element error:', err);
      res.status(500).json({ success: false, error: 'Failed to create element' });
    }
  }
);

// Update element
router.put(
  '/:projectId/elements/:elementId',
  requirePermission(PERMISSIONS.ELEMENT_UPDATE),
  audit({ action: 'update_element', entityType: 'element', getAfter: (req) => req.body }),
  async (req: Request, res: Response) => {
    try {
      const { elementId } = req.params;
      const parsed = UpdateElementSchema.parse(req.body);

      const setFields: string[] = [];
      const params: Record<string, unknown> = { elementId };

      if (parsed.name !== undefined) { setFields.push('e.name = $name'); params.name = parsed.name; }
      if (parsed.description !== undefined) { setFields.push('e.description = $description'); params.description = parsed.description; }
      if (parsed.layer !== undefined) { setFields.push('e.layer = $layer'); params.layer = parsed.layer; }
      if (parsed.togafDomain !== undefined) { setFields.push('e.togafDomain = $togafDomain'); params.togafDomain = parsed.togafDomain; }
      if (parsed.maturityLevel !== undefined) { setFields.push('e.maturityLevel = $maturityLevel'); params.maturityLevel = parsed.maturityLevel; }
      if (parsed.riskLevel !== undefined) { setFields.push('e.riskLevel = $riskLevel'); params.riskLevel = parsed.riskLevel; }
      if (parsed.status !== undefined) { setFields.push('e.status = $status'); params.status = parsed.status; }
      if (parsed.position3D) {
        setFields.push('e.posX = $posX', 'e.posY = $posY', 'e.posZ = $posZ');
        params.posX = parsed.position3D.x;
        params.posY = parsed.position3D.y;
        params.posZ = parsed.position3D.z;
      }
      // Cost fields (Tier 1)
      if (parsed.annualCost !== undefined) { setFields.push('e.annualCost = $annualCost'); params.annualCost = parsed.annualCost; }
      if (parsed.userCount !== undefined) { setFields.push('e.userCount = $userCount'); params.userCount = parsed.userCount; }
      if (parsed.recordCount !== undefined) { setFields.push('e.recordCount = $recordCount'); params.recordCount = parsed.recordCount; }
      if (parsed.transformationStrategy !== undefined) { setFields.push('e.transformationStrategy = $transformationStrategy'); params.transformationStrategy = parsed.transformationStrategy; }
      // Cost fields (Tier 2)
      if (parsed.ksloc !== undefined) { setFields.push('e.ksloc = $ksloc'); params.ksloc = parsed.ksloc; }
      if (parsed.technicalFitness !== undefined) { setFields.push('e.technicalFitness = $technicalFitness'); params.technicalFitness = parsed.technicalFitness; }
      if (parsed.functionalFitness !== undefined) { setFields.push('e.functionalFitness = $functionalFitness'); params.functionalFitness = parsed.functionalFitness; }
      if (parsed.errorRatePercent !== undefined) { setFields.push('e.errorRatePercent = $errorRatePercent'); params.errorRatePercent = parsed.errorRatePercent; }
      if (parsed.hourlyRate !== undefined) { setFields.push('e.hourlyRate = $hourlyRate'); params.hourlyRate = parsed.hourlyRate; }
      if (parsed.monthlyInfraCost !== undefined) { setFields.push('e.monthlyInfraCost = $monthlyInfraCost'); params.monthlyInfraCost = parsed.monthlyInfraCost; }
      if (parsed.technicalDebtRatio !== undefined) { setFields.push('e.technicalDebtRatio = $technicalDebtRatio'); params.technicalDebtRatio = parsed.technicalDebtRatio; }
      // Cost fields (Tier 3)
      if (parsed.costEstimateOptimistic !== undefined) { setFields.push('e.costEstimateOptimistic = $costEstimateOptimistic'); params.costEstimateOptimistic = parsed.costEstimateOptimistic; }
      if (parsed.costEstimateMostLikely !== undefined) { setFields.push('e.costEstimateMostLikely = $costEstimateMostLikely'); params.costEstimateMostLikely = parsed.costEstimateMostLikely; }
      if (parsed.costEstimatePessimistic !== undefined) { setFields.push('e.costEstimatePessimistic = $costEstimatePessimistic'); params.costEstimatePessimistic = parsed.costEstimatePessimistic; }
      if (parsed.successProbability !== undefined) { setFields.push('e.successProbability = $successProbability'); params.successProbability = parsed.successProbability; }
      if (parsed.costOfDelayPerWeek !== undefined) { setFields.push('e.costOfDelayPerWeek = $costOfDelayPerWeek'); params.costOfDelayPerWeek = parsed.costOfDelayPerWeek; }
      // AI Agent fields
      if (parsed.agentProvider !== undefined) { setFields.push('e.agentProvider = $agentProvider'); params.agentProvider = parsed.agentProvider; }
      if (parsed.agentModel !== undefined) { setFields.push('e.agentModel = $agentModel'); params.agentModel = parsed.agentModel; }
      if (parsed.agentPurpose !== undefined) { setFields.push('e.agentPurpose = $agentPurpose'); params.agentPurpose = parsed.agentPurpose; }
      if (parsed.autonomyLevel !== undefined) { setFields.push('e.autonomyLevel = $autonomyLevel'); params.autonomyLevel = parsed.autonomyLevel; }
      if (parsed.costPerMonth !== undefined) { setFields.push('e.costPerMonth = $costPerMonth'); params.costPerMonth = parsed.costPerMonth; }
      if (parsed.lastActiveDate !== undefined) { setFields.push('e.lastActiveDate = $lastActiveDate'); params.lastActiveDate = parsed.lastActiveDate; }
      if (parsed.dataSources !== undefined) { setFields.push('e.dataSources = $dataSources'); params.dataSources = parsed.dataSources; }
      if (parsed.outputTargets !== undefined) { setFields.push('e.outputTargets = $outputTargets'); params.outputTargets = parsed.outputTargets; }

      if (setFields.length === 0) {
        res.status(400).json({ success: false, error: 'No valid fields to update' });
        return;
      }

      setFields.push('e.updatedAt = datetime()');

      await runCypher(
        `MATCH (e:ArchitectureElement {id: $elementId})
         SET ${setFields.join(', ')}
         RETURN e`,
        params
      );

      res.json({ success: true, data: { id: elementId, ...parsed } });

      // Fire-and-forget: re-evaluate policies after element update
      evaluateElementPolicies(String(req.params.projectId), String(elementId), 'update').catch((e) =>
        console.error('[PolicyEval] update hook error:', e),
      );
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
        return;
      }
      console.error('Update element error:', err);
      res.status(500).json({ success: false, error: 'Failed to update element' });
    }
  }
);

// Delete element
router.delete(
  '/:projectId/elements/:elementId',
  requirePermission(PERMISSIONS.ELEMENT_DELETE),
  audit({ action: 'delete_element', entityType: 'element', riskLevel: 'high' }),
  async (req: Request, res: Response) => {
    try {
      const { elementId } = req.params;
      // Fire-and-forget: resolve violations before deleting the element
      evaluateElementPolicies(String(req.params.projectId), String(elementId), 'delete').catch((e) =>
        console.error('[PolicyEval] delete hook error:', e),
      );

      await runCypher(
        'MATCH (e:ArchitectureElement {id: $elementId}) DETACH DELETE e',
        { elementId }
      );
      res.json({ success: true, message: 'Element deleted' });
    } catch (err) {
      console.error('Delete element error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete element' });
    }
  }
);

// Get element dependencies (impact analysis)
router.get(
  '/:projectId/elements/:elementId/dependencies',
  requirePermission(PERMISSIONS.ELEMENT_READ),
  async (req: Request, res: Response) => {
    try {
      const { elementId } = req.params;
      const depth = parseInt(req.query.depth as string) || 3;

      const records = await runCypher(
        `MATCH path = (e:ArchitectureElement {id: $elementId})-[r*1..${depth}]->(dep:ArchitectureElement)
         RETURN dep, [rel in r | type(rel)] as relTypes, length(path) as distance`,
        { elementId }
      );
      const dependencies = records.map((r) => ({
        element: serializeNeo4jProperties(r.get('dep').properties),
        relationshipTypes: r.get('relTypes'),
        distance: r.get('distance').toNumber(),
      }));
      res.json({ success: true, data: dependencies });
    } catch (err) {
      console.error('Get dependencies error:', err);
      res.status(500).json({ success: false, error: 'Failed to get dependencies' });
    }
  }
);

// Create connection
router.post(
  '/:projectId/connections',
  requirePermission(PERMISSIONS.CONNECTION_CREATE),
  audit({ action: 'create_connection', entityType: 'connection', getAfter: (req) => req.body }),
  async (req: Request, res: Response) => {
    try {
      const parsed = CreateConnectionSchema.parse(req.body);
      const connectionId = parsed.id || uuid();

      await runCypher(
        `MATCH (a:ArchitectureElement {id: $sourceId}), (b:ArchitectureElement {id: $targetId})
         CREATE (a)-[r:CONNECTS_TO {id: $connectionId, type: $type, label: $label}]->(b)
         RETURN r`,
        {
          sourceId: parsed.sourceId,
          targetId: parsed.targetId,
          connectionId,
          type: parsed.type,
          label: parsed.label || '',
        }
      );

      res.status(201).json({ success: true, data: { id: connectionId, ...parsed } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
        return;
      }
      console.error('Create connection error:', err);
      res.status(500).json({ success: false, error: 'Failed to create connection' });
    }
  }
);

// Delete connection
router.delete(
  '/:projectId/connections/:connectionId',
  requirePermission(PERMISSIONS.CONNECTION_DELETE),
  audit({ action: 'delete_connection', entityType: 'connection', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { connectionId } = req.params;
      await runCypher(
        'MATCH ()-[r {id: $connectionId}]->() DELETE r',
        { connectionId }
      );
      res.json({ success: true, message: 'Connection deleted' });
    } catch (err) {
      console.error('Delete connection error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete connection' });
    }
  }
);

// Get all connections for a project
router.get(
  '/:projectId/connections',
  requirePermission(PERMISSIONS.CONNECTION_READ),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const records = await runCypher(
        `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement)
         RETURN r.id as id, a.id as sourceId, b.id as targetId, r.type as type, r.label as label`,
        { projectId }
      );
      const connections = records.map((r) => ({
        id: r.get('id'),
        sourceId: r.get('sourceId'),
        targetId: r.get('targetId'),
        type: r.get('type'),
        label: r.get('label'),
      }));
      res.json({ success: true, data: connections });
    } catch (err) {
      console.error('Get connections error:', err);
      res.status(500).json({ success: false, error: 'Failed to get connections' });
    }
  }
);

// BPMN Import endpoint
router.post(
  '/:projectId/import/bpmn',
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  audit({ action: 'import_bpmn', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { elements, connections } = req.body;

      if (!Array.isArray(elements) || !Array.isArray(connections)) {
        res.status(400).json({ success: false, error: 'Invalid import data' });
        return;
      }

      for (const el of elements) {
        const id = el.id || uuid();
        await runCypher(
          `CREATE (e:ArchitectureElement {
            id: $id, projectId: $projectId, type: $type, name: $name,
            description: $description, layer: $layer, togafDomain: $togafDomain,
            maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
            posX: $posX, posY: $posY, posZ: $posZ,
            workspaceId: $workspaceId,
            metadataJson: $metadataJson,
            createdAt: datetime(), updatedAt: datetime()
          })`,
          {
            id,
            projectId,
            type: el.type,
            name: el.name,
            description: el.description || '',
            layer: el.layer,
            togafDomain: el.togafDomain,
            maturityLevel: el.maturityLevel || 3,
            riskLevel: el.riskLevel || 'low',
            status: el.status || 'current',
            posX: el.position3D?.x || 0,
            posY: el.position3D?.y || 0,
            posZ: el.position3D?.z || 0,
            workspaceId: el.workspaceId || '',
            metadataJson: JSON.stringify(el.metadata || {}),
          }
        );
      }

      for (const conn of connections) {
        const connectionId = conn.id || uuid();
        await runCypher(
          `MATCH (a:ArchitectureElement {id: $sourceId}), (b:ArchitectureElement {id: $targetId})
           CREATE (a)-[:CONNECTS_TO {id: $connectionId, type: $type, label: $label}]->(b)`,
          {
            sourceId: conn.sourceId,
            targetId: conn.targetId,
            connectionId,
            type: conn.type || 'connects_to',
            label: conn.label || '',
          }
        );
      }

      res.status(201).json({
        success: true,
        data: { elementsCreated: elements.length, connectionsCreated: connections.length },
      });
    } catch (err) {
      console.error('BPMN import error:', err);
      res.status(500).json({ success: false, error: 'Failed to import BPMN data' });
    }
  }
);

// n8n Import endpoint (same pattern as BPMN import)
router.post(
  '/:projectId/import/n8n',
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  audit({ action: 'import_n8n', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { elements, connections } = req.body;

      if (!Array.isArray(elements) || !Array.isArray(connections)) {
        res.status(400).json({ success: false, error: 'Invalid import data' });
        return;
      }

      for (const el of elements) {
        const id = el.id || uuid();
        await runCypher(
          `CREATE (e:ArchitectureElement {
            id: $id, projectId: $projectId, type: $type, name: $name,
            description: $description, layer: $layer, togafDomain: $togafDomain,
            maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
            posX: $posX, posY: $posY, posZ: $posZ,
            workspaceId: $workspaceId,
            metadataJson: $metadataJson, sourceImport: 'n8n',
            createdAt: datetime(), updatedAt: datetime()
          })`,
          {
            id,
            projectId,
            type: el.type,
            name: el.name,
            description: el.description || '',
            layer: el.layer,
            togafDomain: el.togafDomain,
            maturityLevel: el.maturityLevel || 3,
            riskLevel: el.riskLevel || 'low',
            status: el.status || 'current',
            posX: el.position3D?.x || 0,
            posY: el.position3D?.y || 0,
            posZ: el.position3D?.z || 0,
            workspaceId: el.workspaceId || '',
            metadataJson: JSON.stringify(el.metadata || {}),
          }
        );
      }

      for (const conn of connections) {
        const connectionId = conn.id || uuid();
        await runCypher(
          `MATCH (a:ArchitectureElement {id: $sourceId}), (b:ArchitectureElement {id: $targetId})
           CREATE (a)-[:CONNECTS_TO {id: $connectionId, type: $type, label: $label}]->(b)`,
          {
            sourceId: conn.sourceId,
            targetId: conn.targetId,
            connectionId,
            type: conn.type || 'data_flow',
            label: conn.label || '',
          }
        );
      }

      res.status(201).json({
        success: true,
        data: { elementsCreated: elements.length, connectionsCreated: connections.length },
      });
    } catch (err) {
      console.error('n8n import error:', err);
      res.status(500).json({ success: false, error: 'Failed to import n8n workflow' });
    }
  }
);

// n8n API proxy — fetch workflows from a remote n8n instance (avoids CORS)
router.post(
  '/:projectId/import/n8n/fetch',
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  async (req: Request, res: Response) => {
    try {
      const { n8nUrl, apiKey, workflowId } = req.body;

      if (!n8nUrl || !apiKey) {
        res.status(400).json({ success: false, error: 'n8nUrl and apiKey are required' });
        return;
      }

      const baseUrl = n8nUrl.replace(/\/+$/, '');
      const url = workflowId
        ? `${baseUrl}/api/v1/workflows/${workflowId}`
        : `${baseUrl}/api/v1/workflows?limit=100`;

      const response = await axios.get(url, {
        headers: { 'X-N8N-API-KEY': apiKey },
        timeout: 15_000,
      });

      res.json({ success: true, data: response.data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch from n8n';
      console.error('n8n fetch error:', msg);
      res.status(502).json({ success: false, error: msg });
    }
  }
);

// CSV Import endpoint (same pattern as BPMN/n8n import)
router.post(
  '/:projectId/import/csv',
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  audit({ action: 'import_csv', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { elements, connections } = req.body;

      if (!Array.isArray(elements) || !Array.isArray(connections)) {
        res.status(400).json({ success: false, error: 'Invalid import data' });
        return;
      }

      for (const el of elements) {
        const id = el.id || uuid();
        await runCypher(
          `CREATE (e:ArchitectureElement {
            id: $id, projectId: $projectId, type: $type, name: $name,
            description: $description, layer: $layer, togafDomain: $togafDomain,
            maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
            posX: $posX, posY: $posY, posZ: $posZ,
            workspaceId: $workspaceId,
            metadataJson: $metadataJson, sourceImport: 'csv',
            createdAt: datetime(), updatedAt: datetime()
          })`,
          {
            id,
            projectId,
            type: el.type,
            name: el.name,
            description: el.description || '',
            layer: el.layer,
            togafDomain: el.togafDomain,
            maturityLevel: el.maturityLevel || 3,
            riskLevel: el.riskLevel || 'low',
            status: el.status || 'current',
            posX: el.position3D?.x || 0,
            posY: el.position3D?.y || 0,
            posZ: el.position3D?.z || 0,
            workspaceId: el.workspaceId || '',
            metadataJson: JSON.stringify(el.metadata || {}),
          }
        );
      }

      for (const conn of connections) {
        const connectionId = conn.id || uuid();
        await runCypher(
          `MATCH (a:ArchitectureElement {id: $sourceId}), (b:ArchitectureElement {id: $targetId})
           CREATE (a)-[:CONNECTS_TO {id: $connectionId, type: $type, label: $label}]->(b)`,
          {
            sourceId: conn.sourceId,
            targetId: conn.targetId,
            connectionId,
            type: conn.type || 'association',
            label: conn.label || '',
          }
        );
      }

      res.status(201).json({
        success: true,
        data: { elementsCreated: elements.length, connectionsCreated: connections.length },
      });
    } catch (err) {
      console.error('CSV import error:', err);
      res.status(500).json({ success: false, error: 'Failed to import CSV data' });
    }
  }
);

export default router;
