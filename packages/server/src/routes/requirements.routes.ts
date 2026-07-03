/**
 * Requirements Routes — REQ-REQGEN-001.3 (THE-304 Backend-Anteil)
 *
 * Endpoints für UC-REQGEN-001 Compliance Requirements Generation:
 *   POST   /api/projects/:projectId/requirements/generate    (preview, kein persist)
 *   POST   /api/projects/:projectId/requirements             (confirm, persist)
 *   GET    /api/projects/:projectId/requirements             (list mit Filter)
 *   GET    /api/projects/:projectId/requirements/by-element/:elementId  (reverse-lookup)
 *   PATCH  /api/projects/:projectId/requirements/:id         (status + assignee Update)
 *   DELETE /api/projects/:projectId/requirements/:id         (mit Audit)
 *
 * Pattern: compliance.routes.ts
 *
 * Linear: THE-304 (Backend-Anteil)
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';
import {
  generateRequirementsFromText,
  RequirementGeneratorError,
} from '../services/requirementGenerator.service';
import { loadProjectCandidateElements } from '../services/complianceElements.service';
import { projectRequirementsToModel } from '../services/requirementProjection.service';
import { computeComplianceGaps } from '../services/compliance-gaps.service';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

// ─── Validators ─────────────────────────────────────────────────

const GenerateBodySchema = z.object({
  text: z.string().min(20).max(12_000),
  source: z.string().min(1).max(50).default('custom'),
  paragraphNumber: z.string().min(1).max(100).default('preview'),
  language: z.enum(['de', 'en']).default('de'),
  jurisdiction: z.string().min(1).max(50).default('EU'),
  regulationId: z.string().optional(),  // wenn vorhanden: persist sofort
  // if regulationId provided + persist=true → service called with persist mode
  persist: z.boolean().default(false),
});

const ConfirmBodySchema = z.object({
  regulationId: z.string(),
  sourceParagraph: z.string().min(20).max(5000),
  requirements: z
    .array(
      z.object({
        title: z.string().min(5).max(200),
        description: z.string().min(5).max(2000),
        priority: z.enum(['must', 'should', 'may']),
        linkedElementIds: z.array(z.string().min(1)).default([]),
        // Explainability layer — preserved from the LLM preview through human curation (audit trail)
        extractionConfidence: z.number().min(0).max(1).optional(),
        extractionRationale: z.string().max(1000).optional(),
        mappingConfidence: z.number().min(0).max(1).optional(),
        mappingRationale: z.string().max(1000).optional(),
      }),
    )
    .min(1)
    .max(20),
});

const UpdateBodySchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'waived']).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),  // ISO date
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(5).max(2000).optional(),
  priority: z.enum(['must', 'should', 'may']).optional(),
  linkedElementIds: z.array(z.string().min(1)).optional(),
});

const GapsQuerySchema = z.object({
  regulationId: z.string().optional(),
  elementId: z.string().optional(),
  priority: z.enum(['must', 'should', 'may']).optional(),
});

const ListQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'waived']).optional(),
  priority: z.enum(['must', 'should', 'may']).optional(),
  regulationId: z.string().optional(),
  assigneeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

// ─── POST /generate (preview, kein persist) ─────────────────────
// Rate-limited (LLM-Call ist teuer) — 30 req/min/user

const generateRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  name: 'requirements-generate',
});

router.post(
  '/:projectId/requirements/generate',
  requireProjectAccess('viewer'),
  generateRateLimit,
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = GenerateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }

    const candidateElements = await loadProjectCandidateElements(projectId).catch(() => []);

    try {
      const result = await generateRequirementsFromText({
        text: parsed.data.text,
        source: parsed.data.source,
        paragraphNumber: parsed.data.paragraphNumber,
        language: parsed.data.language,
        jurisdiction: parsed.data.jurisdiction,
        candidateElements,
      });
      res.json({
        success: true,
        data: {
          regulation: {
            source: parsed.data.source,
            paragraphNumber: parsed.data.paragraphNumber,
            language: parsed.data.language,
          },
          requirements: result.candidates,
        },
      });
    } catch (err) {
      if (err instanceof RequirementGeneratorError) {
        log.warn({ err: err.message, projectId }, '[requirements.generate] failed');
        return res.status(502).json({ success: false, error: err.message });
      }
      log.error({ err, projectId }, '[requirements.generate] unexpected failure');
      res.status(500).json({ success: false, error: 'generate failed' });
    }
  },
);

// ─── POST / (confirm, persist) ──────────────────────────────────
// Persistiert User-bestätigte Requirements (z.B. nach Edit im Modal).

router.post(
  '/:projectId/requirements',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = ConfirmBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    if (!mongoose.isValidObjectId(parsed.data.regulationId)) {
      return res.status(400).json({ success: false, error: 'invalid regulationId' });
    }

    // Verify regulation exists + belongs to project
    const reg = await Regulation.findOne({
      _id: new mongoose.Types.ObjectId(parsed.data.regulationId),
      projectId: new mongoose.Types.ObjectId(projectId),
    });
    if (!reg) {
      return res.status(404).json({ success: false, error: 'regulation not found' });
    }

    const projectObjectId = new mongoose.Types.ObjectId(projectId);
    const regulationObjectId = new mongoose.Types.ObjectId(parsed.data.regulationId);

    const ops = parsed.data.requirements.map(r => ({
      updateOne: {
        filter: {
          projectId: projectObjectId,
          regulationId: regulationObjectId,
          title: r.title,
        },
        update: {
          $set: {
            projectId: projectObjectId,
            regulationId: regulationObjectId,
            sourceParagraph: parsed.data.sourceParagraph,
            title: r.title,
            description: r.description,
            priority: r.priority,
            linkedElementIds: r.linkedElementIds,
            status: 'open' as const,
            createdBy: 'human' as const,
            // Preserve LLM explainability through human curation (optional, audit trail)
            ...(r.extractionConfidence !== undefined && { extractionConfidence: r.extractionConfidence }),
            ...(r.extractionRationale !== undefined && { extractionRationale: r.extractionRationale }),
            ...(r.mappingConfidence !== undefined && { mappingConfidence: r.mappingConfidence }),
            ...(r.mappingRationale !== undefined && { mappingRationale: r.mappingRationale }),
          },
        },
        upsert: true,
      },
    }));

    await ComplianceRequirement.bulkWrite(ops, { ordered: false });

    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'requirements.confirm',
        entityType: 'ComplianceRequirement',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'medium',
        after: {
          regulationId: parsed.data.regulationId,
          confirmedCount: parsed.data.requirements.length,
        },
      });
    }

    const persisted = await ComplianceRequirement.find({
      projectId: projectObjectId,
      regulationId: regulationObjectId,
      title: { $in: parsed.data.requirements.map(r => r.title) },
    }).lean();

    res.json({ success: true, data: persisted });
  },
);

// ─── POST /project-to-model (UC-REQPROJ-001 / THE-315) ──────────
// Projects confirmed ComplianceRequirements into the Neo4j graph as ArchiMate
// Motivation elements (requirement/constraint) + influence/realization edges.

const ProjectBodySchema = z.object({
  requirementIds: z.array(z.string()).optional(),  // omit → project all confirmed
});

router.post(
  '/:projectId/requirements/project-to-model',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = ProjectBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    if (parsed.data.requirementIds?.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({ success: false, error: 'invalid requirementId in list' });
    }

    try {
      const summary = await projectRequirementsToModel({
        projectId,
        requirementIds: parsed.data.requirementIds,
      });

      if (req.user) {
        await createAuditEntry({
          userId: req.user._id.toString(),
          projectId,
          action: 'requirements.project',
          entityType: 'ComplianceRequirement',
          ip: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          riskLevel: 'medium',
          after: {
            requirementsProjected: summary.requirementsProjected,
            constraintsProjected: summary.constraintsProjected,
            driversUpserted: summary.driversUpserted,
            realizationEdges: summary.realizationEdges,
          },
        });
      }

      res.json({ success: true, data: summary });
    } catch (err) {
      log.error({ err, projectId }, '[requirements.project-to-model] failed');
      res.status(500).json({ success: false, error: 'projection failed' });
    }
  },
);

// ─── GET /compliance/gaps (UC-GAP-001 / THE-307) ────────────────
// Live aggregation from ComplianceRequirement on every request — never
// cached stats (design constraint from THE-389).

router.get(
  '/:projectId/compliance/gaps',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = GapsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid query', details: parsed.error.issues });
    }

    try {
      const result = await computeComplianceGaps(projectId, parsed.data);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error({ err, projectId }, '[requirements.gaps] failed');
      res.status(500).json({ success: false, error: 'gap analysis failed' });
    }
  },
);

// ─── GET / (list mit Filter) ────────────────────────────────────

router.get(
  '/:projectId/requirements',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid query', details: parsed.error.issues });
    }
    const { status, priority, regulationId, assigneeId, limit, skip } = parsed.data;

    const filter: Record<string, unknown> = {
      projectId: new mongoose.Types.ObjectId(projectId),
    };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (regulationId && mongoose.isValidObjectId(regulationId)) {
      filter.regulationId = new mongoose.Types.ObjectId(regulationId);
    }
    if (assigneeId && mongoose.isValidObjectId(assigneeId)) {
      filter.assigneeId = new mongoose.Types.ObjectId(assigneeId);
    }

    const [items, total] = await Promise.all([
      ComplianceRequirement.find(filter)
        .sort({ priority: 1, status: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ComplianceRequirement.countDocuments(filter),
    ]);

    res.json({ success: true, data: { items, total, limit, skip } });
  },
);

// ─── GET /by-element/:elementId (reverse-lookup) ────────────────

router.get(
  '/:projectId/requirements/by-element/:elementId',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const elementId = String(req.params.elementId);
    if (!elementId) {
      return res.status(400).json({ success: false, error: 'elementId required' });
    }

    const items = await ComplianceRequirement.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      linkedElementIds: elementId,
    })
      .sort({ priority: 1, status: 1, createdAt: -1 })
      .lean();

    res.json({ success: true, data: items });
  },
);

// ─── PATCH /:id (status + assignee Update) ──────────────────────

router.patch(
  '/:projectId/requirements/:id',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }

    const parsed = UpdateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }

    const setFields: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) setFields.status = parsed.data.status;
    if (parsed.data.assigneeId !== undefined) {
      if (parsed.data.assigneeId && !mongoose.isValidObjectId(parsed.data.assigneeId)) {
        return res.status(400).json({ success: false, error: 'invalid assigneeId' });
      }
      setFields.assigneeId = parsed.data.assigneeId
        ? new mongoose.Types.ObjectId(parsed.data.assigneeId)
        : null;
    }
    if (parsed.data.dueDate !== undefined) {
      setFields.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    }
    if (parsed.data.title !== undefined) setFields.title = parsed.data.title;
    if (parsed.data.description !== undefined) setFields.description = parsed.data.description;
    if (parsed.data.priority !== undefined) setFields.priority = parsed.data.priority;
    if (parsed.data.linkedElementIds !== undefined) {
      setFields.linkedElementIds = parsed.data.linkedElementIds;
    }

    if (Object.keys(setFields).length === 0) {
      return res.status(400).json({ success: false, error: 'no fields to update' });
    }

    const projectObjectId = new mongoose.Types.ObjectId(projectId);
    const doc = await ComplianceRequirement.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), projectId: projectObjectId },
      { $set: setFields },
      { new: true, runValidators: true },
    );
    if (!doc) {
      return res.status(404).json({ success: false, error: 'requirement not found' });
    }

    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'requirements.update',
        entityType: 'ComplianceRequirement',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'low',
        after: { id, ...setFields },
      });
    }

    res.json({ success: true, data: doc });
  },
);

// ─── DELETE /:id (mit Audit) ────────────────────────────────────

router.delete(
  '/:projectId/requirements/:id',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }

    const projectObjectId = new mongoose.Types.ObjectId(projectId);
    const doc = await ComplianceRequirement.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(id),
      projectId: projectObjectId,
    });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'requirement not found' });
    }

    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'requirements.delete',
        entityType: 'ComplianceRequirement',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'medium',
        after: { id, title: doc.title, priority: doc.priority },
      });
    }

    res.json({ success: true, data: { id } });
  },
);

export default router;
