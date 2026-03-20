import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { runAdvisorScan } from '../services/advisor.service';

const router = Router();

router.use(authenticate);

// Full advisor scan — returns health score + insights
router.get(
  '/:projectId/advisor/scan',
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

export default router;
