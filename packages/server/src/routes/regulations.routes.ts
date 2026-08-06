/**
 * Regulations Routes — main backend endpoints for the Industrial Compliance Mapping (ICM)
 * feature family. Triggers the Server B Crawler via Tailscale and serves stored
 * Regulation documents for the UI (Reverse-Lookup, Heat-Map).
 *
 * All routes are authenticate-protected. Mutating actions (crawl, embed-all)
 * additionally require editor access on the project and create audit entries.
 *
 * Linear: UC-ICM-001 (THE-272), closes AC-5/AC-7 of THE-276
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { Regulation } from '../models/Regulation';
import {
  triggerCrawl,
  triggerEmbedAll,
  crawlerHealth,
  crawlerConfig,
  CrawlerUnreachableError,
} from '../services/complianceCrawler.service';
import {
  corpusHealth,
  isCorpusConfigured,
  listCorpusRelationSuggestionDocs,
} from '../services/corpusClient.service';
import { corpusVectorIndexHealth } from '../services/corpusVectorSync.service';
import { getFallbackStats, isStrictCorpusReads } from '../services/regulationResolver.service';
import {
  isNormSource,
  NORM_SOURCE_IDS,
  RELATION_STATUSES,
  safeErrorMessage,
  selectRelationSuggestions,
} from '@thearchitect/shared';
import { z } from 'zod';
import { log } from '../config/logger';

const router = Router();

// ──────────────────────────────────────────────────────────
// PUBLIC: GET /api/regulations/corpus/health — canonical corpus reachability
// from Server A (THE-368). Deliberately un-authenticated (THE-453): returns only
// a reachability boolean + a count of public legal-text paragraphs, and serves as
// the keyless probe for the THE-441 corpus healthcheck. Defined ABOVE
// `router.use(authenticate)` so it is not shadowed by this router's own auth.
// ──────────────────────────────────────────────────────────
router.get('/regulations/corpus/health', async (_req: Request, res: Response) => {
  const configured = isCorpusConfigured();
  const health = configured ? await corpusHealth() : { ok: false };
  // THE-623: der Endpoint meldete am 2026-08-06 grün und 1746, während der
  // Index, den die App durchsucht, bei 1532 stand — er maß nur Mongo. Jetzt
  // misst er den lokalen Vektorindex mit. Top-Level-`ok` behält seine Bedeutung
  // (Korpus lesbar; n8n-Healthcheck + STRICT-Readiness hängen daran); die
  // Semantik-Frische steht in `vectorIndex.ok`. Warn-Log bei Drift kommt aus
  // dem Service.
  const vectorIndex = await corpusVectorIndexHealth();
  // THE-419 cutover-readiness telemetry: app-DB fallback counters since process
  // start. When both are 0 over a full traffic window, the corpus serves every
  // read and CORPUS_STRICT_READS can be flipped safely. `fallbackStats` is
  // in-memory (resets on restart) — interpret it together with `uptimeSeconds`.
  // Tamper-proof vs. log-grep: a typo can fake a "0" in a shell, not here.
  res.json({
    configured,
    health,
    ok: health.ok,
    vectorIndex,
    strictReads: isStrictCorpusReads(),
    fallbackStats: getFallbackStats(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

router.use(authenticate);

// ──────────────────────────────────────────────────────────
// GET /api/regulations/crawler/health — service-level health (not project-scoped).
// Authenticated (THE-453): crawlerConfig() exposes the internal crawler Tailnet URL.
// ──────────────────────────────────────────────────────────
router.get('/regulations/crawler/health', async (_req: Request, res: Response) => {
  const config = crawlerConfig();
  const h = await crawlerHealth();
  res.json({ config, health: h, ok: h?.status === 'ok' });
});

// ──────────────────────────────────────────────────────────
// GET /api/regulations/corpus/relations — READ-ONLY-Proxy auf die Cross-Norm-
// Kanten-Vorschläge im Korpus (THE-433, Slice 1, Task 6).
//
// Server A ist am Korpus RO-User (THE-440): dieser Endpunkt liest, und zwar
// ausschließlich. Bestätigen/Verwerfen läuft über den Crawler (Server B), der
// den Schreibzugriff hat — POST /relations/decide dort. Zeilen-Form, Filter
// und Sortierung kommen aus @thearchitect/shared, damit die Liste hier und die
// Liste im Crawler nicht auseinanderlaufen können.
//
// Degradierung statt Absturz: ist der Korpus nicht konfiguriert oder nicht
// erreichbar, antwortet der Endpunkt 503 mit klarer Meldung. Eine leere Liste
// wäre hier die gefährlichste Antwort — ein Reviewer hielte offene Vorschläge
// für abgearbeitet.
// ──────────────────────────────────────────────────────────
const CorpusRelationsQuerySchema = z.object({
  source: z.string().min(1).optional(),
  status: z.enum(RELATION_STATUSES).optional(),
  targetSource: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/regulations/corpus/relations', async (req: Request, res: Response) => {
  const parsed = CorpusRelationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ success: false, error: 'invalid_query', details: parsed.error.flatten() });
  }
  if (!isCorpusConfigured()) {
    return res.status(503).json({
      available: false,
      error:
        'corpus not configured — set CORPUS_MONGODB_URI (relation suggestions live in the canonical corpus)',
    });
  }
  const { source, status, targetSource, limit, offset } = parsed.data;
  try {
    const docs = await listCorpusRelationSuggestionDocs(source);
    const { items, total } = selectRelationSuggestions(docs, {
      status,
      targetSource,
      limit,
      offset,
    });
    return res.json({ available: true, items, total, limit, offset });
  } catch (err) {
    const message = safeErrorMessage(err);
    log.warn({ err: message }, '[the-433] corpus relations read failed — degrading to 503');
    return res.status(503).json({
      available: false,
      error: `corpus unreachable — relation suggestions cannot be read right now (${message})`,
    });
  }
});

// ──────────────────────────────────────────────────────────
// GET /api/projects/:projectId/regulations
// Query: source?, limit?, page?
// ──────────────────────────────────────────────────────────
router.get(
  '/:projectId/regulations',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const source = typeof req.query.source === 'string' ? req.query.source : undefined;
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const page = Math.max(Number(req.query.page ?? 1), 1);

    const filter: Record<string, unknown> = { projectId: new mongoose.Types.ObjectId(projectId) };
    if (source && isNormSource(source)) {
      filter.source = source;
    }

    const [items, total] = await Promise.all([
      Regulation.find(filter)
        .select('-embedding') // exclude 768-dim vector from list response (kept in DB)
        .sort({ source: 1, paragraphNumber: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Regulation.countDocuments(filter),
    ]);

    res.json({ success: true, data: { items, total, page, limit } });
  },
);

// ──────────────────────────────────────────────────────────
// GET /api/projects/:projectId/regulations/:id — single regulation incl. fullText
// ──────────────────────────────────────────────────────────
router.get(
  '/:projectId/regulations/:id',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'invalid id' });
    }

    const doc = await Regulation.findOne({
      _id: new mongoose.Types.ObjectId(id),
      projectId: new mongoose.Types.ObjectId(projectId),
    })
      .select('-embedding')
      .lean();

    if (!doc) return res.status(404).json({ success: false, error: 'regulation not found' });
    res.json({ success: true, data: doc });
  },
);

// ──────────────────────────────────────────────────────────
// POST /api/projects/:projectId/regulations
// Body: { source, paragraphNumber, title, fullText, language, jurisdiction, sourceUrl? }
// Manual create — used by UC-ICM-003.3 "Paste & See" Confirm flow.
// ──────────────────────────────────────────────────────────
router.post(
  '/:projectId/regulations',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const body = req.body ?? {};
    const source = typeof body.source === 'string' ? body.source.toLowerCase() : '';
    const paragraphNumber = typeof body.paragraphNumber === 'string' ? body.paragraphNumber : '';
    const title = typeof body.title === 'string' ? body.title : `${source.toUpperCase()} ${paragraphNumber}`.trim();
    const fullText = typeof body.fullText === 'string' ? body.fullText : '';
    const language = body.language === 'en' || body.language === 'de' ? body.language : 'de';
    const jurisdiction = typeof body.jurisdiction === 'string' && body.jurisdiction.trim()
      ? body.jurisdiction.trim()
      : (source === 'lksg' ? 'DE' : 'EU');
    const sourceUrl = typeof body.sourceUrl === 'string' && body.sourceUrl ? body.sourceUrl : 'user-pasted';

    if (!source || !isNormSource(source)) {
      return res.status(400).json({ success: false, error: `source must be one of: ${NORM_SOURCE_IDS.join(', ')}` });
    }
    if (!paragraphNumber) {
      return res.status(400).json({ success: false, error: 'paragraphNumber required' });
    }
    // Schema-validator requires >= 50 chars (Regulation.ts:56). Match it here so
    // the user gets a clear 400 instead of a silent 500 from Mongoose validation.
    if (!fullText || fullText.length < 50) {
      return res.status(400).json({ success: false, error: 'fullText required (>= 50 chars)' });
    }
    if (fullText.length > 50_000) {
      return res.status(400).json({ success: false, error: 'fullText too long (max 50000)' });
    }

    try {
      // Auto-bump version if (projectId, source, paragraphNumber) already exists.
      // The unique index is on (projectId, source, paragraphNumber, version) so
      // a fresh paste of the same paragraph creates a new version instead of
      // a silent duplicate-key 500. UC-ICM-003.3 "Paste & See" is idempotent
      // by intent — every paste = a new saved version.
      const existingMax = await Regulation.findOne({
        projectId: new mongoose.Types.ObjectId(projectId),
        source,
        paragraphNumber,
      })
        .sort({ version: -1 })
        .select('version')
        .lean();
      const nextVersion = existingMax ? (existingMax.version ?? 1) + 1 : 1;

      const created = await Regulation.create({
        projectId: new mongoose.Types.ObjectId(projectId),
        source,
        paragraphNumber,
        title,
        fullText,
        language,
        jurisdiction,
        sourceUrl,
        effectiveFrom: new Date(),
        version: nextVersion,
      });

      if (req.user) {
        await createAuditEntry({
          userId: req.user._id.toString(),
          projectId,
          action: 'regulations.create',
          entityType: 'Regulation',
          ip: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          riskLevel: 'low',
          after: { source, paragraphNumber, version: nextVersion, fullTextLength: fullText.length },
        });
      }

      res.status(201).json({ success: true, data: created.toObject() });
    } catch (err) {
      // Log the detail server-side; return a generic message — don't leak Mongoose/driver
      // internals (schema fields, validation rules) to the client (security review).
      log.error({ err, projectId }, '[regulations.create] failed');
      res.status(500).json({ success: false, error: 'create failed' });
    }
  },
);

// ──────────────────────────────────────────────────────────
// POST /api/projects/:projectId/regulations/crawl
// Body: { sources: ['nis2','lksg','dsgvo',...], skipEmbedding?: boolean }
// Proxies to Server B Crawler via Tailscale.
// ──────────────────────────────────────────────────────────
router.post(
  '/:projectId/regulations/crawl',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }

    const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
    const skipEmbedding = Boolean(req.body?.skipEmbedding ?? false);

    if (sources.length === 0) {
      return res.status(400).json({ success: false, error: 'sources array required' });
    }
    const invalid = sources.filter((s: unknown) => typeof s !== 'string' || !isNormSource(s));
    if (invalid.length > 0) {
      return res
        .status(400)
        .json({ success: false, error: `invalid sources: ${invalid.join(', ')}` });
    }

    try {
      const result = await triggerCrawl({ projectId, sources, skipEmbedding });
      const totalInserted = result.results.reduce((a, b) => a + b.inserted, 0);
      const totalUpdated = result.results.reduce((a, b) => a + b.updated, 0);
      const totalEmbedded = result.results.reduce((a, b) => a + b.embedded, 0);

      // Audit (AC-7 of THE-276)
      if (req.user) {
        await createAuditEntry({
          userId: req.user._id.toString(),
          projectId,
          action: 'regulations.crawl',
          entityType: 'Regulation',
          ip: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          riskLevel: 'medium',
          after: {
            sources,
            inserted: totalInserted,
            updated: totalUpdated,
            embedded: totalEmbedded,
            errors: result.errors.length,
            skipEmbedding,
          },
        });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof CrawlerUnreachableError) {
        log.error({ err, projectId }, '[regulations.crawl] crawler unreachable');
        return res.status(502).json({ success: false, error: err.message });
      }
      log.error({ err, projectId }, '[regulations.crawl] failed');
      res.status(500).json({ success: false, error: 'crawl failed' });
    }
  },
);

// ──────────────────────────────────────────────────────────
// POST /api/projects/:projectId/regulations/embed-all
// Body: { force?: boolean, concurrency?: number }
// ──────────────────────────────────────────────────────────
router.post(
  '/:projectId/regulations/embed-all',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    if (!mongoose.isValidObjectId(projectId)) {
      return res.status(400).json({ success: false, error: 'invalid projectId' });
    }
    const force = Boolean(req.body?.force ?? false);
    const concurrency = Number(req.body?.concurrency ?? 5);

    try {
      const result = await triggerEmbedAll({ projectId, force, concurrency });
      if (req.user) {
        await createAuditEntry({
          userId: req.user._id.toString(),
          projectId,
          action: 'regulations.embed-all',
          entityType: 'Regulation',
          ip: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
          riskLevel: 'low',
          after: { force, concurrency, embedded: result.embedded, failed: result.failed },
        });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof CrawlerUnreachableError) {
        return res.status(502).json({ success: false, error: err.message });
      }
      log.error({ err, projectId }, '[regulations.embed-all] failed');
      res.status(500).json({ success: false, error: 'embed-all failed' });
    }
  },
);

export default router;
