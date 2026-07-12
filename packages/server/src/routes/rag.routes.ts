import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import {
  ingestDocument,
  health,
  isConfigured,
  DataServerNotConfiguredError,
  type IngestDocumentInput,
} from '../services/dataServer.service';
import {
  governedQuery,
  type GovernedQueryInput,
  type VersionPin,
} from '../services/governedRetrieval.service';
import { log } from '../config/logger';

const router = Router();

/**
 * THE-422 security guard: `pin` arrives in an untrusted JSON body. Only string
 * values may pass — a value like `{ $ne: null }` would otherwise reach Mongo as a
 * query operator (NoSQL injection) via `getRegulationByKeyAndHash`. Non-object
 * input and non-string entries are dropped; an all-dropped result → undefined.
 * Exported for unit testing.
 */
export function sanitizePin(raw: unknown): VersionPin | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: VersionPin = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// NOTE: authenticate is applied PER ROUTE, not via a path-less `router.use()`.
// This router is mounted at `/api` (index.ts) alongside other `/api` routers.
// A path-less `router.use(authenticate)` runs for EVERY `/api/*` request that
// enters this router — including paths this router does not own (e.g.
// /api/regulations/corpus/health) — and would 401 them before they fall through
// to their real router. Keeping auth on the individual routes lets unrelated
// paths pass through cleanly. (THE-453)

// GET /api/rag/health — Data-Server reachability (authenticated: exposes a version string)
router.get('/rag/health', authenticate, async (_req: Request, res: Response) => {
  if (!isConfigured()) {
    return res.json({ configured: false, ok: false });
  }
  const h = await health();
  res.json({ configured: true, ...h });
});

// POST /api/projects/:projectId/rag/ingest
router.post(
  '/:projectId/rag/ingest',
  authenticate,
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
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const { text, topK, filters, pin, eligibleOnly } = req.body ?? {};

    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    try {
      const input: GovernedQueryInput = {
        projectId,
        text,
        topK: typeof topK === 'number' ? topK : undefined,
        filters,
        pin: sanitizePin(pin),
        eligibleOnly: typeof eligibleOnly === 'boolean' ? eligibleOnly : undefined,
      };
      const result = await governedQuery(input);
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
