/**
 * Operational Governance Engine — Register routes (THE-445, Slice 1).
 *
 *   POST /api/projects/:projectId/register/ingest          canonical payload → scored WORM row
 *   POST /api/projects/:projectId/register/:entryId/gate   human decision on a proposed action
 *   GET  /api/projects/:projectId/register                 list rows (verification/inspection)
 *
 * Slice 1 is deliberately without n8n and without LLM — it proves the engine + the human gate.
 * Linear: THE-445 (UC-PROBMGMT-001)
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { RegisterEntry } from '../models/RegisterEntry';
import { ingestEntry, decideGate, RegisterNotFoundError } from '../services/register.service';
import type { ActorContext } from '../services/register.service';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

// ─── Validators (AC-1: strict schema, reject malformed with 400) ────────────

const IngestBodySchema = z.object({
  kind: z.enum(['incident', 'defect', 'problem', 'risk']).default('defect'),
  source: z
    .enum(['manual', 'sentry', 'github', 'sonarqube', 'dependabot', 'support'])
    .default('manual'),
  systemComponent: z.string().min(1).max(200),
  environment: z.string().min(1).max(50),
  title: z.string().min(3).max(300),
  description: z.string().max(5000).optional(),
  stackTrace: z.string().max(20_000).optional(),
  errorType: z.string().max(200).optional(),
  eventId: z.string().max(200).optional(),
  severity: z.number().int().min(1).max(5),
  urgency: z.number().int().min(1).max(5),
  criticality: z.number().int().min(1).max(5),
  mitigation: z.number().int().min(0).max(5).default(0),
  owner: z.string().max(200).optional(),
});

const GateBodySchema = z.object({
  actionType: z.enum([
    'page_oncall',
    'create_blocker',
    'create_backlog_item',
    'reply_reporter',
    'reject_noise',
  ]),
  decision: z.enum(['approve', 'reject']),
});

function actorOf(req: Request): ActorContext {
  return {
    userId: req.user?._id?.toString(),
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

// ─── POST /:projectId/register/ingest ───────────────────────────────────────

router.post(
  '/:projectId/register/ingest',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const parsed = IngestBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    try {
      const entry = await ingestEntry(projectId, parsed.data, actorOf(req));
      return res.status(201).json({ success: true, data: entry });
    } catch (err) {
      log.error({ err, projectId }, '[register.ingest] failed');
      return res.status(500).json({ success: false, error: 'failed to ingest register entry' });
    }
  },
);

// ─── POST /:projectId/register/:entryId/gate ────────────────────────────────

router.post(
  '/:projectId/register/:entryId/gate',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const entryId = String(req.params.entryId);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(entryId)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }
    const parsed = GateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    try {
      const entry = await decideGate(
        projectId,
        entryId,
        parsed.data.actionType,
        parsed.data.decision,
        actorOf(req),
      );
      return res.status(200).json({ success: true, data: entry });
    } catch (err) {
      if (err instanceof RegisterNotFoundError) {
        return res.status(404).json({ success: false, error: err.message });
      }
      log.error({ err, projectId, entryId }, '[register.gate] failed');
      return res.status(500).json({ success: false, error: 'failed to record gate decision' });
    }
  },
);

// ─── GET /:projectId/register ───────────────────────────────────────────────

router.get(
  '/:projectId/register',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    try {
      const items = await RegisterEntry.find({ projectId })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
      return res.json({ success: true, data: { items, total: items.length } });
    } catch (err) {
      log.error({ err, projectId }, '[register.list] failed');
      return res.status(500).json({ success: false, error: 'failed to list register entries' });
    }
  },
);

export default router;
