/**
 * Norm-Routen (UC-CANON-001 / THE-390 P2) — die quellenagnostische Norm-Sicht.
 *
 * GET  /api/projects/:projectId/norms                     — alle Normen (Upload + Korpus)
 * GET  /api/projects/:projectId/norms/:workId/mappings    — Mappings einer Norm
 * POST /api/projects/:projectId/norms/:workId/pipeline    — „Add to pipeline"-Adapter:
 *      legt den Pipeline-State für eine (Korpus-)Norm an + initialer Stats-Refresh.
 *      Ab hier läuft eine gecrawlte Regulation durch die Compliance-Pipeline.
 */
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  listNorms,
  getNorm,
  getNormMappings,
  listAvailableCorpusNorms,
} from '../services/norm.service';
import { isCorpusConfigured } from '../services/corpusClient.service';
import { refreshMappingStats } from '../services/compliance-pipeline.service';
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
