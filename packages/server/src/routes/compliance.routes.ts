/**
 * Compliance Routes — REQ-ICM-002.3 (THE-280)
 *
 * Auto-Mapping + Reverse-Lookup-Endpoints für die UC-ICM-002-Pipeline:
 *   POST /api/projects/:projectId/compliance/mappings/auto       (editor)
 *   POST /api/projects/:projectId/compliance/mappings/preview    (viewer, rate-limited)
 *   GET  /api/projects/:projectId/compliance/mappings/by-element/:elementId    (viewer)
 *   GET  /api/projects/:projectId/compliance/mappings/by-regulation/:regulationId  (viewer)
 *   POST /api/projects/:projectId/compliance/mappings/confirm    (editor)
 *   GET  /api/projects/:projectId/regulations/impact             (viewer) — THE-423 Task 12, AC-5
 *   GET  /api/projects/:projectId/contexttrace/:traceId          (viewer) — THE-423 Task 13
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
import { buildRegulationKey, type RegulationLanguage } from '@thearchitect/shared';
import { Regulation } from '../models/Regulation';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { ContextTrace } from '../models/ContextTrace';
import {
  mapRegulationsBatch,
  mapTextToElements,
  ComplianceMappingError,
  type MappingRegulationInput,
} from '../services/complianceMapping.service';
import { resolveGovernedRegulations } from '../services/governedRetrieval.service';
import { loadProjectCandidateElements } from '../services/complianceElements.service';
import { findOutputsByRegulation } from '../services/contextTrace.service';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

// ─── Validators ─────────────────────────────────────────────────

const AutoMappingBodySchema = z.object({
  regulationIds: z.array(z.string()).max(100).optional(),
  concurrency: z.number().int().min(1).max(10).optional(),
  // THE-422: optional version-pin (regulationKey -> versionHash). The `z.string()`
  // value both selects the exact pinned Mongo version AND blocks NoSQL-operator
  // injection (a `{ $ne: null }` value fails validation → 400).
  pin: z.record(z.string()).optional(),
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

    // 2b) THE-422 governed gate: resolve each legacy Regulation to its governed
    // corpus version (current or pinned) by derived key, then UPGRADE the mapping
    // input to that version. Corpus-miss → legacy passthrough (measured via warn).
    // The legacy `_id` is ALWAYS threaded through: mapRegulationsBatch derives the
    // persisted ComplianceMapping.regulationId from reg._id — the upgrade swaps
    // TEXT/VERSION only, never the persistence identity.
    const derived = regulations.map(r => ({
      r,
      key: buildRegulationKey(r.source, r.paragraphNumber),
    }));
    const governed = await resolveGovernedRegulations({
      keys: derived.map(d => d.key),
      pin: parsed.data.pin,
      eligibleOnly: true,
    });
    const governedByKey = new Map(governed.map(g => [g.regulationKey, g]));
    const mappingInput: MappingRegulationInput[] = derived.map(({ r, key }) => {
      const g = governedByKey.get(key);
      if (g) {
        return {
          _id: r._id,
          source: g.source,
          paragraphNumber: g.paragraphNumber,
          title: g.title,
          fullText: g.fullText,
          language: g.language as RegulationLanguage,
          jurisdiction: g.jurisdiction,
        };
      }
      log.warn(
        { fn: 'complianceAutoMap', regulationKey: key },
        '[the-422] corpus miss — legacy Regulation used',
      );
      return {
        _id: r._id,
        source: r.source,
        paragraphNumber: r.paragraphNumber,
        title: r.title,
        fullText: r.fullText,
        language: r.language,
        jurisdiction: r.jurisdiction,
      };
    });

    // 3) Concurrent Batch-Mapping (D4 — p-limit-style, default concurrency=5)
    const batch = await mapRegulationsBatch({
      regulations: mappingInput,
      candidateElements,
      projectId,
      concurrency: parsed.data.concurrency,
    });

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
          regulations: batch.totalRegulations,
          candidateElements: candidateElements.length,
          mapped: batch.totalMapped,
          errors: batch.errors.length,
          durationMs: batch.durationMs,
          concurrency: parsed.data.concurrency ?? 5,
        },
      });
    }

    res.json({
      success: true,
      data: {
        total: batch.totalRegulations,
        mapped: batch.totalMapped,
        errors: batch.errors,
        durationMs: batch.durationMs,
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

// ─── GET /api/projects/:projectId/compliance/mappings ───────────
// Bulk-Lookup für UC-ICM-003.1 Heat-Map: alle Mappings im Projekt.
// Cap auf 1000 Einträge (BSH-Demo hat ~50, große Projekte ggf. mehr).
// ────────────────────────────────────────────────────────────────
router.get(
  '/:projectId/compliance/mappings',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const mappings = await ComplianceMapping.find({
      projectId: new mongoose.Types.ObjectId(projectId),
    })
      .sort({ confidence: -1 })
      .limit(1000)
      .lean();

    res.json({ success: true, data: mappings });
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

// ─── GET /api/projects/:projectId/regulations/impact ─────────────
// Reverse-lookup (THE-423 Task 12, AC-5 — REGDIFF/drift foundation THE-308):
// given ?regulationKey=&versionHash=, returns every output (mappings,
// requirements, findings, elements, connections) whose generating request
// consumed that exact regulation version.
// ────────────────────────────────────────────────────────────────
const RegulationImpactQuerySchema = z.object({
  regulationKey: z.string().min(1),
  versionHash: z.string().min(1),
});

router.get(
  '/:projectId/regulations/impact',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const parsed = RegulationImpactQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: 'invalid query', details: parsed.error.issues });
    }

    const impact = await findOutputsByRegulation(
      projectId,
      parsed.data.regulationKey,
      parsed.data.versionHash,
    );

    res.json({ success: true, data: impact });
  },
);

// ─── GET /api/projects/:projectId/contexttrace/:traceId ──────────
// Single-trace lookup (THE-423 Task 13): given the id a client already holds
// (e.g. a discovery finding's contextTraceId), returns the full ContextTrace
// so the UI can show which paragraphs/versions were consumed by the call
// that produced that output. A disabled-tracing run stamps outputs with an
// id that was never persisted (recordContextTrace is a best-effort no-op
// when tracing is off) — the client must tolerate a clean 404 for that case.
// ────────────────────────────────────────────────────────────────
router.get(
  '/:projectId/contexttrace/:traceId',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const traceId = String(req.params.traceId);
    const trace = await ContextTrace.findOne({ projectId, requestId: traceId }).lean();
    if (!trace) {
      return res.status(404).json({ success: false, error: 'ContextTrace not found' });
    }

    res.json({ success: true, data: trace });
  },
);

export default router;
