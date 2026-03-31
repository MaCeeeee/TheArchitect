import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import {
  getPortfolioInventory,
  getPortfolioSummary,
  getLifecycleTimeline,
  updateElementLifecycle,
  bulkUpdateLifecycle,
} from '../services/portfolio.service';
import { classifyAndPersist } from '../services/time-classifier.service';

const router = Router();

router.use(authenticate);

// GET /api/projects/:projectId/portfolio/inventory
router.get(
  '/:projectId/portfolio/inventory',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const filters = {
        types: req.query.types ? String(req.query.types).split(',') : undefined,
        layers: req.query.layers ? String(req.query.layers).split(',') : undefined,
        status: req.query.status ? String(req.query.status).split(',') : undefined,
        riskLevel: req.query.riskLevel ? String(req.query.riskLevel).split(',') : undefined,
        lifecyclePhase: req.query.lifecyclePhase ? String(req.query.lifecyclePhase).split(',') : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
      };

      const items = await getPortfolioInventory(projectId, filters);
      res.json({ success: true, data: items });
    } catch (err) {
      console.error('[Portfolio] Inventory error:', err);
      res.status(500).json({ success: false, error: 'Failed to load portfolio inventory' });
    }
  },
);

// GET /api/projects/:projectId/portfolio/summary
router.get(
  '/:projectId/portfolio/summary',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const summary = await getPortfolioSummary(projectId);
      res.json({ success: true, data: summary });
    } catch (err) {
      console.error('[Portfolio] Summary error:', err);
      res.status(500).json({ success: false, error: 'Failed to load portfolio summary' });
    }
  },
);

// GET /api/projects/:projectId/portfolio/timeline
router.get(
  '/:projectId/portfolio/timeline',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const events = await getLifecycleTimeline(projectId);
      res.json({ success: true, data: events });
    } catch (err) {
      console.error('[Portfolio] Timeline error:', err);
      res.status(500).json({ success: false, error: 'Failed to load lifecycle timeline' });
    }
  },
);

// PATCH /api/projects/:projectId/portfolio/elements/:elementId/lifecycle
router.patch(
  '/:projectId/portfolio/elements/:elementId/lifecycle',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const elementId = String(req.params.elementId);
      await updateElementLifecycle(projectId, elementId, req.body);
      res.json({ success: true });
    } catch (err) {
      console.error('[Portfolio] Update lifecycle error:', err);
      res.status(500).json({ success: false, error: 'Failed to update lifecycle' });
    }
  },
);

// POST /api/projects/:projectId/portfolio/bulk-lifecycle
router.post(
  '/:projectId/portfolio/bulk-lifecycle',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ success: false, error: 'updates must be an array' });
      }
      const count = await bulkUpdateLifecycle(projectId, updates);
      res.json({ success: true, updated: count });
    } catch (err) {
      console.error('[Portfolio] Bulk lifecycle error:', err);
      res.status(500).json({ success: false, error: 'Failed to bulk update lifecycle' });
    }
  },
);

// POST /api/projects/:projectId/portfolio/classify-time
router.post(
  '/:projectId/portfolio/classify-time',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const results = await classifyAndPersist(projectId);
      res.json({ success: true, data: results });
    } catch (err) {
      console.error('[Portfolio] TIME classification error:', err);
      res.status(500).json({ success: false, error: 'TIME classification failed' });
    }
  },
);

export default router;
