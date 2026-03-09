import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { getXRaySummary, generateXRayNarrativePrompt } from '../services/xray.service';

const router = Router();

router.use(authenticate);

// X-Ray Summary - aggregated metrics for the HUD
router.get(
  '/:projectId/xray/summary',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const summary = await getXRaySummary(projectId);
      res.json({ success: true, data: summary });
    } catch (err) {
      console.error('X-Ray summary error:', err);
      res.status(500).json({ success: false, error: 'X-Ray summary failed' });
    }
  }
);

// X-Ray AI Narrative - generates the 3-sentence executive summary
router.get(
  '/:projectId/xray/narrative',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const summary = await getXRaySummary(projectId);
      const prompt = generateXRayNarrativePrompt(summary);

      // Return the prompt for client-side AI generation (uses existing AI copilot)
      res.json({
        success: true,
        data: {
          prompt,
          summary: summary.metrics,
        },
      });
    } catch (err) {
      console.error('X-Ray narrative error:', err);
      res.status(500).json({ success: false, error: 'X-Ray narrative generation failed' });
    }
  }
);

export default router;
