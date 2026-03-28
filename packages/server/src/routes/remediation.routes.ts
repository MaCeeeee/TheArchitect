import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { generateRemediation } from '../services/remediation.service';
import { applyProposal, rollbackProposal } from '../services/remediation-apply.service';
import { RemediationProposal } from '../models/RemediationProposal';
import type { RemediationContext, RemediationStreamEvent } from '@thearchitect/shared';

const router = Router();

router.use(authenticate);

// ─── Zod Schemas ───

const GenerateSchema = z.object({
  context: z.discriminatedUnion('source', [
    z.object({
      source: z.literal('compliance'),
      standardId: z.string().min(1),
      gapSectionIds: z.array(z.string()).min(1).max(50),
    }),
    z.object({
      source: z.literal('advisor'),
      insightIds: z.array(z.string()).min(1).max(20),
    }),
    z.object({
      source: z.literal('manual'),
      prompt: z.string().min(1).max(2000),
    }),
  ]),
});

const ApplySchema = z.object({
  selectedTempIds: z.array(z.string()).optional(),
  workspaceId: z.string().optional(),
});

const BatchApplySchema = z.object({
  proposalIds: z.array(z.string()).min(1).max(10),
  workspaceId: z.string().optional(),
});

const EditProposalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  elements: z.array(z.object({
    tempId: z.string(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })).optional(),
});

// ─── POST /generate (SSE) ───

router.post(
  '/:projectId/remediation/generate',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  rateLimit({ windowMs: 60_000, max: 10, name: 'remediation-generate' }),
  audit({ action: 'generate_remediation', entityType: 'remediation' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { context } = GenerateSchema.parse(req.body);
      const userId = (req as any).user._id.toString();

      // SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const onEvent = (event: RemediationStreamEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      await generateRemediation(projectId, userId, context as RemediationContext, onEvent);

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      if (err instanceof z.ZodError) {
        // If headers not sent yet, send JSON error
        if (!res.headersSent) {
          res.status(400).json({ success: false, error: 'Invalid request', details: err.errors });
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid request' })}\n\n`);
          res.end();
        }
        return;
      }
      const message = (err as Error).message || 'Remediation generation failed';
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: message });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        res.end();
      }
    }
  },
);

// ─── GET /proposals ───

router.get(
  '/:projectId/remediation/proposals',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ELEMENT_READ),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const proposals = await RemediationProposal.find({ projectId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const mapped = proposals.map((p) => ({
        id: p._id.toString(),
        projectId: p.projectId.toString(),
        source: p.source,
        sourceRef: p.sourceRef,
        title: p.title,
        description: p.description,
        elements: p.elements,
        connections: p.connections,
        validation: p.validation,
        status: p.status,
        confidence: p.confidence,
        createdBy: p.createdBy.toString(),
        appliedElementIds: p.appliedElementIds,
        appliedConnectionIds: p.appliedConnectionIds,
        appliedAt: p.appliedAt?.toISOString(),
        appliedBy: p.appliedBy?.toString(),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));

      res.json({ success: true, data: mapped });
    } catch (err) {
      console.error('[Remediation] List proposals error:', err);
      res.status(500).json({ success: false, error: 'Failed to list proposals' });
    }
  },
);

// ─── GET /proposals/:proposalId ───

router.get(
  '/:projectId/remediation/proposals/:proposalId',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ELEMENT_READ),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const proposalId = String(req.params.proposalId);
      const proposal = await RemediationProposal.findOne({ _id: proposalId, projectId }).lean();

      if (!proposal) {
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }

      res.json({
        success: true,
        data: {
          id: proposal._id.toString(),
          projectId: proposal.projectId.toString(),
          source: proposal.source,
          sourceRef: proposal.sourceRef,
          title: proposal.title,
          description: proposal.description,
          elements: proposal.elements,
          connections: proposal.connections,
          validation: proposal.validation,
          status: proposal.status,
          confidence: proposal.confidence,
          createdBy: proposal.createdBy.toString(),
          appliedElementIds: proposal.appliedElementIds,
          appliedConnectionIds: proposal.appliedConnectionIds,
          appliedAt: proposal.appliedAt?.toISOString(),
          appliedBy: proposal.appliedBy?.toString(),
          createdAt: proposal.createdAt.toISOString(),
          updatedAt: proposal.updatedAt.toISOString(),
        },
      });
    } catch (err) {
      console.error('[Remediation] Get proposal error:', err);
      res.status(500).json({ success: false, error: 'Failed to get proposal' });
    }
  },
);

