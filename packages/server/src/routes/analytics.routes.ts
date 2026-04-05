import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import {
  analyzeImpact,
  assessRisk,
  estimateCosts,
  runMonteCarloSimulation,
} from '../services/analytics.service';
import {
  computeGraphCentrality,
  computeRelativeRankings,
} from '../services/cost-engine.service';
import {
  runPERTMonteCarlo,
  computeWSJF,
  computeEVM,
  type PertMCInput,
  type WSJFInput,
  type EVMInput,
} from '../services/stochastic.service';

const router = Router();

router.use(authenticate);

// Impact Analysis
router.get(
  '/:projectId/analytics/impact/:elementId',
  requireProjectAccess('viewer'),
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
  requireProjectAccess('viewer'),
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
  requireProjectAccess('viewer'),
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
  requireProjectAccess('viewer'),
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

// Graph-Based Cost Analysis (Tier 0+)
router.get(
  '/:projectId/analytics/cost/graph',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const profiles = await computeGraphCentrality(projectId);
      res.json({ success: true, data: profiles });
    } catch (err) {
      console.error('Graph cost analysis error:', err);
      res.status(500).json({ success: false, error: 'Graph cost analysis failed' });
    }
  }
);

// Relative Rankings Summary
router.get(
  '/:projectId/analytics/cost/rankings',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const result = await computeRelativeRankings(projectId);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Rankings error:', err);
      res.status(500).json({ success: false, error: 'Rankings computation failed' });
    }
  }
);

// Probabilistic Cost Analysis (Tier 3 — PERT Monte Carlo)
router.post(
  '/:projectId/analytics/cost/probabilistic',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const { elements, iterations = 10000 } = req.body;

      if (!Array.isArray(elements) || elements.length === 0) {
        return res.status(400).json({ success: false, error: 'elements array required with O/M/P estimates' });
      }

      const inputs: PertMCInput[] = elements.map((el: Record<string, unknown>) => ({
        elementId: String(el.elementId || ''),
        elementName: String(el.elementName || ''),
        optimistic: Number(el.optimistic || 0),
        mostLikely: Number(el.mostLikely || 0),
        pessimistic: Number(el.pessimistic || 0),
        successProbability: el.successProbability != null ? Number(el.successProbability) : undefined,
      }));

      const result = runPERTMonteCarlo(inputs, Math.min(iterations, 50000));
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('Probabilistic cost error:', err);
      res.status(500).json({ success: false, error: 'Probabilistic cost analysis failed' });
    }
  }
);

// WSJF Prioritization
router.get(
  '/:projectId/analytics/cost/wsjf',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      // Fetch elements with costOfDelay and cost data
      const profiles = await computeGraphCentrality(projectId);
      const wsjfInputs: WSJFInput[] = profiles
        .filter((p) => p.totalEstimated && p.totalEstimated > 0)
        .map((p) => ({
          elementId: p.elementId,
          elementName: p.elementName,
          costOfDelay: 0, // Will be populated from element data below
          jobSize: p.totalEstimated || 0,
        }));

      // Enrich with costOfDelayPerWeek from Neo4j
      const { runCypher } = await import('../config/neo4j');
      const records = await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId})
         WHERE e.costOfDelayPerWeek IS NOT NULL AND e.costOfDelayPerWeek > 0
         RETURN e.id AS id, e.costOfDelayPerWeek AS cod`,
        { projectId },
      );
      const codMap = new Map<string, number>();
      for (const r of records) {
        const val = r.get('cod');
        codMap.set(r.get('id'), typeof val === 'object' && 'low' in val ? (val as { low: number }).low : Number(val));
      }
      for (const input of wsjfInputs) {
        input.costOfDelay = codMap.get(input.elementId) || input.jobSize * 0.01; // fallback: 1% of cost per week
      }

      const result = computeWSJF(wsjfInputs);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('WSJF error:', err);
      res.status(500).json({ success: false, error: 'WSJF computation failed' });
    }
  }
);

// Earned Value Management
router.post(
  '/:projectId/analytics/cost/evm',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const input: EVMInput = {
        budgetAtCompletion: Number(req.body.budgetAtCompletion || 0),
        plannedPercent: Number(req.body.plannedPercent || 0),
        earnedPercent: Number(req.body.earnedPercent || 0),
        actualCost: Number(req.body.actualCost || 0),
      };

      if (input.budgetAtCompletion <= 0) {
        return res.status(400).json({ success: false, error: 'budgetAtCompletion is required' });
      }

      const result = computeEVM(input);
      res.json({ success: true, data: result });
    } catch (err) {
      console.error('EVM error:', err);
      res.status(500).json({ success: false, error: 'EVM computation failed' });
    }
  }
);

export default router;
