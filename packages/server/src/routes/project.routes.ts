import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { Project } from '../models/Project';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
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

// Update project
router.put(
  '/:id',
  requirePermission(PERMISSIONS.PROJECT_UPDATE),
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

export default router;
