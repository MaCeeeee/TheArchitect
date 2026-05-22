/**
 * Compliance Routes — REQ-ICM-002.3 (THE-280)
 *
 * Auto-Mapping + Reverse-Lookup-Endpoints für die UC-ICM-002-Pipeline:
 *   POST /api/projects/:projectId/compliance/mappings/auto       (editor)
 *   POST /api/projects/:projectId/compliance/mappings/preview    (viewer, rate-limited)
 *   GET  /api/projects/:projectId/compliance/mappings/by-element/:elementId    (viewer)
 *   GET  /api/projects/:projectId/compliance/mappings/by-regulation/:regulationId  (viewer)
 *   POST /api/projects/:projectId/compliance/mappings/confirm    (editor)
 *
 * Alle Routes authenticate-protected via globaler Mount-Reihenfolge in index.ts;
 * Mutationen verlangen `editor`, Lese-Endpoints `viewer`. Audit-Trail bei
 * `auto` und `confirm` mit `riskLevel: 'medium'`.
 *
 * Linear: UC-ICM-002 (THE-273), AC-1..AC-5 von THE-280
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { Regulation } from '../models/Regulation';
import { ComplianceMapping } from '../models/ComplianceMapping';
import {
  mapRegulationToElements,
  mapTextToElements,
  ComplianceMappingError,
} from '../services/complianceMapping.service';
import { loadProjectCandidateElements } from '../services/complianceElements.service';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

// ─── Validators ─────────────────────────────────────────────────

const AutoMappingBodySchema = z.object({
  regulationIds: z.array(z.string()).max(100).optional(),
});

const PreviewBodySchema = z.object({
  text: z.string().min(20).max(12_000),
  source: z.string().min(1).max(50).default('custom'),
  paragraphNumber: z.string().min(1).max(100).default('preview'),
  language: z.enum(['de', 'en']).default('de'),
  jurisdiction: z.string().min(1).max(50).default('EU'),
});

const ConfirmBodySchema = z.object({
  regulationId: z.string(),
  mappings: z
    .array(
      z.object({
        elementId: z.string().min(1),
        elementType: z.enum([
          'capability',
          'application',
          'data_object',
          'business_process',
          'business_actor',
          'business_service',
          'application_service',
          'business_function',
          'business_object',
          'business_role',
          'technology_service',
          'node',
          'custom',
        ]),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(10),
});

// ─── POST /api/projects/:projectId/compliance/mappings/auto ─────
// Batch-mappt Regulations gegen Projekt-Elements. Wenn `regulationIds`
// fehlt: alle Regulations des Projekts.
// ────────────────────────────────────────────────────────────────
router.post(
  '/:projectId/compliance/mappings/auto',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = AutoMappingBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    const requestedIds = parsed.data.regulationIds ?? [];
    const invalidIds = requestedIds.filter(id => !mongoose.isValidObjectId(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: `invalid regulationIds: ${invalidIds.join(', ')}`,
      });
    }

    // 1) Candidate elements aus Neo4j laden
    const candidateElements = await loadProjectCandidateElements(projectId);
    if (candidateElements.length === 0) {
      return res.json({
        success: true,
        data: { total: 0, mapped: 0, errors: [], note: 'no architecture elements in project' },
      });
    }

    // 2) Regulations sammeln (gesamt oder per IDs)
    const regulationFilter: Record<string, unknown> = {
      projectId: new mongoose.Types.ObjectId(projectId),
    };
    if (requestedIds.length > 0) {
      regulationFilter._id = {
        $in: requestedIds.map(id => new mongoose.Types.ObjectId(id)),
      };
    }
    const regulations = await Regulation.find(regulationFilter).select('-embedding');

    if (regulations.length === 0) {
      return res.json({
        success: true,
        data: { total: 0, mapped: 0, errors: [], note: 'no regulations found' },
      });
    }

    // 3) Sequenzielles Mapping (Concurrency-Pattern könnte später per p-limit)
    const errors: Array<{ regulationId: string; error: string }> = [];
    let totalMapped = 0;

    for (const reg of regulations) {
      try {
        const persisted = await mapRegulationToElements({
          regulation: reg,
          candidateElements,
          projectId,
        });
        totalMapped += persisted.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ regulationId: reg._id, err: msg }, '[compliance.auto] regulation failed');
        errors.push({ regulationId: reg._id?.toString() ?? '', error: msg });
      }
    }

    // 4) Audit (AC-3)
    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'compliance.mapping.auto',
        entityType: 'ComplianceMapping',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'medium',
        after: {
          regulations: regulations.length,
          candidateElements: candidateElements.length,
          mapped: totalMapped,
          errors: errors.length,
        },
      });
    }

    res.json({
      success: true,
      data: {
        total: regulations.length,
        mapped: totalMapped,
        errors,
      },
    });
  },
);

// ─── POST /api/projects/:projectId/compliance/mappings/preview ──
// Live-Mapping ohne Persist. Rate-Limit 30/Min (AC-4).
// ────────────────────────────────────────────────────────────────
const previewRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  name: 'compliance-preview',
});

router.post(
  '/:projectId/compliance/mappings/preview',
  requireProjectAccess('viewer'),
  previewRateLimit,
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = PreviewBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }

    const candidateElements = await loadProjectCandidateElements(projectId);
    if (candidateElements.length === 0) {
      return res.json({
        success: true,
        data: {
          regulation: { source: parsed.data.source, paragraphNumber: parsed.data.paragraphNumber },
          mappings: [],
          note: 'no architecture elements in project',
        },
      });
    }

    try {
      const result = await mapTextToElements({
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
          mappings: result.candidates,
        },
      });
    } catch (err) {
      if (err instanceof ComplianceMappingError) {
        log.warn({ err }, '[compliance.preview] mapping failed');
        return res.status(502).json({ success: false, error: err.message });
      }
      log.error({ err, projectId }, '[compliance.preview] unexpected failure');
      res.status(500).json({ success: false, error: 'preview failed' });
    }
  },
);

// ─── GET /api/projects/:projectId/compliance/mappings/by-element/:elementId
// Reverse-Lookup für UC-ICM-003.2 PropertyPanel.
// ────────────────────────────────────────────────────────────────
router.get(
  '/:projectId/compliance/mappings/by-element/:elementId',
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

    const mappings = await ComplianceMapping.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      elementId,
    })
      .sort({ confidence: -1 })
      .lean();

    res.json({ success: true, data: mappings });
  },
);

// ─── GET /api/projects/:projectId/compliance/mappings/by-regulation/:regulationId
// Forward-Lookup für UC-ICM-003.1 Heat-Map.
// ────────────────────────────────────────────────────────────────
router.get(
  '/:projectId/compliance/mappings/by-regulation/:regulationId',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const regulationId = String(req.params.regulationId);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(regulationId)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }

    const mappings = await ComplianceMapping.find({
      projectId: new mongoose.Types.ObjectId(projectId),
      regulationId: new mongoose.Types.ObjectId(regulationId),
    })
      .sort({ confidence: -1 })
      .lean();

    res.json({ success: true, data: mappings });
  },
);

// ─── POST /api/projects/:projectId/compliance/mappings/confirm ──
// Persistiert vom User akzeptierte Mappings (z.B. nach Live-Preview).
// Setzt status='confirmed', createdBy='human'.
// ────────────────────────────────────────────────────────────────
router.post(
  '/:projectId/compliance/mappings/confirm',
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

    const projectObjectId = new mongoose.Types.ObjectId(projectId);
    const regulationObjectId = new mongoose.Types.ObjectId(parsed.data.regulationId);

    const ops = parsed.data.mappings.map(m => ({
      updateOne: {
        filter: {
          projectId: projectObjectId,
          regulationId: regulationObjectId,
          elementId: m.elementId,
        },
        update: {
          $set: {
            projectId: projectObjectId,
            regulationId: regulationObjectId,
            elementId: m.elementId,
            elementType: m.elementType,
            confidence: m.confidence,
            reasoning: m.reasoning,
            status: 'confirmed' as const,
            createdBy: 'human' as const,
          },
        },
        upsert: true,
      },
    }));

    await ComplianceMapping.bulkWrite(ops, { ordered: false });

    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'compliance.mapping.confirm',
        entityType: 'ComplianceMapping',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'medium',
        after: {
          regulationId: parsed.data.regulationId,
          confirmedCount: parsed.data.mappings.length,
        },
      });
    }

    const persisted = await ComplianceMapping.find({
      projectId: projectObjectId,
      regulationId: regulationObjectId,
      elementId: { $in: parsed.data.mappings.map(m => m.elementId) },
    }).lean();

    res.json({ success: true, data: persisted });
  },
);

export default router;
