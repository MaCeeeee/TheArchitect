import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { Workspace } from '../models/Workspace';
import { runCypher } from '../config/neo4j';
import { createAuditEntry } from '../middleware/audit.middleware';

/** Neo4j integer → number (counts only). Kept local: no dependency on another domain's service. */
const toCount = (v: unknown): number =>
  typeof v === 'number' ? v : (v as { toNumber?: () => number } | null)?.toNumber?.() ?? 0;

const router = Router();

router.use(authenticate);

// GET /api/workspaces/:projectId — list workspaces for a project
router.get('/:projectId', requireProjectAccess('viewer'), async (req: Request, res: Response) => {
  try {
    const workspaces = await Workspace.find({ projectId: req.params.projectId }).sort({ offsetX: 1 });
    res.json({ data: workspaces });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// POST /api/workspaces/:projectId — create a workspace
router.post('/:projectId', requireProjectAccess('editor'), async (req: Request, res: Response) => {
  try {
    const { id, name, source, color, offsetX } = req.body;
    // Use the client-provided stable id as _id so it matches each element's
    // workspaceId across reloads (enables reliable workspace deletion).
    const wsId = (typeof id === 'string' && id) ? id : `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const workspace = await Workspace.create({
      _id: wsId,
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
router.put('/:projectId/:workspaceId', requireProjectAccess('editor'), async (req: Request, res: Response) => {
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

// DELETE /api/workspaces/:projectId/:workspaceId — delete workspace + cascade its Neo4j elements.
// Neo4j first: if it fails the workspace still exists and the delete can be retried. Deleting Mongo
// first (before THE-767) left orphans whenever Neo4j failed.
// Legacy workspaces with a BSON ObjectId _id are NOT found here (schema _id is String) — they are
// normalised by scripts/workspace-integrity.ts --align (THE-769), not special-cased at request time.
router.delete('/:projectId/:workspaceId', requireProjectAccess('editor'), async (req: Request, res: Response) => {
  try {
    const { projectId, workspaceId } = req.params;
    const workspace = await Workspace.findOne({ _id: workspaceId, projectId });
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Count and delete in one statement so the audit reports exactly what was removed.
    const records = await runCypher(
      `OPTIONAL MATCH (e:ArchitectureElement {projectId: $projectId, workspaceId: $workspaceId})
       OPTIONAL MATCH (e)-[r]-(o)
       WITH collect(DISTINCT e) AS els,
            collect(DISTINCT r) AS rels,
            collect(DISTINCT CASE WHEN o:ArchitectureElement AND coalesce(o.workspaceId, '') <> $workspaceId THEN r END) AS crossRels
       WITH els, size(rels) AS relationships, size(crossRels) AS crossWorkspaceRelationships,
            size([x IN els WHERE x.certifiedBy IS NOT NULL]) AS certified
       FOREACH (x IN els | DETACH DELETE x)
       RETURN size(els) AS elements, relationships, crossWorkspaceRelationships, certified`,
      { projectId, workspaceId },
    );
    const row = records[0];
    const removed = {
      elements: toCount(row?.get('elements')),
      relationships: toCount(row?.get('relationships')),
      crossWorkspaceRelationships: toCount(row?.get('crossWorkspaceRelationships')),
      certified: toCount(row?.get('certified')),
    };

    await Workspace.deleteOne({ _id: workspaceId, projectId });
    await createAuditEntry({
      userId: String(req.user!._id),
      projectId: String(projectId),
      action: 'delete_workspace',
      entityType: 'workspace',
      entityId: String(workspaceId),
      before: { name: workspace.name, source: workspace.source },
      after: removed,
      ip: req.ip || req.socket.remoteAddress || '',
      userAgent: req.get('user-agent') || '',
      // Certified elements removed by an editor bypass the notary — flag for review.
      riskLevel: removed.certified > 0 ? 'high' : 'medium',
    });

    res.json({ message: 'Workspace deleted', removed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

export default router;
