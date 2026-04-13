import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import {
  generateVision,
  suggestStakeholders,
  suggestPrinciples,
  detectConflicts,
  assessReadiness,
  suggestInterests,
  extractVisionFromDocument,
} from '../services/envision-ai.service';
import { extractText, isSupportedDocument, getSupportedFormats } from '../services/document-parser.service';

const router = Router();

router.use(authenticate);
router.use(requireVerifiedEmail);

// AI rate limits — per-endpoint to avoid document uploads eating generation quota
const aiRateLimit = rateLimit({ name: 'ai-envision', windowMs: 24 * 60 * 60 * 1000, max: 20 });
const uploadRateLimit = rateLimit({ name: 'ai-envision-upload', windowMs: 60 * 60 * 1000, max: 30 });

// ─── Helper: check AI configured ───

function aiConfigured(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

// ─── POST /:projectId/envision/ai/generate-vision ───

router.post(
  '/:projectId/envision/ai/generate-vision',
  aiRateLimit,
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    if (!aiConfigured()) {
      return res.status(503).json({ error: 'AI not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.' });
    }

    const { description } = req.body;
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'description is required' });
    }

    const projectId = String(req.params.projectId);

    try {
      const result = await generateVision(description, projectId);
      res.json({ data: result });
    } catch (err) {
      console.error('[EnvisionAI] generateVision error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── POST /:projectId/envision/ai/suggest-stakeholders ───

router.post(
  '/:projectId/envision/ai/suggest-stakeholders',
  aiRateLimit,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    if (!aiConfigured()) {
      return res.status(503).json({ error: 'AI not configured.' });
    }

    const { scope, visionStatement } = req.body;
    if (!scope) {
      return res.status(400).json({ error: 'scope is required' });
    }

    try {
      const result = await suggestStakeholders(scope, visionStatement || '');
      res.json({ data: result });
    } catch (err) {
      console.error('[EnvisionAI] suggestStakeholders error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── POST /:projectId/envision/ai/suggest-principles ───

router.post(
  '/:projectId/envision/ai/suggest-principles',
  aiRateLimit,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    if (!aiConfigured()) {
      return res.status(503).json({ error: 'AI not configured.' });
    }

    const { scope, existingPrinciples } = req.body;

    try {
      const result = await suggestPrinciples(scope || '', existingPrinciples || []);
      res.json({ data: result });
    } catch (err) {
      console.error('[EnvisionAI] suggestPrinciples error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── POST /:projectId/envision/ai/detect-conflicts ───

router.post(
  '/:projectId/envision/ai/detect-conflicts',
  aiRateLimit,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    if (!aiConfigured()) {
      return res.status(503).json({ error: 'AI not configured.' });
    }

    const { stakeholders } = req.body;
    if (!Array.isArray(stakeholders) || stakeholders.length < 2) {
      return res.status(400).json({ error: 'At least 2 stakeholders are required for conflict detection' });
    }

    try {
      const result = await detectConflicts(stakeholders);
      res.json({ data: result });
    } catch (err) {
      console.error('[EnvisionAI] detectConflicts error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── POST /:projectId/envision/ai/assess-readiness ───

router.post(
  '/:projectId/envision/ai/assess-readiness',
  aiRateLimit,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    if (!aiConfigured()) {
      return res.status(503).json({ error: 'AI not configured.' });
    }

    const { vision, stakeholders } = req.body;

    try {
      const result = await assessReadiness(
        vision || { scope: '', visionStatement: '', principles: [], drivers: [], goals: [] },
        stakeholders || [],
      );
      res.json({ data: result });
    } catch (err) {
      console.error('[EnvisionAI] assessReadiness error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── POST /:projectId/envision/ai/suggest-interests ───

router.post(
  '/:projectId/envision/ai/suggest-interests',
  aiRateLimit,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    if (!aiConfigured()) {
      return res.status(503).json({ error: 'AI not configured.' });
    }

    const { stakeholderType, scope } = req.body;
    if (!stakeholderType) {
      return res.status(400).json({ error: 'stakeholderType is required' });
    }

    try {
      const result = await suggestInterests(stakeholderType, scope || '');
      res.json({ data: result });
    } catch (err) {
      console.error('[EnvisionAI] suggestInterests error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── POST /:projectId/envision/ai/extract-document ───

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isSupportedDocument(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Supported: ${getSupportedFormats()}`));
    }
  },
});

function handleUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('document')(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.post(
  '/:projectId/envision/ai/extract-document',
  uploadRateLimit,
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    if (!aiConfigured()) {
      return res.status(503).json({ error: 'AI not configured.' });
    }

    try {
      await handleUpload(req, res);

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
      if (!text.trim()) {
        return res.status(400).json({ error: 'Could not extract text from document.' });
      }

      const result = await extractVisionFromDocument(text);
      res.json({ data: result });
    } catch (err) {
      console.error('[EnvisionAI] extractDocument error:', err);
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

export default router;
