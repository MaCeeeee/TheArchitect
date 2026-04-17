import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import {
  ingestDocument,
  queryDocuments,
  health,
  isConfigured,
  DataServerNotConfiguredError,
  type IngestDocumentInput,
  type QueryInput,
} from '../services/dataServer.service';
import { log } from '../config/logger';

const router = Router();

router.use(authenticate);

// GET /api/rag/health — check Data-Server reachability
router.get('/rag/health', async (_req: Request, res: Response) => {
  if (!isConfigured()) {
    return res.json({ configured: false, ok: false });
  }
  const h = await health();
  res.json({ configured: true, ...h });
});

// POST /api/projects/:projectId/rag/ingest
router.post(
  '/:projectId/rag/ingest',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const { source, filename, mimeType, content, metadata } = req.body ?? {};

    if (!source || !filename || !mimeType || typeof content !== 'string') {
      return res
        .status(400)
        .json({ success: false, error: 'source, filename, mimeType, content are required' });
    }

    try {
      const input: IngestDocumentInput = {
        projectId,
        source,
        filename,
        mimeType,
        content,
        metadata,
      };
      const result = await ingestDocument(input);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof DataServerNotConfiguredError) {
        return res.status(503).json({ success: false, error: err.message });
      }
      log.error({ err, projectId }, '[rag.ingest] failed');
      res.status(502).json({ success: false, error: 'Data-Server ingest failed' });
    }
  },
);

// POST /api/projects/:projectId/rag/query
router.post(
  '/:projectId/rag/query',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const { text, topK, filters } = req.body ?? {};

    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    try {
      const input: QueryInput = {
        projectId,
        text,
        topK: typeof topK === 'number' ? topK : undefined,
        filters,
      };
      const result = await queryDocuments(input);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof DataServerNotConfiguredError) {
        return res.status(503).json({ success: false, error: err.message });
      }
      log.error({ err, projectId }, '[rag.query] failed');
      res.status(502).json({ success: false, error: 'Data-Server query failed' });
    }
  },
);

export default router;
