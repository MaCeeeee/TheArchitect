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
import { emptyGates, deriveCovered, applyHumanGate } from '../services/requirementGates.service';
import { Evidence } from '../models/Evidence';
import { buildAuditBundle, renderAuditBundlePdf, type AuditBundleRequirementInput } from '../services/auditBundle.service';
import { Project } from '../models/Project';
import { isFreshEvidence } from '../services/evidence.service';
import { Regulation } from '../models/Regulation';
import { chainPreview, persistChainItem } from '../services/chainGenerate.service';
import {
  proposeSharedMeasures,
  confirmSharedMeasure,
  previewCandidatePairs,
  DEFAULT_MAX_JUDGED_PAIRS,
  MAX_ALLOWED_JUDGED_PAIRS,
  HarmonizationError,
} from '../services/harmonization.service';
import { forwardTrace, backwardTrace } from '../services/traceability.service';
import { chainDriftCheck } from '../services/chainDrift.service';
import { violatesImplementationFreedom } from '@thearchitect/shared';
import {
  generateRequirementsFromText,
  RequirementGeneratorError,
} from '../services/requirementGenerator.service';
import { loadProjectCandidateElements } from '../services/complianceElements.service';
import { projectRequirementsToModel } from '../services/requirementProjection.service';
import { computeComplianceGaps } from '../services/compliance-gaps.service';
import { getPipelineNorm, derivePipelineAnchorId } from '../services/norm.service';
import {
  resolveGovernedRegulations,
  tracedResolveGovernedRegulations,
} from '../services/governedRetrieval.service';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

// ─── Validators ─────────────────────────────────────────────────

const GenerateBodySchema = z.object({
  // THE-390 P3: text ist optional, wenn eine Norm-Section referenziert wird —
  // der Server löst den Section-Text dann selbst über die Norm-Facade auf.
  text: z.string().min(20).max(12_000).optional(),
  source: z.string().min(1).max(50).default('custom'),
  paragraphNumber: z.string().min(1).max(100).default('preview'),
  language: z.enum(['de', 'en']).default('de'),
  jurisdiction: z.string().min(1).max(50).default('EU'),
  // ADR-0008 Phase 1: Engine-Weiche. Ohne Angabe entscheidet REQUIREMENTS_ENGINE
  // (default 'chain'); 'reqgen' ist der Feature-Flag-Rollback.
  engine: z.enum(['chain', 'reqgen']).optional(),
  regulationId: z.string().optional(),  // wenn vorhanden: persist sofort
  // THE-390 P3: kanonische Norm-Referenz (`corpus:<source>` | `upload:<standardId>`).
  normId: z.string().optional(),
  sectionEId: z.string().optional(),
  // THE-422: optional version-pin for corpus norms (regulationKey -> versionHash).
  // The `z.string()` value blocks NoSQL-operator injection (a `{ $ne: null }` → 400).
  pin: z.record(z.string()).optional(),
  // if regulationId provided + persist=true → service called with persist mode
  persist: z.boolean().default(false),
});

