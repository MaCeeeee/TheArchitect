/**
 * Ops Register — platform-wide operational register (THE-476, REQ-PROBMGMT-001.5).
 *
 * System-scoped, NOT project-scoped: every defect/incident/problem for the whole production
 * environment lands in one central register — "collect all errors, fix them fast." Gated to
 * system-admin roles (no per-project access check). Reuses the deterministic engine via a fixed
 * sentinel projectId, so the model + service are untouched and the project-scoped register
 * (register.routes) keeps working unchanged.
 *
 *   POST /api/ops/register/ingest                   canonical payload (no projectId) → WORM row
 *   POST /api/ops/register/:chainId/gate            human gate decision
 *   POST /api/ops/register/:chainId/close           verify-closure
 *   POST /api/ops/register/sla-sweep                SLA-breach escalation sweep
 *   POST /api/ops/register/:chainId/suggest-duplicates
 *   POST /api/ops/register/suggest-problems
 *   POST /api/ops/register/problem                  human-confirmed problem from a cluster
 *   GET  /api/ops/register                          list ops entries only
 */
import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { RegisterEntry } from '../models/RegisterEntry';
import {
  ingestEntry,
  decideGate,
  closeEntry,
  sweepSla,
  createProblem,
  RegisterNotFoundError,
} from '../services/register.service';
import {
  suggestDuplicates,
  suggestProblemClusters,
} from '../services/registerEnrichment.service';
import {
  IngestBodySchema,
  GateBodySchema,
  CloseBodySchema,
  CreateProblemBodySchema,
  actorOf,
} from './register.routes';
import { log } from '../config/logger';

/**
 * Fixed sentinel projectId for the platform-wide ops scope. Not a real Project — the ops routes
 * never do a project lookup (system-admin auth instead). All ops register rows carry this id, so
 * they are cleanly separable from project-scoped rows.
 */
export const OPS_PROJECT_ID = '000000000000000000000000';

const SYSTEM_ADMIN_ROLES = ['chief_architect', 'enterprise_architect'];

/** Gate the ops register to system-admin roles (AC-2). authenticate runs first. */
function requireSystemAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  if (!SYSTEM_ADMIN_ROLES.includes(user.role)) {
    return res
      .status(403)
      .json({ success: false, error: 'System-admin role required for the ops register' });
  }
  next();
}

const router = Router();
router.use(authenticate);
router.use(requireSystemAdmin);

// ─── POST /register/ingest ──────────────────────────────────────────────────

router.post('/register/ingest', async (req: Request, res: Response) => {
  const parsed = IngestBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: 'invalid body', details: parsed.error.issues });
  }
  try {
    const entry = await ingestEntry(OPS_PROJECT_ID, parsed.data, actorOf(req));
    return res.status(201).json({ success: true, data: entry });
  } catch (err) {
    log.error({ err }, '[ops-register.ingest] failed');
    return res.status(500).json({ success: false, error: 'failed to ingest register entry' });
  }
});

// ─── POST /register/:chainId/gate ───────────────────────────────────────────

router.post('/register/:chainId/gate', async (req: Request, res: Response) => {
  const chainId = String(req.params.chainId);
  if (!mongoose.isValidObjectId(chainId)) {
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
      OPS_PROJECT_ID,
      chainId,
      parsed.data.actionType,
      parsed.data.decision,
      actorOf(req),
    );
    return res.status(200).json({ success: true, data: entry });
  } catch (err) {
    if (err instanceof RegisterNotFoundError) {
      return res.status(404).json({ success: false, error: err.message });
    }
    log.error({ err, chainId }, '[ops-register.gate] failed');
    return res.status(500).json({ success: false, error: 'failed to record gate decision' });
  }
});

// ─── POST /register/:chainId/close ──────────────────────────────────────────

router.post('/register/:chainId/close', async (req: Request, res: Response) => {
  const chainId = String(req.params.chainId);
  if (!mongoose.isValidObjectId(chainId)) {
    return res.status(400).json({ success: false, error: 'invalid id' });
  }
  const parsed = CloseBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: 'invalid body', details: parsed.error.issues });
  }
  try {
    const result = await closeEntry(OPS_PROJECT_ID, chainId, parsed.data, actorOf(req));
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof RegisterNotFoundError) {
      return res.status(404).json({ success: false, error: err.message });
    }
    log.error({ err, chainId }, '[ops-register.close] failed');
    return res.status(500).json({ success: false, error: 'failed to close register entry' });
  }
});

// ─── POST /register/sla-sweep ───────────────────────────────────────────────

router.post('/register/sla-sweep', async (req: Request, res: Response) => {
  try {
    const breached = await sweepSla(OPS_PROJECT_ID, actorOf(req));
    return res.json({ success: true, data: { breached, count: breached.length } });
  } catch (err) {
    log.error({ err }, '[ops-register.sla-sweep] failed');
    return res.status(500).json({ success: false, error: 'failed to sweep SLA deadlines' });
  }
});

// ─── POST /register/:chainId/suggest-duplicates ─────────────────────────────

router.post('/register/:chainId/suggest-duplicates', async (req: Request, res: Response) => {
  const chainId = String(req.params.chainId);
  if (!mongoose.isValidObjectId(chainId)) {
    return res.status(400).json({ success: false, error: 'invalid id' });
  }
  try {
    const result = await suggestDuplicates(OPS_PROJECT_ID, chainId, actorOf(req));
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof RegisterNotFoundError) {
      return res.status(404).json({ success: false, error: err.message });
    }
    log.error({ err, chainId }, '[ops-register.suggest-duplicates] failed');
    return res.status(500).json({ success: false, error: 'failed to suggest duplicates' });
  }
});

// ─── POST /register/suggest-problems ────────────────────────────────────────

router.post('/register/suggest-problems', async (req: Request, res: Response) => {
  try {
    const result = await suggestProblemClusters(OPS_PROJECT_ID, actorOf(req));
    return res.json({ success: true, data: result });
  } catch (err) {
    log.error({ err }, '[ops-register.suggest-problems] failed');
    return res.status(500).json({ success: false, error: 'failed to suggest problem clusters' });
  }
});

// ─── POST /register/problem ─────────────────────────────────────────────────

router.post('/register/problem', async (req: Request, res: Response) => {
  const parsed = CreateProblemBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: 'invalid body', details: parsed.error.issues });
  }
  try {
    const problem = await createProblem(OPS_PROJECT_ID, parsed.data, actorOf(req));
    return res.status(201).json({ success: true, data: problem });
  } catch (err) {
    log.error({ err }, '[ops-register.problem] failed');
    return res.status(500).json({ success: false, error: 'failed to create problem' });
  }
});

// ─── GET /register (ops entries only) ───────────────────────────────────────

router.get('/register', async (_req: Request, res: Response) => {
  try {
    const items = await RegisterEntry.find({ projectId: OPS_PROJECT_ID })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.json({ success: true, data: { items, total: items.length } });
  } catch (err) {
    log.error({ err }, '[ops-register.list] failed');
    return res.status(500).json({ success: false, error: 'failed to list register entries' });
  }
});

export default router;
