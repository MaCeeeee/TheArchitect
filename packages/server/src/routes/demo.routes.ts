import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { Project } from '../models/Project';
import { Standard } from '../models/Standard';
import { Policy } from '../models/Policy';
import { SimulationRun } from '../models/SimulationRun';
import { User } from '../models/User';
import { runCypher } from '../config/neo4j';
import { DEMO_PROJECT_NAME, DEMO_ELEMENTS, DEMO_CONNECTIONS } from '../data/demo-architecture';
import { DEMO_VISION, DEMO_STAKEHOLDERS, DEMO_STANDARDS, DEMO_POLICIES, DEMO_SIMULATION_RUN } from '../data/demo-seed';
import { DEMO_PROJECT_NAME_BSH, DEMO_ELEMENTS_BSH, DEMO_CONNECTIONS_BSH } from '../data/demo-architecture-bsh';
import { DEMO_VISION_BSH, DEMO_STAKEHOLDERS_BSH, DEMO_STANDARDS_BSH, DEMO_POLICIES_BSH } from '../data/demo-seed-bsh';
import { BSH_ACTIVITY_PROJECT_NAME, buildBshActivitySeed } from '../data/bsh-activity-demo';
import { buildBshTransformationActivities } from '../data/bsh-esg-activities';
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

    // Ensure user has full access to demo features (compliance, governance, etc.)
    await User.findByIdAndUpdate(userId, { role: 'enterprise_architect' });

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

// POST /api/demo/create-bsh — BSH ESG Compliance Transformation demo (skeleton)
router.post('/create-bsh', authenticate, requirePermission(PERMISSIONS.PROJECT_CREATE), async (req: Request, res: Response) => {
  try {
    const userId = (req as unknown as { user: { id: string } }).user.id;

    const existing = await Project.findOne({ ownerId: userId, name: DEMO_PROJECT_NAME_BSH });
    if (existing) {
      return res.json({
        projectId: existing._id,
        elementsCreated: 0,
        connectionsCreated: 0,
        existing: true,
      });
    }

    const project = await Project.create({
      name: DEMO_PROJECT_NAME_BSH,
      description:
        'BSH Home Appliances ESG Compliance Transformation — CSRD, LkSG, CSDDD, EU Taxonomy, SBTi. Demonstrates motivation-layer drivers, business capabilities/processes, application landscape, and target architecture across 40 plants and ~8,000 suppliers.',
      ownerId: userId,
      togafPhase: 'architecture_vision',
      tags: ['demo', 'esg', 'manufacturing', 'csrd', 'lksg'],
      vision: DEMO_VISION_BSH,
      stakeholders: DEMO_STAKEHOLDERS_BSH,
    });

    const projectId = project._id.toString();

    // Ensure user has full access to demo features (compliance, governance, etc.)
    await User.findByIdAndUpdate(userId, { role: 'enterprise_architect' });

    for (const el of DEMO_ELEMENTS_BSH) {
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

    for (const conn of DEMO_CONNECTIONS_BSH) {
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

    // Activity-Drill-Down (UC-ADD-003): seed composition-children for the 4 drillable processes
    const activitySeed = buildBshTransformationActivities();
    for (const el of activitySeed.elements) {
      await runCypher(
        `CREATE (e:ArchitectureElement {
          id: $id, projectId: $projectId, type: $type, name: $name,
          description: $description, layer: $layer, togafDomain: $togafDomain,
          maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
          posX: $posX, posY: $posY, posZ: $posZ,
          metadataJson: $metadataJson,
          createdAt: datetime(), updatedAt: datetime()
        }) RETURN e`,
        { ...el, projectId }
      );
    }
    for (const conn of activitySeed.connections) {
      await runCypher(
        `MATCH (a:ArchitectureElement {id: $sourceId, projectId: $projectId}),
               (b:ArchitectureElement {id: $targetId, projectId: $projectId})
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

    for (const std of DEMO_STANDARDS_BSH) {
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

    for (const pol of DEMO_POLICIES_BSH) {
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

    log.info(
      {
        projectId,
        elements: DEMO_ELEMENTS_BSH.length + activitySeed.elements.length,
        connections: DEMO_CONNECTIONS_BSH.length + activitySeed.connections.length,
        activities: activitySeed.elements.length,
      },
      '[Demo BSH] Project created (incl. drillable activities)'
    );

    res.status(201).json({
      projectId,
      elementsCreated: DEMO_ELEMENTS_BSH.length + activitySeed.elements.length,
      connectionsCreated: DEMO_CONNECTIONS_BSH.length + activitySeed.connections.length,
      activitiesCreated: activitySeed.elements.length,
      standardsCreated: DEMO_STANDARDS_BSH.length,
      policiesCreated: DEMO_POLICIES_BSH.length,
      existing: false,
    });
  } catch (err) {
    log.error({ err }, '[Demo BSH] Failed to create BSH demo project');
    res.status(500).json({ error: 'Failed to create BSH demo project.' });
  }
});

// POST /api/demo/seed-bsh-activities — Activity-Drill-Down demo (Phase 7)
router.post(
  '/seed-bsh-activities',
  authenticate,
  requirePermission(PERMISSIONS.PROJECT_CREATE),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as unknown as { user: { id: string } }).user.id;

      let project = await Project.findOne({ ownerId: userId, name: BSH_ACTIVITY_PROJECT_NAME });
      let isExisting = !!project;

      if (!project) {
        project = await Project.create({
          name: BSH_ACTIVITY_PROJECT_NAME,
          description:
            'Activity-Drill-Down Demo for BSH (06.05.2026). 4 Business Processes with composition-children for the pyramidal Activity-View — GDPR (6), Supplier Onboarding (4), Product Recall (12), CSRD Reporting (28).',
          ownerId: userId,
          togafPhase: 'business_architecture',
          tags: ['demo', 'bsh', 'activity-drill', 'esg'],
        });
      }

      const projectId = project._id.toString();
      const { elements, connections } = buildBshActivitySeed();

      // Wipe any prior seed elements/connections from this project to keep it idempotent
      await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId}) DETACH DELETE e`,
        { projectId }
      );

      for (const el of elements) {
        await runCypher(
          `CREATE (e:ArchitectureElement {
            id: $id, projectId: $projectId, type: $type, name: $name,
            description: $description, layer: $layer, togafDomain: $togafDomain,
            maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
            posX: $posX, posY: $posY, posZ: $posZ,
            metadataJson: $metadataJson,
            createdAt: datetime(), updatedAt: datetime()
          }) RETURN e`,
          { ...el, projectId }
        );
      }

      for (const conn of connections) {
        await runCypher(
          `MATCH (a:ArchitectureElement {id: $sourceId, projectId: $projectId}),
                 (b:ArchitectureElement {id: $targetId, projectId: $projectId})
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

      log.info(
        { projectId, elements: elements.length, connections: connections.length },
        '[Demo BSH-Activity] Seed complete'
      );

      res.status(isExisting ? 200 : 201).json({
        projectId,
        elementsCreated: elements.length,
        connectionsCreated: connections.length,
        existing: isExisting,
      });
    } catch (err) {
      log.error({ err }, '[Demo BSH-Activity] Seed failed');
      res.status(500).json({ error: 'Failed to seed BSH activity demo.' });
    }
  }
);

export default router;
