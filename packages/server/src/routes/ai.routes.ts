import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { streamChat } from '../services/ai.service';

const router = Router();

router.use(authenticate);
router.use(requireVerifiedEmail);
router.use(rateLimit({ name: 'ai-chat', windowMs: 24 * 60 * 60 * 1000, max: 50 }));

// POST /:projectId/ai/chat — Streaming AI chat
router.post(
  '/:projectId/ai/chat',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    // Check if any AI provider is configured
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: 'AI not configured',
        message: 'No AI API key is set. Configure OPENAI_API_KEY or ANTHROPIC_API_KEY in the server environment.',
      });
    }

    const { messages, standardId, sectionIds } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const projectId = String(req.params.projectId);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await streamChat(
        projectId,
        messages,
        (text) => {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        },
        () => {
          res.write('data: [DONE]\n\n');
          res.end();
        },
        (err) => {
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        },
        standardId,
        sectionIds,
      );
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'AI chat failed' });
      } else {
        res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
        res.end();
      }
    }
  },
);

export default router;
