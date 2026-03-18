import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { Workspace } from '../models/Workspace';
import { runCypher } from '../config/neo4j';

const router = Router();

router.use(authenticate);

// All routes require project membership
router.use('/:projectId', requireProjectAccess('viewer'));

// GET /api/workspaces/:projectId — list workspaces for a project
router.get('/:projectId', async (req: Request, res: Response) => {
  try {
    const workspaces = await Workspace.find({ projectId: req.params.projectId }).sort({ offsetX: 1 });
    res.json({ data: workspaces });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// POST /api/workspaces/:projectId — create a workspace
router.post('/:projectId', async (req: Request, res: Response) => {
  try {
    const { name, source, color, offsetX } = req.body;
    const workspace = await Workspace.create({
      name,
      projectId: req.params.projectId,
      source: source || 'manual',
      color: color || '#3b82f6',
      offsetX: offsetX ?? 0,
      createdBy: (req as any).user._id,
    });
    res.status(201).json({ data: workspace });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// PUT /api/workspaces/:projectId/:workspaceId — update a workspace
router.put('/:projectId/:workspaceId', async (req: Request, res: Response) => {
  try {
    const { name, color, offsetX } = req.body;
    const workspace = await Workspace.findOneAndUpdate(
      { _id: req.params.workspaceId, projectId: req.params.projectId },
      { $set: { name, color, offsetX } },
      { new: true }
    );
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    res.json({ data: workspace });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update workspace' });
  }
});

// DELETE /api/workspaces/:projectId/:workspaceId — delete workspace + cascade Neo4j elements
router.delete('/:projectId/:workspaceId', async (req: Request, res: Response) => {
  try {
    const { projectId, workspaceId } = req.params;
    const result = await Workspace.findOneAndDelete({
      _id: workspaceId,
      projectId,
    });
    if (!result) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    // Cascade: delete all Neo4j elements and their connections for this workspace
    await runCypher(
      `MATCH (e:Element { projectId: $projectId, workspaceId: $workspaceId })
       DETACH DELETE e`,
      { projectId, workspaceId }
    );
    res.json({ message: 'Workspace deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

export default router;
