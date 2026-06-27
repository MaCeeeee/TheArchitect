/**
 * WFCOMP routes — Workflow → GDPR Art. 30 assessment (UC-WFCOMP-001).
 *
 * Slice 1 (THE-360): the privacy-safe assess endpoint. Deterministic only —
 * no LLM inference, no persistence yet (those are later slices).
 *
 * PRIVACY (Landmine #1): the raw request body may carry personal data. It is
 * sanitized as the FIRST operation (inside assessWorkflow → sanitizeN8nWorkflow)
 * and is NEVER logged, persisted, or echoed in a response.
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { assessWorkflow } from '../services/wfcomp/assess';
import { log } from '../config/logger';

const router = Router();

router.use(authenticate);
router.use('/:projectId', requireProjectAccess('viewer'));

/**
 * POST /api/projects/:projectId/wfcomp/assess
 * Body: a raw n8n workflow definition (JSON).
 * Returns: the deterministic Art.-30 GapReport (green/missing/needs_attestation).
 */
router.post(
  '/:projectId/wfcomp/assess',
  requirePermission(PERMISSIONS.ELEMENT_READ),
  audit({ action: 'wfcomp_assess', entityType: 'project', riskLevel: 'low' }),
  (req: Request, res: Response) => {
    try {
      // sanitize-first: assessWorkflow's first line is sanitizeN8nWorkflow(body).
      const report = assessWorkflow(req.body);
      res.json({ success: true, data: report });
    } catch {
      // NEVER echo req.body — it may carry personal data.
      log.warn('[wfcomp] assess: could not process workflow definition');
      res.status(400).json({ success: false, error: 'Invalid workflow definition' });
    }
  },
);

export default router;
