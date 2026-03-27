import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { Project } from '../models/Project';
import { runCypher } from '../config/neo4j';
import { DEMO_PROJECT_NAME, DEMO_ELEMENTS, DEMO_CONNECTIONS } from '../data/demo-architecture';

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

    // Create project in MongoDB
    const project = await Project.create({
      name: DEMO_PROJECT_NAME,
      description: 'A pre-built enterprise banking architecture demonstrating TheArchitect capabilities. Includes 16 elements across Business, Application, and Technology layers with 22 cross-layer connections.',
      ownerId: userId,
      togafPhase: 'architecture_vision',
      tags: ['demo', 'enterprise', 'banking'],
    });

    const projectId = project._id.toString();

    // Bulk-create elements in Neo4j
    for (const el of DEMO_ELEMENTS) {
      await runCypher(
        `CREATE (e:ArchitectureElement {
          id: $id, projectId: $projectId, type: $type, name: $name,
          description: $description, layer: $layer, togafDomain: $togafDomain,
          maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
          posX: $posX, posY: $posY, posZ: $posZ,
          metadataJson: $metadataJson,
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

    res.status(201).json({
      projectId,
      elementsCreated: DEMO_ELEMENTS.length,
      connectionsCreated: DEMO_CONNECTIONS.length,
      existing: false,
    });
  } catch (err) {
    console.error('[Demo] Failed to create demo project:', err);
    res.status(500).json({ error: 'Failed to create demo project. Please try again.' });
  }
});

export default router;
