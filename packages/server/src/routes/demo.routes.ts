import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { Project } from '../models/Project';
import { Standard } from '../models/Standard';
import { Policy } from '../models/Policy';
import { SimulationRun } from '../models/SimulationRun';
import { runCypher } from '../config/neo4j';
import { DEMO_PROJECT_NAME, DEMO_ELEMENTS, DEMO_CONNECTIONS } from '../data/demo-architecture';
import { DEMO_VISION, DEMO_STAKEHOLDERS, DEMO_STANDARDS, DEMO_POLICIES, DEMO_SIMULATION_RUN } from '../data/demo-seed';
import { log } from '../config/logger';

const router = Router();

// POST /api/demo/create — idempotent demo project creation
router.post('/create', authenticate, requirePermission(PERMISSIONS.PROJECT_CREATE), async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;

    // Check if user already has a demo project
    const existing = await Project.findOne({ ownerId: userId, name: DEMO_PROJECT_NAME });
    if (existing) {
      return res.json({
        projectId: existing._id,
        elementsCreated: 0,
        connectionsCreated: 0,
        existing: true,
      });
    }

    // Create project in MongoDB with Vision + Stakeholders
    const project = await Project.create({
      name: DEMO_PROJECT_NAME,
      description: 'A pre-built enterprise banking architecture demonstrating TheArchitect capabilities. Includes 28 elements across Business, Application, and Technology layers with 35 cross-layer connections, cost data, compliance standards, and governance policies.',
      ownerId: userId,
      togafPhase: 'architecture_vision',
      tags: ['demo', 'enterprise', 'banking'],
      vision: DEMO_VISION,
      stakeholders: DEMO_STAKEHOLDERS,
    });

    const projectId = project._id.toString();

    // Bulk-create elements in Neo4j with Tier 1-3 cost fields
    for (const el of DEMO_ELEMENTS) {
      await runCypher(
        `CREATE (e:ArchitectureElement {
          id: $id, projectId: $projectId, type: $type, name: $name,
          description: $description, layer: $layer, togafDomain: $togafDomain,
          maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
          posX: $posX, posY: $posY, posZ: $posZ,
          metadataJson: $metadataJson,
          annualCost: $annualCost,
          userCount: $userCount,
          recordCount: $recordCount,
          transformationStrategy: $transformationStrategy,
          ksloc: $ksloc,
          technicalFitness: $technicalFitness,
          functionalFitness: $functionalFitness,
          errorRatePercent: $errorRatePercent,
          hourlyRate: $hourlyRate,
          monthlyInfraCost: $monthlyInfraCost,
          technicalDebtRatio: $technicalDebtRatio,
          costEstimateOptimistic: $costEstimateOptimistic,
          costEstimateMostLikely: $costEstimateMostLikely,
          costEstimatePessimistic: $costEstimatePessimistic,
          successProbability: $successProbability,
          costOfDelayPerWeek: $costOfDelayPerWeek,
          createdAt: datetime(), updatedAt: datetime()
        }) RETURN e`,
        {
          id: el.id,
          projectId,
          type: el.type,
          name: el.name,
          description: el.description,
          layer: el.layer,
          togafDomain: el.togafDomain,
          maturityLevel: el.maturityLevel,
          riskLevel: el.riskLevel,
          status: el.status,
          posX: el.position3D.x,
          posY: el.position3D.y,
          posZ: el.position3D.z,
          metadataJson: JSON.stringify(el.metadata),
          annualCost: el.annualCost ?? 0,
          userCount: el.userCount ?? 0,
          recordCount: el.recordCount ?? 0,
          transformationStrategy: el.transformationStrategy ?? 'retain',
          ksloc: el.ksloc ?? 0,
          technicalFitness: el.technicalFitness ?? 3,
          functionalFitness: el.functionalFitness ?? 3,
          errorRatePercent: el.errorRatePercent ?? 0,
          hourlyRate: el.hourlyRate ?? 0,
          monthlyInfraCost: el.monthlyInfraCost ?? 0,
          technicalDebtRatio: el.technicalDebtRatio ?? 0,
          costEstimateOptimistic: el.costEstimateOptimistic ?? 0,
          costEstimateMostLikely: el.costEstimateMostLikely ?? 0,
          costEstimatePessimistic: el.costEstimatePessimistic ?? 0,
          successProbability: el.successProbability ?? 0.5,
          costOfDelayPerWeek: el.costOfDelayPerWeek ?? 0,
        }
      );
    }

    // Bulk-create connections in Neo4j
    for (const conn of DEMO_CONNECTIONS) {
      await runCypher(
        `MATCH (a:ArchitectureElement {id: $sourceId, projectId: $projectId}), (b:ArchitectureElement {id: $targetId, projectId: $projectId})
         CREATE (a)-[r:CONNECTS_TO {id: $connectionId, type: $type, label: $label}]->(b)
         RETURN r`,
        {
          sourceId: conn.sourceId,
          targetId: conn.targetId,
          projectId,
          connectionId: conn.id,
          type: conn.type,
          label: conn.label,
        }
      );
    }

    // Seed compliance standards
    for (const std of DEMO_STANDARDS) {
      await Standard.create({
        projectId: project._id,
        name: std.name,
        version: std.version,
        type: std.type,
        description: std.description,
        sections: std.sections,
        fullText: std.sections.map(s => `${s.number} ${s.title}\n${s.content}`).join('\n\n'),
        pageCount: std.sections.length,
        uploadedBy: userId,
      });
    }

    // Seed governance policies
    for (const pol of DEMO_POLICIES) {
      await Policy.create({
        projectId: project._id,
        name: pol.name,
        description: pol.description,
        category: pol.category,
        severity: pol.severity,
        enabled: pol.enabled,
        status: pol.status,
        source: pol.source,
        scope: pol.scope,
        rules: pol.rules,
        createdBy: userId,
        version: 1,
      });
    }

    // Seed pre-computed MiroFish simulation run
    await SimulationRun.create({
      projectId: project._id,
      createdBy: userId,
      name: DEMO_SIMULATION_RUN.name,
      status: DEMO_SIMULATION_RUN.status,
      scenarioType: DEMO_SIMULATION_RUN.scenarioType,
      config: DEMO_SIMULATION_RUN.config,
      rounds: DEMO_SIMULATION_RUN.rounds,
      result: DEMO_SIMULATION_RUN.result,
      totalTokensUsed: DEMO_SIMULATION_RUN.totalTokensUsed,
      totalDurationMs: DEMO_SIMULATION_RUN.totalDurationMs,
    });

    log.info({ projectId, elements: DEMO_ELEMENTS.length, connections: DEMO_CONNECTIONS.length, standards: DEMO_STANDARDS.length, policies: DEMO_POLICIES.length }, '[Demo] Project created');

    res.status(201).json({
      projectId,
      elementsCreated: DEMO_ELEMENTS.length,
      connectionsCreated: DEMO_CONNECTIONS.length,
      standardsCreated: DEMO_STANDARDS.length,
      policiesCreated: DEMO_POLICIES.length,
      simulationRunsCreated: 1,
      existing: false,
    });
  } catch (err) {
    log.error({ err }, '[Demo] Failed to create demo project');
    res.status(500).json({ error: 'Failed to create demo project. Please try again.' });
  }
});

export default router;
