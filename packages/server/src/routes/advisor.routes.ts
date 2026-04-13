import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { runAdvisorScan } from '../services/advisor.service';

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

export default router;
