import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { createSnapshot, listSnapshots, resolveSharedSnapshot, revokeSnapshot } from '../services/snapshot.service';
import { createAuditEntry } from '../middleware/audit.middleware';

const router = Router();

// ─── Public: Access a shared snapshot (NO auth required) ───
// GET /api/snapshots/:token
// THE-655: 410 Gone, sobald Projekt oder Ersteller gelöscht sind — ein
// geteilter Link überlebt seinen Ursprung nicht (DSGVO Art. 17 Abs. 2).
// Eine einzige Formulierung für beide Gründe: der anonyme Linkinhaber
// erfährt nicht, welcher Ursprung gelöscht wurde (Art. 17 — keine Aussage
// über eine gelöschte Person gegenüber einem anonymen Linkinhaber); der
// Grund landet nur im Server-Log.
// Einmal-Signal: der Token wird beim 410 entfernt, jeder spätere Aufruf
// bekommt das generische 404. Bewusst ohne Tombstone-Speicher (Grund:
// Einfachheit — kein zweiter Store neben der In-Memory-Map, die ohnehin
// nach Mongo wandern soll); Preis: ein Reload zeigt 404 statt des
// Klartexts.
router.get('/snapshots/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token);
    const resolution = await resolveSharedSnapshot(token);
    if (resolution.kind === 'not_found') {
      return res.status(404).json({ success: false, error: 'Snapshot not found or expired' });
    }
    if (resolution.kind === 'gone') {
      console.warn(`[Snapshot] gone (${resolution.reason}) for token ${token.slice(0, 8)}…`);
      return res.status(410).json({
        success: false,
        error: 'This shared link is no longer available: the project or account it belonged to has been deleted.',
      });
    }
    const { snapshot } = resolution;
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
