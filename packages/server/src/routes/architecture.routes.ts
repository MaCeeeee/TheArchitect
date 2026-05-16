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
import {
  suggestConnectionsForIsolatedElements,
  type HealReport,
} from '../services/connectionSuggestion.service';
import {
  upsertEmbedding,
  deleteEmbedding,
  findSimilarElements,
  findRedundancies,
} from '../services/elementSimilarity.service';
import { applyRedundancyDecisions } from '../services/redundancyResolution.service';
import { AuditLog } from '../models/AuditLog';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { log } from '../config/logger';

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
  // Free-form metadata (Activity-Steckbrief, isActivity flag, sequenceIndex, etc.)
  metadata: z.record(z.unknown()).optional(),
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

// ─── REQ-SIM-003: Public similarity search ──────────────────────────────────
//
// POST /:projectId/elements/similar — find elements similar to either
// free-text or an existing element, scoped to the calling project's
// workspace (REQ-SIM-005 isolation).
//
// Rate-limited to 30 req/min/IP because each call hits the embedding
// sidecar and Qdrant; well below the global limit.

const SimilarSearchSchema = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    elementId: z.string().min(1).optional(),
    topK: z.number().int().min(1).max(50).optional(),
    scoreThreshold: z.number().min(-1).max(1).optional(),
    excludeElementIds: z.array(z.string()).max(100).optional(),
  })
  .refine((d) => Boolean(d.text) !== Boolean(d.elementId), {
    message: 'Provide exactly one of `text` or `elementId`',
  });

// REQ-SIM-002 (bulk backfill): reindex every element in the project's
// workspace. Synchronous up to MAX_REINDEX elements (~5 minutes on a single
// sidecar at 100 elements/min). Larger projects will need a background job
// — out of Sprint-2 scope.
//
// Rate-limited very low (5/hour) since this is a heavy operation and only
// ops/admin should call it.
const MAX_REINDEX = 500;

