/**
 * Norm-Routen (UC-CANON-001 / THE-390 P2) — die quellenagnostische Norm-Sicht.
 *
 * GET  /api/projects/:projectId/norms                     — alle Normen (Upload + Korpus)
 * GET  /api/projects/:projectId/norms/applicability       — UC-LAW-001: Welche Gesetze
 *      gelten für diese Architektur? Deterministischer Signal-Check über Elemente
 *      (inkl. AI-Wizard/Blueprint-Provenienz) + Projekt-Kontext, mit Evidenz.
 * GET  /api/projects/:projectId/norms/:workId/mappings    — Mappings einer Norm
 * POST /api/projects/:projectId/norms/:workId/pipeline    — „Add to pipeline"-Adapter:
 *      legt den Pipeline-State für eine (Korpus-)Norm an + initialer Stats-Refresh.
 *      Ab hier läuft eine gecrawlte Regulation durch die Compliance-Pipeline.
 */
import { Router } from 'express';
import { z } from 'zod';
import type { DiscoveryAvailability } from '@thearchitect/shared';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import {
  listNorms,
  getNorm,
  getNormMappings,
  listAvailableCorpusNorms,
} from '../services/norm.service';
import { isCorpusConfigured } from '../services/corpusClient.service';
import { refreshMappingStats } from '../services/compliance-pipeline.service';
import { buildApplicabilityReport, loadNormWorldState } from '../services/regulationApplicability.service';
import { discoverAndJudge } from '../services/lawDiscovery.service';
import { setFindingStatus, listFindings } from '../services/lawDiscoveryFinding.service';
import { mergeApplicability } from '../services/lawApplicabilityMerge.service';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

router.get('/:projectId/norms', async (req, res) => {
  try {
    const [norms, available] = await Promise.all([
      listNorms(req.params.projectId),
      listAvailableCorpusNorms(req.params.projectId).catch(() => []),
    ]);
    // Volltexte nicht in der Liste ausliefern (Payload) — Sections ohne `text`.
    const slim = (list: typeof norms) =>
      list.map(n => ({
        ...n,
        sections: n.sections.map(({ text: _text, ...rest }) => rest),
        sectionCount: n.sections.length,
      }));
    return res.json({
      success: true,
      data: slim(norms),
      // THE-390 P4b: Korpus-Browse — Gesetze, die das Projekt noch nicht referenziert.
      available: slim(available),
      corpusConfigured: isCorpusConfigured(),
    });
  } catch (err) {
    log.error({ err, projectId: req.params.projectId }, '[norms.list] failed');
    return res.status(500).json({ success: false, error: 'failed to list norms' });
  }
});

// UC-LAW-001 — Anwendbarkeits-Radar. VOR den :workId-Routen registriert, damit
// „applicability" nie als workId interpretiert wird (statische Segmente zuerst).
//
// UC-LAW-002 Slice-2b (THE-464 AC-1 + Review-Fix 4): additiv um ein
// `discovery`-Verfügbarkeits-Feld erweitert (Muster GET /norms:
// available/corpusConfigured — Präzedenzfall). Ist das Flag an, mergt der
// Handler den Stage-A-Report zusätzlich BILLIG mit bereits persistierten,
// nicht-abgelehnten Korpus-Funden (reiner Mongo-Read, KEIN Retrieval/LLM) —
// so sieht der Nutzer bestätigte/offene Korpus-Funde bei jedem Seitenaufruf,
// ohne erneut auf „Discover" zu klicken. Trade-off (bewusst): ohne einen
// aktuellen Retrieval-Lauf wird hier kein `stale` berechnet.
router.get('/:projectId/norms/applicability', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const stageA = await buildApplicabilityReport(projectId);
    const discovery: DiscoveryAvailability = {
      enabled: process.env.LAW_DISCOVERY_ENABLED === 'true',
      corpusConfigured: isCorpusConfigured(),
      providerConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    };
    if (!discovery.enabled) {
      return res.json({ success: true, data: stageA, discovery });
    }
    const [findings, world] = await Promise.all([
      listFindings(projectId),
      loadNormWorldState(projectId),
    ]);
    const persisted = findings.filter(f => f.applies && f.status !== 'rejected');
    const merged = mergeApplicability(stageA, persisted, undefined, undefined, world);
    return res.json({ success: true, data: merged, discovery });
  } catch (err) {
    log.error({ err, projectId: req.params.projectId }, '[norms.applicability] failed');
    return res.status(500).json({ success: false, error: 'failed to assess applicability' });
  }
});

// UC-LAW-002 (THE-459/462/463) — korpusweite Discovery + LLM-Judge + Hybrid-
// Merge. Feature-flagged. Statische Segmente, daher vor den :workId-Routen
// registriert (sonst würde "discover" als workId interpretiert).
//
// Review-Fix 6: `/discover` kostet jetzt LLM-Geld (Judge-Calls), nicht mehr
// nur Retrieval — dasselbe Access-Gate wie die anderen Write-Pfade
// (compliance.routes confirm/auto: `requireProjectAccess('editor')`).
router.post('/:projectId/norms/discover', requireProjectAccess('editor'), async (req, res) => {
  if (process.env.LAW_DISCOVERY_ENABLED !== 'true') {
    return res.status(404).json({ success: false, error: 'not found' });
  }
  try {
    const projectId = String(req.params.projectId);
    const report = await discoverAndJudge(projectId);
    // Spec-Fix 2: der Lauf kostet LLM-Geld und persistiert Findings — Audit-
    // Eintrag wie bei confirm/reject (CLAUDE.md: security-sensitive → audit).
    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'law.discovery.run',
        entityType: 'LawDiscoveryFinding',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'medium',
        after: { coverage: report.coverage ?? null },
      });
    }
    return res.json({ success: true, data: report });
  } catch (err) {
    log.error({ err, projectId: req.params.projectId }, '[norms.discover] failed');
    return res.status(500).json({ success: false, error: 'failed to discover regulations' });
  }
});

