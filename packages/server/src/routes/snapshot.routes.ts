import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { createSnapshot, getSnapshot, listSnapshots, revokeSnapshot } from '../services/snapshot.service';
import { createAuditEntry } from '../middleware/audit.middleware';

const router = Router();

// ─── Public: Access a shared snapshot (NO auth required) ───
// GET /api/snapshots/:token
router.get('/snapshots/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token);
    const snapshot = getSnapshot(token);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: 'Snapshot not found or expired' });
    }
    res.json({
      success: true,
      data: {
        title: snapshot.title,
        description: snapshot.description,
        viewType: snapshot.viewType,
        createdAt: snapshot.createdAt,
        expiresAt: snapshot.expiresAt,
        elements: snapshot.data.elements,
        connections: snapshot.data.connections,
        summary: snapshot.data.summary,
      },
    });
  } catch (err) {
    console.error('[Snapshot] Access error:', err);
    res.status(500).json({ success: false, error: 'Failed to load snapshot' });
  }
});

// ─── Protected: Create, List, Revoke ───

// POST /api/projects/:projectId/snapshots
router.post(
  '/:projectId/snapshots',
  authenticate,
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const userId = (req as any).user?.id || '';
      const { title, description, viewType, filters, expiresInHours, maxAccesses } = req.body;

      if (!title || !viewType) {
        return res.status(400).json({ success: false, error: 'title and viewType are required' });
      }

      const snapshot = await createSnapshot({
        projectId, createdBy: userId,
        title, description, viewType, filters,
        expiresInHours, maxAccesses,
      });

      res.json({
        success: true,
        data: {
          id: snapshot.id,
          token: snapshot.token,
          shareUrl: `/shared/${snapshot.token}`,
          expiresAt: snapshot.expiresAt,
          elementCount: snapshot.data.elements.length,
          connectionCount: snapshot.data.connections.length,
        },
      });
    } catch (err) {
      console.error('[Snapshot] Create error:', err);
      res.status(500).json({ success: false, error: 'Failed to create snapshot' });
    }
  },
);

// GET /api/projects/:projectId/snapshots
router.get(
  '/:projectId/snapshots',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const snapshots = listSnapshots(projectId);
      res.json({ success: true, data: snapshots });
    } catch (err) {
      console.error('[Snapshot] List error:', err);
      res.status(500).json({ success: false, error: 'Failed to list snapshots' });
    }
  },
);

// DELETE /api/projects/:projectId/snapshots/:token
router.delete(
  '/:projectId/snapshots/:token',
  authenticate,
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const token = String(req.params.token);
    revokeSnapshot(token);
    res.json({ success: true });
  },
);

export default router;
