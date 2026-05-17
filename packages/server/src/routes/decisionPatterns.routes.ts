import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { DecisionPatternModel } from '../models/DecisionPattern';
import { PatternAdoptionModel } from '../models/PatternAdoption';

const router = Router();

const ALLOWED_CATEGORIES = [
  'integration',
  'data',
  'security',
  'observability',
  'compute',
  'messaging',
];

const ALLOWED_LIFECYCLES = [
  'approved',
  'conditional',
  'investigate',
  'retiring',
  'unapproved',
];

router.get('/', authenticate, async (req: Request, res: Response) => {
  const { category, lifecycleStatus } = req.query;
  const filter: Record<string, unknown> = {};
  if (typeof category === 'string' && ALLOWED_CATEGORIES.includes(category)) {
    filter.category = category;
  }
  if (
    typeof lifecycleStatus === 'string' &&
    ALLOWED_LIFECYCLES.includes(lifecycleStatus)
  ) {
    filter.lifecycleStatus = lifecycleStatus;
  }
  const patterns = await DecisionPatternModel.find(filter).sort({ name: 1 }).lean();
  res.json({ patterns });
});

router.get('/:slug', authenticate, async (req: Request, res: Response) => {
  const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug }).lean();
  if (!pattern) {
    return res.status(404).json({ error: 'Pattern not found' });
  }
  res.json(pattern);
});

router.post('/:slug/adopt', authenticate, async (req: Request, res: Response) => {
  const { projectId } = req.body || {};
  if (!projectId || typeof projectId !== 'string') {
    return res.status(400).json({ error: 'projectId is required' });
  }
  const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
  if (!pattern) {
    return res.status(404).json({ error: 'Pattern not found' });
  }
  if (pattern.lifecycleStatus === 'retiring' || pattern.lifecycleStatus === 'unapproved') {
    return res.status(409).json({
      error: 'Pattern not available for adoption',
      lifecycleStatus: pattern.lifecycleStatus,
    });
  }
  const adoption = await PatternAdoptionModel.create({
    patternId: pattern._id,
    projectId,
    userId: req.user!._id,
    version: pattern.version,
  });
  createAuditEntry({
    userId: String(req.user!._id),
    projectId,
    action: 'pattern_adopted',
    entityType: 'decision_pattern',
    entityId: pattern.slug,
    after: { patternSlug: pattern.slug, version: pattern.version },
    ip: req.ip,
    userAgent: req.get('user-agent') || undefined,
    riskLevel: 'low',
  }).catch((err) => {
    console.error('[decisionPatterns] audit failed:', err.message);
  });
  res.status(201).json({
    ok: true,
    adoptionId: adoption._id,
    patternSlug: pattern.slug,
    version: pattern.version,
  });
});

router.get('/:slug/stats', authenticate, async (req: Request, res: Response) => {
  const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
  if (!pattern) {
    return res.status(404).json({ error: 'Pattern not found' });
  }
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totalUses, last30Days, uniqueProjectsAgg] = await Promise.all([
    PatternAdoptionModel.countDocuments({ patternId: pattern._id }),
    PatternAdoptionModel.countDocuments({ patternId: pattern._id, timestamp: { $gte: since } }),
    PatternAdoptionModel.distinct('projectId', { patternId: pattern._id }),
  ]);
  res.json({
    totalUses,
    last30Days,
    uniqueProjects: uniqueProjectsAgg.length,
  });
});

export { router as decisionPatternsRouter };
export default router;