// ─── PATCH /proposals/:proposalId ───

router.patch(
  '/:projectId/remediation/proposals/:proposalId',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_UPDATE),
  audit({ action: 'edit_remediation', entityType: 'remediation' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const proposalId = String(req.params.proposalId);
      const updates = EditProposalSchema.parse(req.body);

      const proposal = await RemediationProposal.findOne({ _id: proposalId, projectId });
      if (!proposal) {
        res.status(404).json({ success: false, error: 'Proposal not found' });
        return;
      }

      if (proposal.status === 'applied') {
        res.status(400).json({ success: false, error: 'Cannot edit an applied proposal' });
        return;
      }

      if (updates.title) proposal.title = updates.title;
      if (updates.description !== undefined) proposal.description = updates.description;

      // Update individual elements
      if (updates.elements) {
        for (const update of updates.elements) {
          const el = (proposal.elements as any[]).find((e: any) => e.tempId === update.tempId);
          if (el) {
            if (update.name) el.name = update.name;
            if (update.description !== undefined) el.description = update.description;
          }
        }
        proposal.markModified('elements');
      }

      await proposal.save();
      res.json({ success: true, data: { id: proposal._id.toString() } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid request', details: err.errors });
        return;
      }
      console.error('[Remediation] Edit proposal error:', err);
      res.status(500).json({ success: false, error: 'Failed to edit proposal' });
    }
  },
);

// ─── POST /proposals/:proposalId/apply ───

router.post(
  '/:projectId/remediation/proposals/:proposalId/apply',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  audit({ action: 'apply_remediation', entityType: 'remediation', riskLevel: 'high' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const proposalId = String(req.params.proposalId);
      const { selectedTempIds, workspaceId } = ApplySchema.parse(req.body);
      const userId = (req as any).user._id.toString();

      const result = await applyProposal(
        projectId,
        workspaceId || '',
        proposalId,
        userId,
        selectedTempIds,
      );

      res.json({
        success: true,
        data: {
          elementsCreated: result.elementIds.length,
          connectionsCreated: result.connectionIds.length,
          elementIds: result.elementIds,
          connectionIds: result.connectionIds,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid request', details: err.errors });
        return;
      }
      const message = (err as Error).message || 'Apply failed';
      console.error('[Remediation] Apply error:', err);
      res.status(500).json({ success: false, error: message });
    }
  },
);

// ─── POST /apply-batch ───

router.post(
  '/:projectId/remediation/apply-batch',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  audit({ action: 'apply_remediation_batch', entityType: 'remediation', riskLevel: 'high' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { proposalIds, workspaceId } = BatchApplySchema.parse(req.body);
      const userId = (req as any).user._id.toString();

      const results = [];
      for (const proposalId of proposalIds) {
        try {
          const result = await applyProposal(projectId, workspaceId || '', proposalId, userId);
          results.push({ proposalId, success: true, ...result });
        } catch (err) {
          results.push({ proposalId, success: false, error: (err as Error).message });
        }
      }

      res.json({ success: true, data: results });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ success: false, error: 'Invalid request', details: err.errors });
        return;
      }
      console.error('[Remediation] Batch apply error:', err);
      res.status(500).json({ success: false, error: 'Batch apply failed' });
    }
  },
);

// ─── POST /proposals/:proposalId/rollback ───

router.post(
  '/:projectId/remediation/proposals/:proposalId/rollback',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_DELETE),
  audit({ action: 'rollback_remediation', entityType: 'remediation', riskLevel: 'high' }),
  async (req: Request, res: Response) => {
    try {
      const proposalId = String(req.params.proposalId);
      await rollbackProposal(proposalId);
      res.json({ success: true });
    } catch (err) {
      const message = (err as Error).message || 'Rollback failed';
      console.error('[Remediation] Rollback error:', err);
      res.status(500).json({ success: false, error: message });
    }
  },
);

export default router;
