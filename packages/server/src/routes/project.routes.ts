import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { Project } from '../models/Project';
import { CompliancePipelineState } from '../models/CompliancePipelineState';
import { SimulationRun } from '../models/SimulationRun';
import { runCypher } from '../config/neo4j';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';

const router = Router();

router.use(authenticate);

// List projects for current user
router.get(
  '/',
  requirePermission(PERMISSIONS.PROJECT_READ),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!._id;
      const projects = await Project.find({
        $or: [
          { ownerId: userId },
          { 'collaborators.userId': userId },
        ],
      })
        .sort({ updatedAt: -1 })
        .limit(50);
      res.json(projects);
    } catch (err) {
      console.error('List projects error:', err);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  }
);

// Create project
router.post(
  '/',
  requirePermission(PERMISSIONS.PROJECT_CREATE),
  audit({ action: 'create_project', entityType: 'project' }),
  async (req: Request, res: Response) => {
    try {
      const { name, description, tags } = req.body;
      const project = await Project.create({
        name,
        description,
        ownerId: req.user!._id,
        tags: tags || [],
      });
      res.status(201).json(project);
    } catch (err) {
      console.error('Create project error:', err);
      res.status(500).json({ error: 'Failed to create project' });
    }
  }
);

// Get project by ID
router.get(
  '/:id',
  requirePermission(PERMISSIONS.PROJECT_READ),
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
    } catch (err) {
      console.error('Get project error:', err);
      res.status(500).json({ error: 'Failed to get project' });
    }
  }
);

// Get project stats for dashboard (element/connection counts + pipeline phase)
router.get(
  '/:id/stats',
  requirePermission(PERMISSIONS.PROJECT_READ),
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.id;

      // Count elements and connections from Neo4j
      let elementCount = 0;
      let connectionCount = 0;
      try {
        const elRecords = await runCypher(
          'MATCH (n:Element {projectId: $projectId}) RETURN count(n) AS cnt',
          { projectId }
        );
        elementCount = elRecords[0]?.get('cnt')?.toNumber?.() ?? 0;
        const connRecords = await runCypher(
          'MATCH (:Element {projectId: $projectId})-[r:CONNECTS_TO]->() RETURN count(r) AS cnt',
          { projectId }
        );
        connectionCount = connRecords[0]?.get('cnt')?.toNumber?.() ?? 0;
      } catch {
        // Neo4j may not be available; return zeros
      }

      // Determine pipeline phase from CompliancePipelineState
      const STAGE_ORDER: Record<string, number> = {
        uploaded: 0, mapped: 1, policies_generated: 2, roadmap_ready: 3, tracking: 4,
      };
      const pipelineStates = await CompliancePipelineState.find({ projectId });
      const maxStage = pipelineStates.reduce((max, ps) => {
        const idx = STAGE_ORDER[ps.stage] ?? -1;
        return idx > max ? idx : max;
      }, -1);

      const simRuns = await SimulationRun.countDocuments({ projectId });

      // Calculate journey phase (same logic as client journeyStore)
      const phase1Done = elementCount >= 5 && connectionCount >= 3;
      const phase2Done = maxStage >= 1;
      const phase3Done = maxStage >= 2;
      const phase4Done = simRuns > 0 || maxStage >= 3;

      let currentPhase = 5;
      if (!phase1Done) currentPhase = 1;
      else if (!phase2Done) currentPhase = 2;
      else if (!phase3Done) currentPhase = 3;
      else if (!phase4Done) currentPhase = 4;

      const phasesDone = [phase1Done, phase2Done, phase3Done, phase4Done, false];
      const healthScore = phasesDone.filter(Boolean).length * 20;

      res.json({ elementCount, connectionCount, currentPhase, healthScore });
    } catch (err) {
      console.error('Get project stats error:', err);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }
);

// Update project
router.put(
  '/:id',
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  requireProjectAccess('editor'),
  audit({ action: 'update_project', entityType: 'project' }),
  async (req: Request, res: Response) => {
    try {
      const { name, description, tags, settings, togafPhase } = req.body;
      const project = await Project.findByIdAndUpdate(
        req.params.id,
        { name, description, tags, settings, togafPhase },
        { new: true }
      );
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
    } catch (err) {
      console.error('Update project error:', err);
      res.status(500).json({ error: 'Failed to update project' });
    }
  }
);

