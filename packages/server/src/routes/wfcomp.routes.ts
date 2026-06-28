/**
 * WFCOMP routes — Workflow → GDPR Art. 30 assessment (UC-WFCOMP-001).
 *
 * Assess + persist (Slice 3, THE-360): runs the pipeline, persists the lifted
 * graph (Neo4j, tenant-scoped) + an assessment record (Mongo, with a corpus
 * reference — not a text copy).
 *
 * PRIVACY (Landmine #1): the raw request body may carry personal data. It is
 * sanitized as the FIRST operation (inside the pipeline) and is NEVER logged,
 * persisted, or echoed in a response.
 */
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { assessAndStore, recomputeAssessment } from '../services/wfcomp/store';
import { log } from '../config/logger';

const router = Router();

router.use(authenticate);
router.use('/:projectId', requireProjectAccess('viewer'));

/**
 * POST /api/projects/:projectId/wfcomp/assess[?infer=true][&workflowId=…]
 * Body: a raw n8n workflow definition (JSON).
 * Returns: the Art.-30 GapReport (and persists it). A stable `workflowId` makes
 * re-assessment replace the prior record; absent → a fresh assessment.
 * With ?infer=true the legal fields get guarded LLM suggestions (graceful
 * degradation if the LLM is unavailable).
 */
router.post(
  '/:projectId/wfcomp/assess',
  requirePermission(PERMISSIONS.ELEMENT_READ),
  audit({ action: 'wfcomp_assess', entityType: 'project', riskLevel: 'low' }),
  async (req: Request, res: Response) => {
    try {
      const workflowId = typeof req.query.workflowId === 'string' ? req.query.workflowId : uuid();
      const report = await assessAndStore({
        projectId: req.params.projectId as string,
        wfcompId: workflowId,
        raw: req.body, // sanitize-first inside the pipeline; raw is never logged/echoed
        infer: req.query.infer === 'true',
        assessedBy: req.jwtPayload?.userId,
      });
      res.json({ success: true, data: report });
    } catch {
      // NEVER echo req.body — it may carry personal data.
      log.warn('[wfcomp] assess: processing or persistence failed');
      res.status(500).json({ success: false, error: 'Assessment failed' });
    }
  },
);

/**
 * POST /api/projects/:projectId/wfcomp/recompute
 * Body: { workflowId: string, attestations: [{ litera, value }] }
 *
 * A human confirms/provides the legal fields the machine could not produce.
 * Each attestation materializes its Art.-30 trace path → the field flips to
 * 'present' (a person makes it green, never the LLM). Persists the updated graph
 * + verdict. Requires GOVERNANCE_APPROVE — this is a sign-off, not a read.
 * The attestation values are the controller's own VVT content (organizational
 * metadata), so — unlike /assess — they are legitimately persisted.
 */
router.post(
  '/:projectId/wfcomp/recompute',
  requirePermission(PERMISSIONS.GOVERNANCE_APPROVE),
  audit({ action: 'wfcomp_attest', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    const { workflowId, attestations } = req.body ?? {};
    if (typeof workflowId !== 'string' || !Array.isArray(attestations)) {
      res.status(400).json({ success: false, error: 'workflowId and attestations[] are required' });
      return;
    }
    try {
      const report = await recomputeAssessment({
        projectId: req.params.projectId as string,
        wfcompId: workflowId,
        attestations,
        attestedBy: req.jwtPayload?.userId,
      });
      res.json({ success: true, data: report });
    } catch (err) {
      const notFound = err instanceof Error && err.message === 'no persisted assessment to recompute';
      log.warn(`[wfcomp] recompute: ${notFound ? 'no persisted assessment' : 'failed'}`);
      res
        .status(notFound ? 404 : 500)
        .json({ success: false, error: notFound ? 'No assessment to recompute' : 'Recompute failed' });
    }
  },
);

export default router;
