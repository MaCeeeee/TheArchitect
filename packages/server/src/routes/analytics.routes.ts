import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import {
  analyzeImpact,
  assessRisk,
  estimateCosts,
  runMonteCarloSimulation,
} from '../services/analytics.service';

const router = Router();

router.use(authenticate);

// Impact Analysis
router.get(
  '/:projectId/analytics/impact/:elementId',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const elementId = String(req.params.elementId);
      const depth = parseInt(req.query.depth as string) || 5;

      const result = await analyzeImpact(projectId, elementId, depth);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Impact analysis error:', err);
      res.status(500).json({ success: false, error: 'Impact analysis failed' });
    }
  }
);

// Risk Assessment
router.get(
  '/:projectId/analytics/risk',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const result = await assessRisk(projectId);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Risk assessment error:', err);
      res.status(500).json({ success: false, error: 'Risk assessment failed' });
    }
  }
);

// Cost Estimation
router.get(
  '/:projectId/analytics/cost',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const result = await estimateCosts(projectId);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Cost estimation error:', err);
      res.status(500).json({ success: false, error: 'Cost estimation failed' });
    }
  }
);

// Monte Carlo Simulation
router.post(
  '/:projectId/analytics/simulate',
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const { baselineCost, riskFactors, iterations = 10000 } = req.body;

      if (!baselineCost || !Array.isArray(riskFactors)) {
        return res.status(400).json({ success: false, error: 'baselineCost and riskFactors are required' });
      }

      const result = runMonteCarloSimulation({
        baselineCost,
        riskFactors,
        iterations: Math.min(iterations, 50000),
      });

      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Simulation error:', err);
      res.status(500).json({ success: false, error: 'Simulation failed' });
    }
  }
);

export default router;