// Delete project
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.PROJECT_DELETE),
  requireProjectAccess('owner'),
  audit({ action: 'delete_project', entityType: 'project', riskLevel: 'critical' }),
  async (req: Request, res: Response) => {
    try {
      const project = await Project.findByIdAndDelete(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ message: 'Project deleted' });
    } catch (err) {
      console.error('Delete project error:', err);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  }
);

// Create version snapshot
router.post(
  '/:id/versions',
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
  requireProjectAccess('editor'),
  audit({ action: 'create_version', entityType: 'version' }),
  async (req: Request, res: Response) => {
    try {
      const { label, snapshot } = req.body;
      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      project.versions.push({
        versionId: uuid(),
        label: label || `v${project.versions.length + 1}`,
        snapshot,
        createdAt: new Date(),
        createdBy: req.user!._id,
      });
      await project.save();

      res.status(201).json(project.versions[project.versions.length - 1]);
    } catch (err) {
      console.error('Create version error:', err);
      res.status(500).json({ error: 'Failed to create version' });
    }
  }
);

// ── Collaborator Management ────────────────────────────

// List collaborators
router.get(
  '/:id/collaborators',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const project = await Project.findById(req.params.id)
        .populate('collaborators.userId', 'name email role avatarUrl');
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const collaborators = project.collaborators.map((c) => ({
        userId: c.userId,
        role: c.role,
        joinedAt: c.joinedAt,
      }));

      res.json({
        data: collaborators,
        ownerId: project.ownerId,
      });
    } catch (err) {
      console.error('List collaborators error:', err);
      res.status(500).json({ error: 'Failed to list collaborators' });
    }
  }
);

// Add collaborator by email
router.post(
  '/:id/collaborators',
  requirePermission(PERMISSIONS.PROJECT_MANAGE_COLLABORATORS),
  requireProjectAccess('editor'),
  audit({ action: 'add_collaborator', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { email, role = 'viewer' } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const validRoles = ['editor', 'reviewer', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid project role. Must be editor, reviewer, or viewer.' });
      }

      const { User } = await import('../models/User');
      const targetUser = await User.findOne({ email: email.toLowerCase().trim() });
      if (!targetUser) return res.status(404).json({ error: 'User not found' });

      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // Check if already a collaborator
      const existing = project.collaborators.find(
        (c) => c.userId.toString() === targetUser._id.toString()
      );
      if (existing) {
        return res.status(409).json({ error: 'User is already a collaborator' });
      }

      // Can't add the owner as collaborator
      if (project.ownerId.toString() === targetUser._id.toString()) {
        return res.status(409).json({ error: 'User is the project owner' });
      }

      project.collaborators.push({
        userId: targetUser._id,
        role,
        joinedAt: new Date(),
      });
      await project.save();

      res.status(201).json({
        userId: { _id: targetUser._id, name: targetUser.name, email: targetUser.email },
        role,
        joinedAt: new Date(),
      });
    } catch (err) {
      console.error('Add collaborator error:', err);
      res.status(500).json({ error: 'Failed to add collaborator' });
    }
  }
);

// Update collaborator role
router.put(
  '/:id/collaborators/:userId',
  requirePermission(PERMISSIONS.PROJECT_MANAGE_COLLABORATORS),
  requireProjectAccess('editor'),
  audit({ action: 'change_collaborator_role', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body;
      const validRoles = ['editor', 'reviewer', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid project role' });
      }

      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const collab = project.collaborators.find(
        (c) => c.userId.toString() === req.params.userId
      );
      if (!collab) return res.status(404).json({ error: 'Collaborator not found' });

      collab.role = role;
      await project.save();
      res.json({ message: 'Role updated', role });
    } catch (err) {
      console.error('Update collaborator role error:', err);
      res.status(500).json({ error: 'Failed to update collaborator role' });
    }
  }
);

// Remove collaborator
router.delete(
  '/:id/collaborators/:userId',
  requirePermission(PERMISSIONS.PROJECT_MANAGE_COLLABORATORS),
  requireProjectAccess('editor'),
  audit({ action: 'remove_collaborator', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const idx = project.collaborators.findIndex(
        (c) => c.userId.toString() === req.params.userId
      );
      if (idx === -1) return res.status(404).json({ error: 'Collaborator not found' });

      project.collaborators.splice(idx, 1);
      await project.save();
      res.json({ message: 'Collaborator removed' });
    } catch (err) {
      console.error('Remove collaborator error:', err);
      res.status(500).json({ error: 'Failed to remove collaborator' });
    }
  }
);

export default router;