const DiscoverLifecycleBodySchema = z.object({
  family: z.string().min(1),
  corpusVersionHash: z.string().min(1),
});

// UC-LAW-002 Slice-2 (THE-463) — menschliche Entscheidung über einen
// Korpus-Befund. Muster compliance.routes.ts confirm-Route (Body-Zod,
// requireProjectAccess('editor'), createAuditEntry).
router.post('/:projectId/norms/discover/confirm', requireProjectAccess('editor'), async (req, res) => {
  if (process.env.LAW_DISCOVERY_ENABLED !== 'true') {
    return res.status(404).json({ success: false, error: 'not found' });
  }
  const parsed = DiscoverLifecycleBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.issues });
  }
  try {
    const projectId = String(req.params.projectId);
    const updated = await setFindingStatus(projectId, parsed.data.family, parsed.data.corpusVersionHash, 'confirmed');
    if (!updated) {
      return res.status(404).json({ success: false, error: 'finding not found' });
    }
    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'law.discovery.confirm',
        entityType: 'LawDiscoveryFinding',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'medium',
        after: { family: parsed.data.family, corpusVersionHash: parsed.data.corpusVersionHash, status: 'confirmed' },
      });
    }
    return res.json({ success: true, data: { family: parsed.data.family, status: 'confirmed' } });
  } catch (err) {
    log.error({ err, projectId: req.params.projectId }, '[norms.discover.confirm] failed');
    return res.status(500).json({ success: false, error: 'failed to confirm finding' });
  }
});

router.post('/:projectId/norms/discover/reject', requireProjectAccess('editor'), async (req, res) => {
  if (process.env.LAW_DISCOVERY_ENABLED !== 'true') {
    return res.status(404).json({ success: false, error: 'not found' });
  }
  const parsed = DiscoverLifecycleBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'invalid body', details: parsed.error.issues });
  }
  try {
    const projectId = String(req.params.projectId);
    const updated = await setFindingStatus(projectId, parsed.data.family, parsed.data.corpusVersionHash, 'rejected');
    if (!updated) {
      return res.status(404).json({ success: false, error: 'finding not found' });
    }
    if (req.user) {
      await createAuditEntry({
        userId: req.user._id.toString(),
        projectId,
        action: 'law.discovery.reject',
        entityType: 'LawDiscoveryFinding',
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
        riskLevel: 'medium',
        after: { family: parsed.data.family, corpusVersionHash: parsed.data.corpusVersionHash, status: 'rejected' },
      });
    }
    return res.json({ success: true, data: { family: parsed.data.family, status: 'rejected' } });
  } catch (err) {
    log.error({ err, projectId: req.params.projectId }, '[norms.discover.reject] failed');
    return res.status(500).json({ success: false, error: 'failed to reject finding' });
  }
});

// UC-LAW-002 Slice-2b (THE-464 AC-3) — read-only Liste ALLER Korpus-Funde
// (inkl. rejected) fürs „show rejected"-Toggle im Panel. VOR :workId
// registriert (statische Segmente zuerst); `authenticate` genügt, kein
// editor-Gate — reiner Read.
router.get('/:projectId/norms/discover/findings', async (req, res) => {
  if (process.env.LAW_DISCOVERY_ENABLED !== 'true') {
    return res.status(404).json({ success: false, error: 'not found' });
  }
  try {
    const data = await listFindings(String(req.params.projectId));
    return res.json({ success: true, data });
  } catch (err) {
    log.error({ err, projectId: req.params.projectId }, '[norms.discover.findings] failed');
    return res.status(500).json({ success: false, error: 'failed to list discovery findings' });
  }
});

router.get('/:projectId/norms/:workId/mappings', async (req, res) => {
  try {
    const mappings = await getNormMappings(req.params.projectId, req.params.workId);
    return res.json({ success: true, data: mappings });
  } catch (err) {
    log.error({ err, workId: req.params.workId }, '[norms.mappings] failed');
    return res.status(500).json({ success: false, error: 'failed to load norm mappings' });
  }
});

router.post('/:projectId/norms/:workId/pipeline', async (req, res) => {
  const { projectId, workId } = req.params;
  try {
    const norm = await getNorm(projectId, workId);
    if (!norm) {
      return res.status(404).json({ success: false, error: 'norm not found' });
    }
    const state = await refreshMappingStats(projectId, workId);
    log.info({ projectId, workId }, '[norms.pipeline] norm added to pipeline');
    return res.status(201).json({ success: true, data: state });
  } catch (err) {
    log.error({ err, projectId, workId }, '[norms.pipeline] failed');
    return res.status(500).json({ success: false, error: 'failed to add norm to pipeline' });
  }
});

export default router;