const ConfirmBodySchema = z.object({
  // Entweder legacy regulationId ODER kanonischer normId (THE-390 P3).
  regulationId: z.string().optional(),
  normId: z.string().optional(),
  sectionEId: z.string().optional(),
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
        // ADR-0008 Phase 1: Ketten-Material aus dem Preview. Optional — Items
        // ohne `chain` laufen exakt wie bisher.
        chain: z
          .object({
            regulationKey: z.string().min(1).max(200),
            clauseContentId: z.string().regex(/^[0-9a-f]{16}$/),
            clausePath: z.string().max(200).optional(),
            clauseText: z.string().min(1).max(10_000),
            stakeholderRequirement: z.object({
              text: z.string().min(5).max(2000),
              slots: z.object({
                action: z.string().max(500),
                recipient: z.string().max(500),
                modality: z.string().max(100),
                condition: z.string().max(500),
              }),
              kind: z.enum(['requirement', 'constraint']),
              deadline: z
                .object({
                  dauer: z.object({ wert: z.number(), einheit: z.enum(['h', 'd', 'mon']) }),
                  bezugspunkt: z.enum(['kenntnis', 'einstufung', 'vorherige-meldung', 'ereignis']),
                  stufe: z.enum(['erst', 'zwischen', 'abschluss']).nullable(),
                  quelle: z.string().max(1000),
                })
                .nullable(),
            }),
            systemRequirement: z.object({
              text: z.string().min(5).max(2000),
              schutzgut: z.string().max(500),
              verpflichteter: z.string().max(500),
              ausloeser: z.string().max(500),
              nachweis: z.string().max(500),
              implementationFree: z.boolean(),
            }),
          })
          .optional(),
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

// ─── THE-565: Bidirektionale Traceability (rein lesend) ──────────────────
// Vorwaerts: Norm -> Klauseln -> Stand. Rueckwaerts: Element -> Anforderungen
// samt Frist/Rechtsgrundlage + Ausmustern-Impact. Die THE-305-Route
// /by-element bleibt byte-gleich — dies sind NEUE, reichere Sichten.
router.get(
  '/:projectId/requirements/trace/forward',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    res.json({ success: true, data: await forwardTrace(projectId) });
  },
);

router.get(
  '/:projectId/requirements/trace/by-element/:elementId',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const elementId = String(req.params.elementId);
    if (!elementId) return res.status(400).json({ success: false, error: 'elementId required' });
    res.json({ success: true, data: await backwardTrace(projectId, elementId) });
  },
);

// EXPLIZITER Klausel-Drift-Pass (THE-565 AC 3): Re-Segmentierung + contentId-
// Diff — nur verschwundene Klauseln stalen (THE-550 als Produktverhalten).
// Cron-Anschluss ist benannte Folgearbeit.
router.post(
  '/:projectId/requirements/trace/drift-check',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    try {
      const report = await chainDriftCheck(projectId);
      if (req.user) {
        await createAuditEntry({
          userId: req.user._id.toString(),
          projectId,
          action: 'requirements.trace.drift-check',
          entityType: 'ComplianceRequirement',
          ip: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          riskLevel: 'medium',
          after: { ...report },
        });
      }
      res.json({ success: true, data: report });
    } catch (err) {
      log.error({ err, projectId }, '[requirements.trace] drift-check failed');
      res.status(500).json({ success: false, error: 'drift check failed' });
    }
  },
);

// ─── ADR-0008 / THE-569: Harmonisierungs-Vorschlag ───────────────────────
// NUR explizit (POST + Rate-Limit): der Judge kostet. Die Kosten stehen in
// der Antwort (pairsJudged/cappedPairs), nie im Log. Verdraengte Paare
// erreichen den Richter nie und kommen als eigener Fall mit Zitat zurueck.
const harmonizeRateLimit = rateLimit({
  windowMs: 60_000,
  max: 5,
  name: 'requirements-harmonize',
});

const ProposeBodySchema = z.object({
  maxJudgedPairs: z.number().int().min(0).max(MAX_ALLOWED_JUDGED_PAIRS).optional(),
});

// THE-590: Was der Lauf kosten WUERDE — vor dem Lauf, ohne ihn zu bezahlen.
//
// GET, weil es ein Lesezugriff ist: kein Richter, kein Klassifikator, kein
// Schreibzugriff. Deshalb auch kein Rate-Limit und `viewer` statt `editor` —
// die Zahl zu kennen, bevor man den teuren Lauf ausloest, darf nicht teurer
// sein als der Lauf selbst.
const CandidatesQuerySchema = z.object({
  cap: z.coerce.number().int().min(0).max(MAX_ALLOWED_JUDGED_PAIRS).optional(),
});

