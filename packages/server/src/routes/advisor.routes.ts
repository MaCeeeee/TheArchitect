import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { runAdvisorScan } from '../services/advisor.service';
import { runCypher } from '../config/neo4j';
import { z } from 'zod';
import { audit } from '../middleware/audit.middleware';
import { buildLadderReport } from '../services/topology/ladderLoader';
import { CONTEXT_TYPES, DEFAULT_QUANTITY, MAX_TRANSLATION_FACTOR, MEMBERSHIP_TYPES, MIN_TRANSLATION_FACTOR } from '../services/topology/contextComplex';

const router = Router();

router.use(authenticate);
router.use(requireVerifiedEmail);

const aiRateLimit = rateLimit({ name: 'ai-advisor', windowMs: 24 * 60 * 60 * 1000, max: 10 });

// Full advisor scan — returns health score + insights
router.get(
  '/:projectId/advisor/scan',
  aiRateLimit,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const result = await runAdvisorScan(projectId);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[Advisor] Scan error:', err);
      res.status(500).json({ success: false, error: 'Advisor scan failed' });
    }
  },
);

// Health score only (lightweight)
router.get(
  '/:projectId/advisor/health',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const result = await runAdvisorScan(projectId);
      res.json({ success: true, data: result.healthScore });
    } catch (err) {
      console.error('[Advisor] Health score error:', err);
      res.status(500).json({ success: false, error: 'Health score calculation failed' });
    }
  },
);

// ─── UC-METH-001: ladder to cohomology ───
// Ladder report — mechanical, three read-only count/list queries, no AI limiter. It reads the
// whole model and computes in the request, so it has a limiter of its own. Callers: the action
// field (UC-METH-002) loads it once per opened project, after model changes (debounced in the
// client) and after a group is made; the advisor panel on refresh. Counted per user (the router
// authenticates first), so users behind one IP do not share the limit; without a user per IP.
const ladderRateLimit = rateLimit({
  name: 'advisor-ladder',
  windowMs: 60_000,
  max: 30,
  key: (req) => (req.user?._id ? `user:${String(req.user._id)}` : `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`),
});

router.get(
  '/:projectId/advisor/ladder',
  ladderRateLimit,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const report = await buildLadderReport(projectId);
      res.json({ success: true, data: report });
    } catch (err) {
      console.error('[Advisor] Ladder error:', err);
      res.status(500).json({ success: false, error: 'Ladder assessment failed' });
    }
  },
);

const TranslationSchema = z.object({
  factor: z.number().positive().finite().min(MIN_TRANSLATION_FACTOR).max(MAX_TRANSLATION_FACTOR),
  quantity: z.string().trim().min(1).max(64).default(DEFAULT_QUANTITY),
});

// Declare a translation on a relationship between two contexts:
// 1 unit in the source context = factor units in the target context.
router.put(
  '/:projectId/advisor/translations/:connectionId',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.CONNECTION_UPDATE),
  audit({
    action: 'set_translation',
    entityType: 'connection',
    getEntityId: (req: Request) => String(req.params.connectionId),
    // The parsed values only: the body may carry any number of other keys.
    getAfter: (req: Request) => {
      const parsed = TranslationSchema.safeParse(req.body);
      return parsed.success ? parsed.data : {};
    },
  }),
  async (req: Request, res: Response) => {
    try {
      const parsed = TranslationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.errors });
        return;
      }
      const projectId = String(req.params.projectId);
      const connectionId = String(req.params.connectionId);
      // Both ends are scoped to the project and must be contexts; a composition or aggregation
      // is a membership, not a translation.
      const updated = await runCypher(
        `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO {id: $connectionId}]->(b:ArchitectureElement {projectId: $projectId})
         WHERE a.type IN $contextTypes AND b.type IN $contextTypes AND a.id <> b.id
           AND NOT r.type IN $membershipTypes
         SET r.translationFactor = $factor, r.translationQuantity = $quantity
         RETURN r.id AS id`,
        {
          projectId,
          connectionId,
          factor: parsed.data.factor,
          quantity: parsed.data.quantity,
          contextTypes: [...CONTEXT_TYPES],
          membershipTypes: [...MEMBERSHIP_TYPES],
        },
      );
      if (updated.length === 0) {
        res.status(404).json({ success: false, error: 'No relationship between two contexts with this id in this project (compositions and aggregations cannot carry a translation)' });
        return;
      }
      res.json({ success: true, data: { id: connectionId, ...parsed.data } });
    } catch (err) {
      console.error('[Advisor] Set translation error:', err);
      res.status(500).json({ success: false, error: 'Failed to set translation' });
    }
  },
);

// Remove a declared translation (the relationship itself stays)
router.delete(
  '/:projectId/advisor/translations/:connectionId',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.CONNECTION_UPDATE),
  audit({
    action: 'remove_translation',
    entityType: 'connection',
    getEntityId: (req: Request) => String(req.params.connectionId),
  }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const connectionId = String(req.params.connectionId);
      const updated = await runCypher(
        `MATCH (a:ArchitectureElement {projectId: $projectId})-[r:CONNECTS_TO {id: $connectionId}]->(b:ArchitectureElement {projectId: $projectId})
         REMOVE r.translationFactor, r.translationQuantity
         RETURN r.id AS id`,
        { projectId, connectionId },
      );
      if (updated.length === 0) {
        res.status(404).json({ success: false, error: 'Relationship not found in this project' });
        return;
      }
      res.json({ success: true, data: { id: connectionId } });
    } catch (err) {
      console.error('[Advisor] Remove translation error:', err);
      res.status(500).json({ success: false, error: 'Failed to remove translation' });
    }
  },
);

export default router;