router.post(
  '/:projectId/elements/reindex',
  rateLimit({ windowMs: 60 * 60_000, max: 5, name: 'similarity-reindex' }),
  requirePermission(PERMISSIONS.ELEMENT_UPDATE),
  audit({ action: 'similarity_reindex', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const records = await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId})
         RETURN e LIMIT ${MAX_REINDEX}`,
        { projectId },
      );

      let succeeded = 0;
      let failed = 0;
      for (const r of records) {
        const props = serializeNeo4jProperties(r.get('e').properties) as Record<string, unknown>;
        try {
          await upsertEmbedding(String(projectId), {
            id: String(props.id ?? ''),
            name: String(props.name ?? ''),
            description: typeof props.description === 'string' ? props.description : '',
            type: String(props.type ?? ''),
            layer: String(props.layer ?? ''),
            projectId: String(projectId),
          });
          succeeded++;
        } catch (e) {
          failed++;
          log.warn(
            { err: (e as Error).message, projectId, elementId: props.id },
            '[similarity] reindex single-element failed',
          );
        }
      }

      log.info(
        { projectId, total: records.length, succeeded, failed },
        '[similarity] bulk reindex completed',
      );
      res.json({
        success: true,
        data: {
          total: records.length,
          succeeded,
          failed,
          truncated: records.length === MAX_REINDEX,
        },
      });
    } catch (err) {
      log.error(
        { err: (err as Error).message, projectId: req.params.projectId },
        '[similarity] reindex endpoint failed',
      );
      res.status(500).json({ success: false, error: 'Failed to reindex elements' });
    }
  },
);

router.post(
  '/:projectId/elements/similar',
  rateLimit({ windowMs: 60_000, max: 30, name: 'similarity-search' }),
  requirePermission(PERMISSIONS.ELEMENT_READ),
  audit({ action: 'similarity_search', entityType: 'element', riskLevel: 'low' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = SimilarSearchSchema.parse(req.body);

      const result = await findSimilarElements(String(projectId), {
        text: parsed.text,
        elementId: parsed.elementId,
        topK: parsed.topK,
        scoreThreshold: parsed.scoreThreshold,
        excludeElementIds: parsed.excludeElementIds,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: err.errors,
        });
      }
      const msg = (err as Error).message || '';
      // "not found in workspace index" → caller queried by elementId that
      // isn't indexed in this project. Surface as 404 so clients can
      // distinguish from a real server fault.
      if (msg.includes('not found in workspace index')) {
        return res.status(404).json({ success: false, error: msg });
      }
      log.error(
        { err: msg, projectId: req.params.projectId },
        '[similarity] search endpoint failed',
      );
      res.status(500).json({ success: false, error: 'Failed to search similar elements' });
    }
  },
);

// ─── REQ-RED-001: Redundancy-pair detection ─────────────────────────────────
//
// GET /:projectId/redundancies — find similarity-pair candidates in a project.
// Optional query params:
//   - type:           single ArchiMate type (e.g. data_object). Default: all data-* types.
//   - scoreThreshold: 0.0..1.0, default 0.65
//   - topK:           neighbours per element, default 5, capped at 20
//   - limit:          max pairs returned, default 50, capped at 500
//   - sameTypeOnly:   "true" (default) | "false"
//
// Algorithm reads the project's element list from Neo4j, then drives
// findRedundancies() in the service layer. Names + layers from the
// stored elements are merged in here so the client can render a list
// without separate per-element fetches.

const DATA_TYPES = new Set(['data_object', 'data_entity', 'data_model']);

const RedundancyQuerySchema = z.object({
  type: z.string().min(1).optional(),
  scoreThreshold: z.coerce.number().min(0).max(1).optional(),
  topK: z.coerce.number().int().min(1).max(20).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  sameTypeOnly: z.enum(['true', 'false']).optional(),
});

router.get(
  '/:projectId/redundancies',
  rateLimit({ windowMs: 60_000, max: 30, name: 'redundancy-detect' }),
  requirePermission(PERMISSIONS.ELEMENT_READ),
  audit({ action: 'redundancy_detect', entityType: 'project', riskLevel: 'low' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = RedundancyQuerySchema.parse(req.query);

      // Pull project elements from Neo4j once. We need id + type + name +
      // layer so the response can be self-contained (no extra fetch on the
      // client to resolve element labels).
      const records = await runCypher(
        'MATCH (e:ArchitectureElement {projectId: $projectId}) RETURN e.id AS id, e.name AS name, e.type AS type, e.layer AS layer',
        { projectId },
      );
      const elements = records.map((r) => ({
        id: r.get('id') as string,
        name: r.get('name') as string,
        type: r.get('type') as string,
        layer: r.get('layer') as string,
      }));

      const sameTypeOnly = parsed.sameTypeOnly !== 'false';

      // Type filter for the INPUT set sent to the service:
      //   - sameTypeOnly + no explicit type → only data-* (existing default)
      //   - sameTypeOnly + explicit type   → only that type
      //   - cross-type (sameTypeOnly=false) → ALL types in the project;
      //     the service-level semantic-group filter (REQ-RED-002) drops
      //     unrelated cross-type pairs from the candidate set
      let filtered: typeof elements;
      if (parsed.type) {
        const typeFilter = new Set([parsed.type]);
        filtered = elements.filter((el) => typeFilter.has(el.type));
      } else if (sameTypeOnly) {
        filtered = elements.filter((el) => DATA_TYPES.has(el.type));
      } else {
        // Cross-type mode → scan everything; semantic-group filter narrows it
        filtered = elements;
      }

      // Cross-type matches are noisier, so the default threshold steps up
      // from 0.65 to 0.7 to keep precision high. Explicit query overrides.
      const effectiveThreshold =
        parsed.scoreThreshold ?? (sameTypeOnly ? undefined : 0.7);

      const pairs = await findRedundancies(
        String(projectId),
        filtered.map((el) => ({ id: el.id, type: el.type })),
        {
          scoreThreshold: effectiveThreshold,
          topK: parsed.topK,
          sameTypeOnly,
          limit: parsed.limit,
        },
      );

      // The service returns pair ids only; merge in name/layer from the
      // Neo4j fetch above so the client has everything to render.
      const byId = new Map(elements.map((el) => [el.id, el]));
      const enriched = pairs.map((p) => {
        const a = byId.get(p.aId);
        const b = byId.get(p.bId);
        return {
          aId: p.aId,
          aName: a?.name ?? p.aName ?? '(unknown)',
          aType: a?.type ?? p.aType,
          aLayer: a?.layer ?? p.aLayer,
          bId: p.bId,
          bName: b?.name ?? p.bName ?? '(unknown)',
          bType: b?.type ?? p.bType,
          bLayer: b?.layer ?? p.bLayer,
          score: p.score,
          tier: p.tier,
        };
      });

      res.json({
        success: true,
        data: {
          pairs: enriched,
          scanned: filtered.length,
          totalElements: elements.length,
          scoreThreshold: parsed.scoreThreshold ?? 0.65,
          sameTypeOnly,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: err.errors,
        });
      }
      log.error(
        { err: (err as Error).message, projectId: req.params.projectId },
        '[redundancy] detect endpoint failed',
      );
      res.status(500).json({ success: false, error: 'Failed to detect redundancies' });
    }
  },
);

// ─── REQ-RED-004: Apply redundancy decisions (Bulk-Merge) ──────────────────
//
// POST /:projectId/redundancies/resolve
// body: { decisions: [{aId, bId, action}] }
//   action: 'merge-into-a' | 'merge-into-b' | 'keep-both' | 'skip'
//
// Each decision is independent — one failure doesn't block the rest.
// Response includes counts + per-pair errors.
//
// Destructive (the merge-* actions delete the source element + its embedding)
// → audit risk = 'high' and requires ELEMENT_DELETE permission.

const RedundancyDecisionSchema = z.object({
  aId: z.string().min(1),
  bId: z.string().min(1),
  action: z.enum(['merge-into-a', 'merge-into-b', 'keep-both', 'skip']),
});

const ResolveBodySchema = z.object({
  decisions: z.array(RedundancyDecisionSchema).min(1).max(50),
});

router.post(
  '/:projectId/redundancies/resolve',
  rateLimit({ windowMs: 60_000, max: 10, name: 'redundancy-resolve' }),
  requirePermission(PERMISSIONS.ELEMENT_DELETE),
  audit({ action: 'redundancy_resolve', entityType: 'project', riskLevel: 'high' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const parsed = ResolveBodySchema.parse(req.body);

      // REQ-RED-005 — pass audit context so each merge writes an audit row
      const userId = (req as Request & { user?: { _id?: { toString(): string } } }).user?._id?.toString();
      const auditContext = userId
        ? {
            userId,
            ip: req.ip || req.socket.remoteAddress || '',
            userAgent: req.get('user-agent') || '',
          }
        : undefined;

      const result = await applyRedundancyDecisions(String(projectId), parsed.decisions, auditContext);

      log.info(
        {
          projectId,
          decisions: parsed.decisions.length,
          merged: result.merged,
          kept: result.kept,
          skipped: result.skipped,
          errorCount: result.errors.length,
        },
        '[redundancy] resolve endpoint completed',
      );

      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: err.errors,
        });
      }
      log.error(
        { err: (err as Error).message, projectId: req.params.projectId },
        '[redundancy] resolve endpoint failed',
      );
      res.status(500).json({ success: false, error: 'Failed to resolve redundancies' });
    }
  },
);

// ─── REQ-RED-005: Redundancy resolution stats ──────────────────────────────
//
// GET /:projectId/stats/redundancies
//
// Aggregates the audit log (action=redundancy_resolved) so the project
// dashboard can show "X redundancies resolved · last on ...". Cheap
// MongoDB count + max(timestamp) query; no auth-side rate-limiting beyond
// the standard project-access guard.

router.get(
  '/:projectId/stats/redundancies',
  requirePermission(PERMISSIONS.ELEMENT_READ),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;

      const [totalResolved, totalKept, latest] = await Promise.all([
        AuditLog.countDocuments({ projectId, action: 'redundancy_resolved' }),
        AuditLog.countDocuments({ projectId, action: 'redundancy_kept' }),
        AuditLog.findOne({ projectId, action: 'redundancy_resolved' })
          .sort({ timestamp: -1 })
          .select({ timestamp: 1, after: 1, userId: 1 })
          .lean(),
      ]);

      res.json({
        success: true,
        data: {
          totalResolved,
          totalKept,
          lastResolvedAt: latest?.timestamp ?? null,
          lastResolvedBy: latest?.userId ?? null,
          lastResolvedPair: latest?.after ?? null,
        },
      });
    } catch (err) {
      log.error(
        { err: (err as Error).message, projectId: req.params.projectId },
        '[redundancy] stats endpoint failed',
      );
      res.status(500).json({ success: false, error: 'Failed to load redundancy stats' });
    }
  },
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

      // REQ-SIM-002: fire-and-forget similarity-index update. Failure must
      // never block the user-facing create — the index can rebuild on next
      // edit. workspace-isolation key = projectId (per REQ-SIM-005).
      upsertEmbedding(String(projectId), {
        id: element.id,
        name: element.name,
        description: element.description,
        type: element.type,
        layer: element.layer,
        projectId: String(projectId),
      }).catch((e) =>
        log.warn(
          { err: (e as Error).message, projectId, elementId: element.id },
          '[similarity] upsert hook failed (create)',
        ),
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
      // Metadata (free-form JSON; e.g. activityOwner / activityWhen / isActivity / sequenceIndex)
      if (parsed.metadata !== undefined) { setFields.push('e.metadataJson = $metadataJson'); params.metadataJson = JSON.stringify(parsed.metadata); }

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

      // REQ-SIM-002: re-embed only when an embedding-relevant field changed
      // (name / description / layer / type). Other field changes (cost, status,
      // position) don't affect similarity — skip the work.
      const embedRelevantChanged =
        parsed.name !== undefined ||
        parsed.description !== undefined ||
        parsed.layer !== undefined;
      if (embedRelevantChanged) {
        // Re-fetch the canonical element so partial updates produce a
        // fresh full-context embedding (we don't have the unchanged fields
        // in `parsed`).
        runCypher(
          'MATCH (e:ArchitectureElement {id: $elementId}) RETURN e',
          { elementId },
        )
          .then((records) => {
            if (records.length === 0) return;
            const props = serializeNeo4jProperties(records[0].get('e').properties) as Record<string, unknown>;
            return upsertEmbedding(String(req.params.projectId), {
              id: String(props.id ?? elementId),
              name: String(props.name ?? ''),
              description: typeof props.description === 'string' ? props.description : '',
              type: String(props.type ?? ''),
              layer: String(props.layer ?? ''),
              projectId: String(req.params.projectId),
            });
          })
          .catch((e) =>
            log.warn(
              { err: (e as Error).message, projectId: req.params.projectId, elementId },
              '[similarity] upsert hook failed (update)',
            ),
          );
      }
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

// Get a single element by ID. Used by the PropertyPanel to refresh activity
// metadata on every click — main `elements` store snapshot can be stale after
// background mutations (Generator A, Remediate apply, AI auto-fill).
router.get(
  '/:projectId/elements/:elementId',
  requirePermission(PERMISSIONS.ELEMENT_READ),
  async (req: Request, res: Response) => {
    try {
      const { elementId } = req.params;
      const records = await runCypher(
        'MATCH (e:ArchitectureElement {id: $elementId}) RETURN e',
        { elementId }
      );
      if (records.length === 0) {
        return res.status(404).json({ success: false, error: 'Element not found' });
      }
      const props = serializeNeo4jProperties(records[0].get('e').properties);
      let metadata: Record<string, unknown> = {};
      try { if (props.metadataJson) metadata = JSON.parse(props.metadataJson as string); } catch { /* ignore */ }
      res.json({
        success: true,
        data: {
          ...props,
          position3D: { x: props.posX || 0, y: props.posY || 0, z: props.posZ || 0 },
          metadata,
        },
      });
    } catch (err) {
      console.error('Get element error:', err);
      res.status(500).json({ success: false, error: 'Failed to get element' });
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

      // REQ-SIM-002: drop from similarity index. Idempotent — if the vector
      // never made it in (workspace had no collection), this is a no-op.
      deleteEmbedding(String(req.params.projectId), String(elementId)).catch((e) =>
        log.warn(
          { err: (e as Error).message, projectId: req.params.projectId, elementId },
          '[similarity] delete hook failed',
        ),
      );
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

// Get composition-children of an element (used by Activity-View drill-down)
router.get(
  '/:projectId/elements/:elementId/children',
  requirePermission(PERMISSIONS.ELEMENT_READ),
  async (req: Request, res: Response) => {
    try {
      const { elementId } = req.params;

      const childRecords = await runCypher(
        `MATCH (parent:ArchitectureElement {id: $elementId})-[r:CONNECTS_TO {type: 'composition'}]->(child:ArchitectureElement)
         RETURN child`,
        { elementId }
      );
      const children = childRecords.map((r) => {
        const props = serializeNeo4jProperties(r.get('child').properties);
        let metadata = {};
        try { if (props.metadataJson) metadata = JSON.parse(props.metadataJson as string); } catch { /* ignore */ }
        return {
          ...props,
          position3D: { x: props.posX || 0, y: props.posY || 0, z: props.posZ || 0 },
          metadata,
        };
      });

      if (children.length === 0) {
        return res.json({ success: true, data: { children: [], flows: [] } });
      }

      const childIds = children.map((c) => (c as unknown as { id: string }).id);
      const flowRecords = await runCypher(
        `MATCH (a:ArchitectureElement)-[r:CONNECTS_TO {type: 'flow'}]->(b:ArchitectureElement)
         WHERE a.id IN $childIds AND b.id IN $childIds
         RETURN r.id as id, a.id as sourceId, b.id as targetId, r.label as label`,
        { childIds }
      );
      const flows = flowRecords.map((r) => ({
        id: r.get('id'),
        sourceId: r.get('sourceId'),
        targetId: r.get('targetId'),
        type: 'flow',
        label: r.get('label'),
      }));

      res.json({ success: true, data: { children, flows } });
    } catch (err) {
      console.error('Get children error:', err);
      res.status(500).json({ success: false, error: 'Failed to get children' });
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

      // MERGE on (sourceId, targetId, type) so deterministic-id callers
      // (e.g. envisionSync.ts: `env-conn-${src}-${tgt}`) and accidental
      // double-clicks no longer create duplicate edges. Uniqueness on r.id is
      // enforced by the CONNECTS_TO_id_unique Neo4j constraint.
      await runCypher(
        `MATCH (a:ArchitectureElement {id: $sourceId}), (b:ArchitectureElement {id: $targetId})
         MERGE (a)-[r:CONNECTS_TO {sourceElementId: $sourceId, targetElementId: $targetId, type: $type}]->(b)
         ON CREATE SET r.id = $connectionId, r.label = $label, r.createdAt = timestamp()
         ON MATCH  SET r.label = coalesce($label, r.label)
         RETURN r.id AS id`,
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

// ─────────────────────────────────────────────────────────────────────────────
// Heal Connections — auto-connect isolated elements via the rule engine
// ─────────────────────────────────────────────────────────────────────────────
const HealConnectionsBodySchema = z.object({
  mode: z.enum(['dryRun', 'apply']).default('dryRun'),
  minConfidence: z.number().min(0).max(1).default(0.7),
  whitelist: z.array(z.object({
    sourceId: z.string(),
    targetId: z.string(),
    type: z.string(),
  })).optional(),
});

router.post(
  '/:projectId/heal-connections',
  requirePermission(PERMISSIONS.CONNECTION_CREATE),
  audit({ action: 'heal_connections', entityType: 'connection', riskLevel: 'low' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const body = HealConnectionsBodySchema.parse(req.body ?? {});

      // Load all elements for the project
      const elementRecords = await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId})
         RETURN e.id AS id, e.type AS type, e.name AS name, e.description AS description`,
        { projectId }
      );
      const elements = elementRecords.map(r => ({
        id: r.get('id'),
        type: r.get('type'),
        name: r.get('name'),
        description: r.get('description') ?? undefined,
      }));

      // Load all existing connections for the project. Defensive projectId
      // filter on the edge itself prevents any cross-project edge leakage.
      const connectionRecords = await runCypher(
        `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO]->(b:ArchitectureElement {projectId: $projectId})
         WHERE coalesce(r.projectId, $projectId) = $projectId
         RETURN r.id AS id, a.id AS sourceId, b.id AS targetId, r.type AS type`,
        { projectId }
      );
      const connections = connectionRecords.map(r => ({
        id: r.get('id'),
        sourceId: r.get('sourceId'),
        targetId: r.get('targetId'),
        type: r.get('type'),
      }));

      const report: HealReport = await suggestConnectionsForIsolatedElements({
        projectId: String(projectId),
        elements,
        connections,
        minConfidence: body.minConfidence,
      });

      // Convert Map to plain object for JSON serialization
      const perElementJson: Record<string, unknown> = {};
      for (const [k, v] of report.perElement.entries()) perElementJson[k] = v;

      if (body.mode === 'dryRun') {
        res.json({
          success: true,
          mode: 'dryRun',
          data: {
            elementsAnalyzed: report.elementsAnalyzed,
            suggestionsTotal: report.suggestionsTotal,
            perElement: perElementJson,
          },
        });
        return;
      }

      // mode === 'apply'
      const allSuggestions = Array.from(report.perElement.values()).flat();
      const toApply = body.whitelist
        ? allSuggestions.filter(s => (body.whitelist ?? []).some(w =>
            w.sourceId === s.sourceId && w.targetId === s.targetId && w.type === s.relationshipType))
        : allSuggestions;

      const rows = toApply.map(s => ({
        sourceId: s.sourceId,
        targetId: s.targetId,
        type: s.relationshipType,
        confidence: s.confidence,
        aiReason: s.reasoning ?? '',
        cid: uuid(),
      }));

      // Two-step idempotent batch:
      //   1) UNWIND read existing edges to count "skipped" accurately
      //   2) UNWIND-MERGE only the rows that don't already exist
      // Both runs send a single Cypher round-trip regardless of N (~50×4=200 BSH).
      let appliedCount = 0;
      let skippedExistingCount = 0;
      const applied: Array<{ id: string; sourceId: string; targetId: string; type: string }> = [];

      if (rows.length > 0) {
        const existingRecords = await runCypher(
          `UNWIND $rows AS row
           OPTIONAL MATCH (a:ArchitectureElement {id: row.sourceId, projectId: $projectId})
                          -[r:CONNECTS_TO {type: row.type}]->
                          (b:ArchitectureElement {id: row.targetId, projectId: $projectId})
           RETURN row.sourceId AS sourceId, row.targetId AS targetId, row.type AS type, r IS NOT NULL AS exists`,
          { rows, projectId }
        );
        const existsKey = (s: string, t: string, ty: string) => `${s}|${t}|${ty}`;
        const alreadyExists = new Set(
          existingRecords
            .filter(rec => rec.get('exists'))
            .map(rec => existsKey(rec.get('sourceId'), rec.get('targetId'), rec.get('type')))
        );
        const newRows = rows.filter(r => !alreadyExists.has(existsKey(r.sourceId, r.targetId, r.type)));
        skippedExistingCount = rows.length - newRows.length;

        if (newRows.length > 0) {
          const writeRecords = await runCypher(
            `UNWIND $rows AS row
             MATCH (a:ArchitectureElement {id: row.sourceId, projectId: $projectId}),
                   (b:ArchitectureElement {id: row.targetId, projectId: $projectId})
             MERGE (a)-[r:CONNECTS_TO {type: row.type, sourceElementId: row.sourceId, targetElementId: row.targetId}]->(b)
             ON CREATE SET r.id = row.cid, r.label = '', r.source = 'ai-heal',
                           r.confidence = row.confidence, r.aiReason = row.aiReason,
                           r.projectId = $projectId, r.createdAt = timestamp()
             RETURN r.id AS id, row.sourceId AS sourceId, row.targetId AS targetId, row.type AS type`,
            { rows: newRows, projectId }
          );
          for (const rec of writeRecords) {
            applied.push({
              id: rec.get('id'),
              sourceId: rec.get('sourceId'),
              targetId: rec.get('targetId'),
              type: rec.get('type'),
            });
          }
          appliedCount = applied.length;
        }
      }

      res.status(201).json({
        success: true,
        mode: 'apply',
        data: {
          elementsAnalyzed: report.elementsAnalyzed,
          suggestionsConsidered: allSuggestions.length,
          appliedCount,
          skippedAsAlreadyExisting: skippedExistingCount,
          applied,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Validation failed', details: err.errors });
        return;
      }
      console.error('Heal connections error:', err);
      res.status(500).json({ success: false, error: 'Failed to heal connections' });
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
