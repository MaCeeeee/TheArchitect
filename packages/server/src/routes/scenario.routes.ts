import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import {
  createScenario,
  listScenarios,
  getScenario,
  deleteScenario,
  updateDeltas,
  compareScenarios,
  rankScenariosMCDA,
  rankScenariosTOPSIS,
  computeComplianceCostScore,
  generateAIVariants,
  analyzeScenarioRealOptions,
} from '../services/scenario.service';
import { blackScholesCall, changeSaturationMultiplier } from '../services/cost-engine.service';

const router = Router();

router.use(authenticate);

// List all scenarios for a project
router.get(
  '/:projectId/scenarios',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const scenarios = await listScenarios(projectId);
      res.json({ success: true, data: scenarios });
    } catch (err) {
      console.error('List scenarios error:', err);
      res.status(500).json({ success: false, error: 'Failed to list scenarios' });
    }
  },
);

// Get a single scenario
router.get(
  '/:projectId/scenarios/:scenarioId',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const scenarioId = String(req.params.scenarioId);
      const scenario = await getScenario(projectId, scenarioId);
      if (!scenario) {
        return res.status(404).json({ success: false, error: 'Scenario not found' });
      }
      res.json({ success: true, data: scenario });
    } catch (err) {
      console.error('Get scenario error:', err);
      res.status(500).json({ success: false, error: 'Failed to get scenario' });
    }
  },
);

// Create a new scenario
router.post(
  '/:projectId/scenarios',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { name, description, deltas } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Scenario name is required' });
      }

      const scenario = await createScenario(
        projectId,
        name.trim(),
        description,
        deltas,
      );
      res.status(201).json({ success: true, data: scenario });
    } catch (err) {
      console.error('Create scenario error:', err);
      res.status(500).json({ success: false, error: 'Failed to create scenario' });
    }
  },
);

// Delete a scenario
router.delete(
  '/:projectId/scenarios/:scenarioId',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const scenarioId = String(req.params.scenarioId);
      const deleted = await deleteScenario(projectId, scenarioId);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Scenario not found' });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Delete scenario error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete scenario' });
    }
  },
);

// Update scenario deltas
router.put(
  '/:projectId/scenarios/:scenarioId/deltas',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const scenarioId = String(req.params.scenarioId);
      const { deltas } = req.body;

      if (!Array.isArray(deltas)) {
        return res.status(400).json({ success: false, error: 'deltas array is required' });
      }

      const scenario = await updateDeltas(projectId, scenarioId, deltas);
      if (!scenario) {
        return res.status(404).json({ success: false, error: 'Scenario not found' });
      }
      res.json({ success: true, data: scenario });
    } catch (err) {
      console.error('Update deltas error:', err);
      res.status(500).json({ success: false, error: 'Failed to update deltas' });
    }
  },
);

// Compare two scenarios
router.post(
  '/:projectId/scenarios/compare',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { scenarioAId, scenarioBId } = req.body;

      if (!scenarioAId || !scenarioBId) {
        return res.status(400).json({ success: false, error: 'scenarioAId and scenarioBId are required' });
      }

      const result = await compareScenarios(projectId, scenarioAId, scenarioBId);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Compare scenarios error:', err);
      res.status(500).json({ success: false, error: 'Failed to compare scenarios' });
    }
  },
);

// MCDA Ranking
router.post(
  '/:projectId/scenarios/rank',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { scenarioIds, weights } = req.body;

      if (!Array.isArray(scenarioIds) || scenarioIds.length < 2) {
        return res.status(400).json({ success: false, error: 'At least 2 scenarioIds required' });
      }

      const result = await rankScenariosMCDA(projectId, scenarioIds, weights);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Rank scenarios error:', err);
      res.status(500).json({ success: false, error: 'Failed to rank scenarios' });
    }
  },
);

// TOPSIS Ranking
router.post(
  '/:projectId/scenarios/rank-topsis',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { scenarioIds, weights } = req.body;

      if (!Array.isArray(scenarioIds) || scenarioIds.length < 2) {
        return res.status(400).json({ success: false, error: 'At least 2 scenarioIds required' });
      }

      const result = await rankScenariosTOPSIS(projectId, scenarioIds, weights);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('TOPSIS rank error:', err);
      res.status(500).json({ success: false, error: 'Failed to rank scenarios (TOPSIS)' });
    }
  },
);

// Compliance Cost Scoring
router.get(
  '/:projectId/scenarios/:scenarioId/compliance/:framework',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const scenarioId = String(req.params.scenarioId);
      const framework = req.params.framework as 'dora' | 'nis2' | 'kritis';

      if (!['dora', 'nis2', 'kritis'].includes(framework)) {
        return res.status(400).json({ success: false, error: 'Framework must be dora, nis2, or kritis' });
      }

      const result = await computeComplianceCostScore(projectId, scenarioId, framework);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Compliance scoring error:', err);
      res.status(500).json({ success: false, error: 'Failed to compute compliance score' });
    }
  },
);

// Generate AI Variants
router.post(
  '/:projectId/scenarios/:scenarioId/ai-variants',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const scenarioId = String(req.params.scenarioId);
      const count = Math.min(parseInt(req.body.count) || 3, 5);

      const variants = await generateAIVariants(projectId, scenarioId, count);
      res.status(201).json({ success: true, data: variants });
    } catch (err) {
      console.error('AI variant generation error:', err);
      res.status(500).json({ success: false, error: 'Failed to generate AI variants' });
    }
  },
);

// Real Options Analysis
router.post(
  '/:projectId/scenarios/:scenarioId/real-options',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const scenarioId = String(req.params.scenarioId);
      const { timeToExpiry, riskFreeRate, volatility } = req.body;

      const result = await analyzeScenarioRealOptions(
        projectId,
        scenarioId,
        timeToExpiry || 2,
        riskFreeRate || 0.03,
        volatility || 0.30,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Real options error:', err);
      res.status(500).json({ success: false, error: 'Failed to analyze real options' });
    }
  },
);

// Change Saturation Analysis
router.post(
  '/:projectId/scenarios/change-saturation',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const { baseCost, concurrent, threshold, k } = req.body;

      if (!baseCost || !concurrent) {
        return res.status(400).json({ success: false, error: 'baseCost and concurrent are required' });
      }

      const result = changeSaturationMultiplier(baseCost, concurrent, threshold, k);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Change saturation error:', err);
      res.status(500).json({ success: false, error: 'Failed to compute change saturation' });
    }
  },
);

export default router;