router.get(
  '/:projectId/requirements/harmonization/candidates',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const parsed = CandidatesQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid query', details: parsed.error.issues });
    }
    try {
      const preview = await previewCandidatePairs(projectId, {
        cap: parsed.data.cap ?? DEFAULT_MAX_JUDGED_PAIRS,
      });
      res.json({ success: true, data: preview });
    } catch (err) {
      log.error({ err, projectId }, '[requirements.harmonization] candidate preview failed');
      res.status(500).json({ success: false, error: 'candidate preview failed' });
    }
  },
);

router.post(
  '/:projectId/requirements/harmonization/propose',
  requireProjectAccess('editor'),
  harmonizeRateLimit,
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const parsed = ProposeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    try {
      const { makeHarmonizationAsk } = await import('../services/harmonizationAsk');
      const ask = makeHarmonizationAsk();
      const result = await proposeSharedMeasures(projectId, {
        ask,
        judge: ask,
        maxJudgedPairs: parsed.data.maxJudgedPairs ?? DEFAULT_MAX_JUDGED_PAIRS,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      log.error({ err, projectId }, '[requirements.harmonization] propose failed');
      res.status(502).json({ success: false, error: 'harmonization proposal failed' });
    }
  },
);

const ConfirmSharedSchema = z.object({
  systemRequirementIds: z.array(z.string().min(1)).min(2),
  elementId: z.string().min(1).max(200),
});

router.post(
  '/:projectId/requirements/harmonization/confirm',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const parsed = ConfirmSharedSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    try {
      const result = await confirmSharedMeasure({
        projectId,
        systemRequirementIds: parsed.data.systemRequirementIds,
        elementId: parsed.data.elementId,
      });
      if (req.user) {
        await createAuditEntry({
          userId: req.user._id.toString(),
          projectId,
          action: 'requirements.harmonization.confirm',
          entityType: 'ComplianceRequirement',
          ip: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          riskLevel: 'high',
          after: { elementId: parsed.data.elementId, members: parsed.data.systemRequirementIds, linked: result.linkedRequirements },
        });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof HarmonizationError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      log.error({ err, projectId }, '[requirements.harmonization] confirm failed');
      res.status(500).json({ success: false, error: 'confirm failed' });
    }
  },
);

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

    // THE-390 P3: Norm-Section serverseitig auflösen, wenn kein Text mitkommt.
    let text = parsed.data.text;
    let source = parsed.data.source;
    let paragraphNumber = parsed.data.paragraphNumber;
    if (!text && parsed.data.normId && parsed.data.sectionEId) {
      const norm = await getPipelineNorm(projectId, parsed.data.normId);
      const section = norm?.sections.find(s => s.id === parsed.data.sectionEId);
      if (!norm || !section || section.content.trim().length < 20) {
        return res
          .status(404)
          .json({ success: false, error: 'norm section not found or has no text' });
      }
      // THE-422 read-side gate: only CORPUS norms carry a version — for those the
      // section `id` IS the `regulationKey` (norm.service regulationsToNormView).
      // Resolve it through the gate (current or pinned); an empty result means the
      // version is stale / the pin vanished → 409. UPLOAD norms have no version and
      // pass through untouched — 409-ing them would regress document-upload
      // generation (AC-5).
      if (norm.source === 'corpus') {
        const governed = await resolveGovernedRegulations({
          keys: [section.id],
          pin: parsed.data.pin,
          eligibleOnly: true,
        });
        if (governed.length === 0) {
          return res.status(409).json({
            success: false,
            error: 'norm section version is stale — re-sync or pin an available version',
          });
        }
      }
      text = section.content.slice(0, 12_000);
      source = norm.name;
      paragraphNumber = section.number || section.title;
    }
    if (!text) {
      return res
        .status(400)
        .json({ success: false, error: 'text or (normId + sectionEId) required' });
    }

    // ── ADR-0008 Phase 1: Engine-Weiche ──────────────────────────────
    // 'chain' ist der Default; REQUIREMENTS_ENGINE=reqgen (oder body.engine)
    // ist der Rollback. Der Alt-Pfad darunter bleibt unveraendert.
    const engine =
      parsed.data.engine ?? (process.env.REQUIREMENTS_ENGINE === 'reqgen' ? 'reqgen' : 'chain');
    if (engine === 'chain') {
      // regulationKey: fuer Corpus-Normen IST die Section-Id der Key (siehe
      // oben); sonst mechanischer Slug aus source+paragraph.
      const regulationKey =
        parsed.data.sectionEId ??
        `${source}:${paragraphNumber}`.toLowerCase().replace(/\s+/g, '-');
      try {
        const result = await chainPreview({ text, source, paragraphNumber, regulationKey });
        return res.json({
          success: true,
          data: {
            engine: 'chain',
            regulation: {
              source,
              paragraphNumber,
              language: parsed.data.language,
              normId: parsed.data.normId,
              sectionEId: parsed.data.sectionEId,
            },
            requirements: result.candidates,
            // Die Quoten sind Teil der Antwort, nicht des Logs (THE-561 AC 1+2).
            chainStats: result.stats,
          },
        });
      } catch (err) {
        log.error({ err, projectId }, '[requirements.generate] chain engine failed');
        return res.status(502).json({ success: false, error: 'chain generation failed' });
      }
    }

    const candidateElements = await loadProjectCandidateElements(projectId).catch(() => []);

    try {
      const result = await generateRequirementsFromText({
        text,
        source,
        paragraphNumber,
        language: parsed.data.language,
        jurisdiction: parsed.data.jurisdiction,
        candidateElements,
      });
      res.json({
        success: true,
        data: {
          regulation: {
            source,
            paragraphNumber,
            language: parsed.data.language,
            normId: parsed.data.normId,
            sectionEId: parsed.data.sectionEId,
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
    const { regulationId, normId } = parsed.data;
    if (!regulationId && !normId) {
      return res
        .status(400)
        .json({ success: false, error: 'regulationId or normId required' });
    }

    const projectObjectId = new mongoose.Types.ObjectId(projectId);
    let regulationObjectId: mongoose.Types.ObjectId;
    let normSourceIsCorpus = false;

    if (regulationId) {
      if (!mongoose.isValidObjectId(regulationId)) {
        return res.status(400).json({ success: false, error: 'invalid regulationId' });
      }
      // Verify regulation exists + belongs to project
      const reg = await Regulation.findOne({
        _id: new mongoose.Types.ObjectId(regulationId),
        projectId: projectObjectId,
      });
      if (!reg) {
        return res.status(404).json({ success: false, error: 'regulation not found' });
      }
      regulationObjectId = new mongoose.Types.ObjectId(regulationId);
    } else {
      // THE-390 P3: Norm-basiert — Existenz über die Facade prüfen; der
      // deterministische Anchor hält den Idempotenz-Index norm-scoped intakt.
      const norm = await getPipelineNorm(projectId, normId!);
      if (!norm) {
        return res.status(404).json({ success: false, error: 'norm not found' });
      }
      regulationObjectId = derivePipelineAnchorId(normId!);
      normSourceIsCorpus = norm.source === 'corpus';
    }

    // THE-423 (Task 7, DD-1 Option A — mint at CONFIRM): join sectionEId → the
    // corpus's CURRENT versionHash via the traced wrapper. For CORPUS norms the
    // section id IS the regulationKey (see the GENERATE handler above); for
    // legacy regulationId / upload norms there is no corpus concept, so `keys`
    // is empty and the trace still records (consumed:[]) — best-effort, additive.
    // No AiTrace exists anywhere in the reqgen flow (DD-5) → llmTraceRef stays unset.
    const traceKeys =
      normSourceIsCorpus && parsed.data.sectionEId ? [parsed.data.sectionEId] : [];
    const { contextTraceId } = await tracedResolveGovernedRegulations({
      keys: traceKeys,
      feature: 'reqgen',
      projectId,
    });

    // ── ADR-0008 Phase 1: Ketten-Items ──────────────────────────────
    // Serverseitiges Gate (nie dem Client trauen): eine implementierungs-
    // gebundene Beschreibung wird abgelehnt, nicht gespeichert (THE-562 AC 1).
    for (const [i, r] of parsed.data.requirements.entries()) {
      if (r.chain && violatesImplementationFreedom(r.description)) {
        return res.status(400).json({
          success: false,
          error: `requirement ${i} is implementation-bound — a system requirement names a capability, not a product`,
        });
      }
    }
    // Kette persistieren (StR -> SysReq) und Refs je Titel merken. Grenze
    // (dokumentiert): ein Re-Confirm desselben Titels erzeugt eine NEUE
    // Ketten-Ableitung; die alte bleibt als auffindbare Waise liegen
    // (WORM-Geist — Ableitungen werden nicht umgeschrieben).
    const chainRefsByTitle = new Map<string, Awaited<ReturnType<typeof persistChainItem>>>();
    for (const r of parsed.data.requirements) {
      if (r.chain) {
        chainRefsByTitle.set(r.title, await persistChainItem(projectObjectId, r.chain));
      }
    }

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
            ...(normId ? { normId } : {}),
            ...(parsed.data.sectionEId ? { sectionEId: parsed.data.sectionEId } : {}),
            contextTraceId,
            sourceParagraph: parsed.data.sourceParagraph,
            title: r.title,
            description: r.description,
            priority: r.priority,
            linkedElementIds: r.linkedElementIds,
            status: 'open' as const,
            createdBy: 'human' as const,
            // THE-557: Deckung mechanisch bei der Anlage — Mensch-Tore bleiben unknown.
            gates: { ...emptyGates(), covered: deriveCovered(r.linkedElementIds) },
            // Preserve LLM explainability through human curation (optional, audit trail)
            ...(r.extractionConfidence !== undefined && { extractionConfidence: r.extractionConfidence }),
            ...(r.extractionRationale !== undefined && { extractionRationale: r.extractionRationale }),
            ...(r.mappingConfidence !== undefined && { mappingConfidence: r.mappingConfidence }),
            ...(r.mappingRationale !== undefined && { mappingRationale: r.mappingRationale }),
            // ADR-0008 Phase 1: Rueckverweise der Kette — nur wenn das Item
            // aus der Chain-Engine stammt; Alt-Items bleiben byte-gleich.
            ...(chainRefsByTitle.has(r.title) && { chain: chainRefsByTitle.get(r.title) }),
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
          regulationId: parsed.data.regulationId ?? String(regulationObjectId),
          ...(normId ? { normId } : {}),
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

// THE-559: Prüfer-Bündel — Export je Norm (PDF/JSON), auditiert. Das Bündel
// behauptet nur, was die Tore hergeben; Ehrlichkeits-Labels und stale-Marker
// entstehen im reinen Builder (auditBundle.service.ts).
router.get(
  '/:projectId/requirements/audit-bundle',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const format = req.query.format === 'pdf' ? 'pdf' : 'json';
    const regulationId = typeof req.query.regulationId === 'string' ? req.query.regulationId : undefined;
    if (regulationId && !mongoose.isValidObjectId(regulationId)) {
      return res.status(400).json({ success: false, error: 'invalid regulationId' });
    }

    const filter: Record<string, unknown> = { projectId: new mongoose.Types.ObjectId(projectId) };
    if (regulationId) filter.regulationId = new mongoose.Types.ObjectId(regulationId);
    const [project, requirements] = await Promise.all([
      Project.findById(projectId).select('name').lean(),
      ComplianceRequirement.find(filter).lean(),
    ]);
    if (!project) return res.status(404).json({ success: false, error: 'project not found' });

    const reqIds = requirements.map((r) => r._id);
    const [evidences, regulations] = await Promise.all([
      Evidence.find({ requirementId: { $in: reqIds } }).sort({ collectedAt: -1 }).lean(),
      Regulation.find({ _id: { $in: [...new Set(requirements.map((r) => String(r.regulationId)))] } })
        .select('title paragraphNumber source')
        .lean(),
    ]);
    const evidenceByReq = new Map<string, typeof evidences>();
    for (const e of evidences) {
      const k = String(e.requirementId);
      evidenceByReq.set(k, [...(evidenceByReq.get(k) ?? []), e]);
    }
    const regLabel = new Map(
      regulations.map((r) => [String(r._id), `${r.source ?? ''} ${r.paragraphNumber ?? ''} — ${r.title}`.trim()]),
    );

    // Je Norm eine Sektion — ungeordnete Requirements landen unter ihrer Norm.
    const byNorm = new Map<string, AuditBundleRequirementInput[]>();
    for (const r of requirements) {
      const label = regLabel.get(String(r.regulationId)) ?? `Regulation ${String(r.regulationId)}`;
      const list = byNorm.get(label) ?? [];
      list.push({
        id: String(r._id),
        title: r.title,
        priority: r.priority,
        status: r.status,
        gates: r.gates,
        evidence: (evidenceByReq.get(String(r._id)) ?? []).map((e) => ({
          id: String(e._id),
          kind: e.kind,
          ref: e.ref,
          sha256: e.sha256,
          collectedAt: e.collectedAt instanceof Date ? e.collectedAt.toISOString() : String(e.collectedAt),
          ...(e.regulationVersionHash ? { regulationVersionHash: e.regulationVersionHash } : {}),
          ...(e.stale ? { stale: true } : {}),
          ...(e.supersedes ? { supersedes: String(e.supersedes) } : {}),
        })),
      });
      byNorm.set(label, list);
    }

    const bundle = buildAuditBundle({
      projectName: project.name,
      generatedAt: new Date().toISOString(),
      norms: [...byNorm.entries()].map(([label, reqs]) => ({ label, requirements: reqs })),
    });

    if (req.user) {
      await createAuditEntry({
        userId: String(req.user._id),
        projectId,
        action: 'requirements.audit-bundle.export',
        entityType: 'ComplianceRequirement',
        after: { format, norms: bundle.norms.length, requirements: requirements.length },
        ip: req.ip || '',
        userAgent: req.get('user-agent') || '',
      });
    }

    if (format === 'pdf') {
      const pdf = await renderAuditBundlePdf(bundle);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="audit-bundle-${projectId}.pdf"`);
      return res.send(pdf);
    }
    return res.json({ success: true, data: bundle });
  },
);

// THE-558: Nachweise — append-only Verweise mit Hash und Textstand.
// `collectedBy` kommt aus der Session; das Zod-Schema kennt das Feld nicht.
const EvidenceBodySchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i, 'sha256 must be 64 hex characters'),
  collectedAt: z.string().datetime().optional(),
  regulationKey: z.string().min(1).optional(),
  regulationVersionHash: z.string().min(1).optional(),
  supersedes: z.string().optional(),
});

router.post(
  '/:projectId/requirements/:id/evidence',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }
    const parsed = EvidenceBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    if (parsed.data.supersedes && !mongoose.isValidObjectId(parsed.data.supersedes)) {
      return res.status(400).json({ success: false, error: 'invalid supersedes id' });
    }
    const requirement = await ComplianceRequirement.findOne({ _id: id, projectId }).select('_id');
    if (!requirement) return res.status(404).json({ success: false, error: 'requirement not found' });

    try {
      const doc = await Evidence.create({
        projectId,
        requirementId: id,
        kind: parsed.data.kind,
        ref: parsed.data.ref,
        sha256: parsed.data.sha256.toLowerCase(),
        collectedAt: parsed.data.collectedAt ? new Date(parsed.data.collectedAt) : new Date(),
        collectedBy: String(req.user!._id),
        ...(parsed.data.regulationKey ? { regulationKey: parsed.data.regulationKey } : {}),
        ...(parsed.data.regulationVersionHash ? { regulationVersionHash: parsed.data.regulationVersionHash } : {}),
        ...(parsed.data.supersedes ? { supersedes: parsed.data.supersedes } : {}),
      });
      await createAuditEntry({
        userId: String(req.user!._id),
        projectId,
        action: 'requirement.evidence.add',
        entityType: 'Evidence',
        entityId: String(doc._id),
        after: { requirementId: id, kind: parsed.data.kind, sha256: parsed.data.sha256.toLowerCase() },
        ip: req.ip || '',
        userAgent: req.get('user-agent') || '',
      });
      return res.status(201).json({ success: true, data: doc });
    } catch (err) {
      // Schema-Validatoren (Credential-Guard, sha256) landen hier — mit Grund.
      return res.status(400).json({ success: false, error: (err as Error).message });
    }
  },
);

router.get(
  '/:projectId/requirements/:id/evidence',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }
    const items = await Evidence.find({ projectId, requirementId: id }).sort({ collectedAt: -1 }).lean();
    return res.json({ success: true, data: items, fresh: items.filter((e) => isFreshEvidence(e)).length });
  },
);

// THE-557: Notar-Akt — enforced/attested setzt NUR ein Mensch. `setBy` kommt
// server-seitig aus der Session (Spoof-Schutz wie certification.routes.ts);
// ein `setBy` im Body wird ignoriert, weil das Schema es gar nicht kennt.
const GateBodySchema = z.object({
  gate: z.enum(['enforced', 'attested']),
  state: z.enum(['yes', 'no']),
  reason: z.string().min(1),
});

router.post(
  '/:projectId/requirements/:id/gates',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }
    const parsed = GateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.issues });
    }
    const doc = await ComplianceRequirement.findOne({ _id: id, projectId });
    if (!doc) return res.status(404).json({ success: false, error: 'requirement not found' });

    const userId = String(req.user!._id);

    // THE-558: das Nachweis-Tor braucht einen Nachweis. Mindestens eine
    // NICHT-stale Evidenz — eine stale zaehlt nicht, auch wenn sie die
    // einzige ist ("ein Protokoll von 2023 belegt 2026 nichts mehr").
    if (parsed.data.gate === 'attested' && parsed.data.state === 'yes') {
      const fresh = await Evidence.countDocuments({ requirementId: id, stale: { $ne: true } });
      if (fresh === 0) {
        return res.status(400).json({
          success: false,
          error: 'attested requires at least one fresh (non-stale) evidence record — add evidence first (THE-558)',
        });
      }
    }

    try {
      // covered wird beim ersten Notar-Akt mitabgeleitet, falls nie bewertet —
      // so entsteht kein Tripel, dessen Maschinen-Tor grundlos unknown bleibt.
      const current = doc.gates ?? { ...emptyGates(), covered: deriveCovered(doc.linkedElementIds ?? []) };
      doc.gates = applyHumanGate(current, parsed.data.gate, parsed.data.state, userId, parsed.data.reason);
    } catch (err) {
      return res.status(400).json({ success: false, error: (err as Error).message });
    }
    await doc.save();

    await createAuditEntry({
      userId,
      projectId,
      action: `requirement.gate.${parsed.data.gate}`,
      entityType: 'ComplianceRequirement',
      entityId: id,
      after: { gate: parsed.data.gate, state: parsed.data.state, reason: parsed.data.reason },
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });
    return res.json({ success: true, data: doc });
  },
);

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
      // THE-557: Deckung folgt der Verknüpfung — mechanisch, mit Grund.
      setFields['gates.covered'] = deriveCovered(parsed.data.linkedElementIds);
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
