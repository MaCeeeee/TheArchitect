import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { DecisionPatternModel } from '../models/DecisionPattern';
import { PatternAdoptionModel } from '../models/PatternAdoption';
import { PatternEndorsementModel } from '../models/PatternEndorsement';
import {
  computeBadges,
  computeMedian,
  computeTop10PercentThreshold,
} from '../services/patternBadge.service';

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

const ENDORSE_ROLES = [
  'chief_architect',
  'enterprise_architect',
  'solution_architect',
  'data_architect',
  'business_architect',
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

router.get('/stats-all', authenticate, async (req: Request, res: Response) => {
  const { category } = req.query;
  const filter: Record<string, unknown> = {};
  if (typeof category === 'string' && ALLOWED_CATEGORIES.includes(category)) {
    filter.category = category;
  }
  const patterns = await DecisionPatternModel.find(filter).sort({ name: 1 }).lean();
  if (patterns.length === 0) {
    return res.json({ patterns: [] });
  }

  const patternIds = patterns.map((p) => p._id);
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const myUserId = req.user!._id;

  const [totalAgg, last30Agg, projectsAgg, endorsementAgg] = await Promise.all([
    PatternAdoptionModel.aggregate([
      { $match: { patternId: { $in: patternIds } } },
      { $group: { _id: '$patternId', count: { $sum: 1 } } },
    ]),
    PatternAdoptionModel.aggregate([
      { $match: { patternId: { $in: patternIds }, timestamp: { $gte: since } } },
      { $group: { _id: '$patternId', count: { $sum: 1 } } },
    ]),
    PatternAdoptionModel.aggregate([
      { $match: { patternId: { $in: patternIds } } },
      { $group: { _id: { patternId: '$patternId', projectId: '$projectId' } } },
      { $group: { _id: '$_id.patternId', count: { $sum: 1 } } },
    ]),
    PatternEndorsementModel.aggregate([
      { $match: { patternId: { $in: patternIds } } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$patternId',
          count: { $sum: 1 },
          entries: {
            $push: {
              userId: '$userId',
              reason: '$reason',
              timestamp: '$timestamp',
            },
          },
        },
      },
    ]),
  ]);

  const toKey = (id: unknown) => String(id);
  const totalMap = new Map<string, number>(totalAgg.map((d) => [toKey(d._id), d.count]));
  const last30Map = new Map<string, number>(last30Agg.map((d) => [toKey(d._id), d.count]));
  const projectsMap = new Map<string, number>(
    projectsAgg.map((d) => [toKey(d._id), d.count])
  );
  const endorseMap = new Map<
    string,
    { count: number; entries: { userId: string; reason: string; timestamp: Date }[] }
  >(
    endorsementAgg.map((d) => [
      toKey(d._id),
      { count: d.count, entries: d.entries || [] },
    ])
  );

  const allTotals = Array.from(totalMap.values());
  const allLast30 = Array.from(last30Map.values());
  const totalUsesThreshold = computeTop10PercentThreshold(allTotals);
  const medianLast30 = computeMedian(allLast30);
  const now = new Date();

  const slugByObjectId = new Map(patterns.map((p) => [toKey(p._id), p.slug]));
  const nameByObjectId = new Map(patterns.map((p) => [toKey(p._id), p.name]));

  const enriched = patterns.map((p) => {
    const pid = toKey(p._id);
    const totalUses = totalMap.get(pid) ?? 0;
    const last30Days = last30Map.get(pid) ?? 0;
    const uniqueProjects = projectsMap.get(pid) ?? 0;
    const endorsement = endorseMap.get(pid);
    const endorsementCount = endorsement?.count ?? 0;
    const myEndorsement = endorsement?.entries.some(
      (e) => toKey(e.userId) === toKey(myUserId)
    ) ?? false;
    const badges = computeBadges({
      totalUses,
      last30Days,
      endorsementCount,
      createdAt: p.createdAt,
      medianLast30DaysAcrossAllPatterns: medianLast30,
      totalUsesThreshold,
      now,
    });
    const topReasons = (endorsement?.entries ?? [])
      .slice(0, 3)
      .map((e) => ({
        userId: toKey(e.userId),
        reason: e.reason,
        timestamp:
          e.timestamp instanceof Date
            ? e.timestamp.toISOString()
            : String(e.timestamp),
      }));
    return {
      ...p,
      stats: {
        totalUses,
        last30Days,
        uniqueProjects,
        badges,
        endorsements: {
          count: endorsementCount,
          topReasons,
          hasMyEndorsement: myEndorsement,
        },
        isNew: badges.some((b) => b.kind === 'new'),
        isDeprecated: p.deprecatedAt !== null,
        successorSlug: p.successorId ? slugByObjectId.get(toKey(p.successorId)) ?? null : null,
        successorName: p.successorId ? nameByObjectId.get(toKey(p.successorId)) ?? null : null,
      },
    };
  });

  res.json({ patterns: enriched });
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
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
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

router.patch(
  '/:slug/lifecycle',
  authenticate,
  requireRole('chief_architect'),
  async (req: Request, res: Response) => {
    const { lifecycleStatus, deprecatedAt, successorSlug, reason } = req.body || {};

    if (
      lifecycleStatus !== undefined &&
      !ALLOWED_LIFECYCLES.includes(lifecycleStatus)
    ) {
      return res.status(400).json({ error: 'Invalid lifecycleStatus' });
    }

    const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }

    let successorId = pattern.successorId;
    if (successorSlug === null) {
      successorId = null;
    } else if (typeof successorSlug === 'string' && successorSlug.length > 0) {
      const successor = await DecisionPatternModel.findOne({ slug: successorSlug });
      if (!successor) {
        return res.status(400).json({ error: 'Successor pattern not found' });
      }
      if (String(successor._id) === String(pattern._id)) {
        return res.status(400).json({ error: 'Pattern cannot succeed itself' });
      }
      successorId = successor._id;
    }

    const before = {
      lifecycleStatus: pattern.lifecycleStatus,
      deprecatedAt: pattern.deprecatedAt,
      successorId: pattern.successorId ? String(pattern.successorId) : null,
    };

    if (lifecycleStatus !== undefined) {
      pattern.lifecycleStatus = lifecycleStatus;
    }
    if (deprecatedAt === null) {
      pattern.deprecatedAt = null;
    } else if (deprecatedAt !== undefined) {
      pattern.deprecatedAt = new Date(deprecatedAt);
    } else if (lifecycleStatus === 'retiring' && !pattern.deprecatedAt) {
      pattern.deprecatedAt = new Date();
    }
    pattern.successorId = successorId;

    await pattern.save();

    createAuditEntry({
      userId: String(req.user!._id),
      action: 'pattern_lifecycle_changed',
      entityType: 'decision_pattern',
      entityId: pattern.slug,
      before,
      after: {
        lifecycleStatus: pattern.lifecycleStatus,
        deprecatedAt: pattern.deprecatedAt,
        successorSlug: successorSlug ?? null,
        reason: reason ?? null,
      },
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      riskLevel: 'medium',
    }).catch((err) => {
      console.error('[decisionPatterns] audit failed:', err.message);
    });

    res.json({
      ok: true,
      pattern: {
        slug: pattern.slug,
        lifecycleStatus: pattern.lifecycleStatus,
        deprecatedAt: pattern.deprecatedAt,
        successorSlug: successorSlug ?? null,
      },
    });
  }
);

router.post(
  '/:slug/endorse',
  authenticate,
  requireRole(...ENDORSE_ROLES),
  async (req: Request, res: Response) => {
    const { reason } = req.body || {};
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (trimmed.length < 30) {
      return res.status(400).json({
        error: 'Endorsement reason required (min. 30 characters)',
      });
    }
    if (trimmed.length > 500) {
      return res.status(400).json({
        error: 'Endorsement reason too long (max. 500 characters)',
      });
    }
    const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    try {
      await PatternEndorsementModel.create({
        patternId: pattern._id,
        userId: req.user!._id,
        reason: trimmed,
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        return res
          .status(409)
          .json({ error: 'You have already endorsed this pattern' });
      }
      throw err;
    }
    createAuditEntry({
      userId: String(req.user!._id),
      action: 'pattern_endorsed',
      entityType: 'decision_pattern',
      entityId: pattern.slug,
      after: { reason: trimmed.substring(0, 100) },
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      riskLevel: 'medium',
    }).catch((err) => {
      console.error('[decisionPatterns] audit failed:', err.message);
    });
    res.status(201).json({ ok: true });
  }
);

router.delete(
  '/:slug/endorse',
  authenticate,
  requireRole(...ENDORSE_ROLES),
  async (req: Request, res: Response) => {
    const pattern = await DecisionPatternModel.findOne({ slug: req.params.slug });
    if (!pattern) {
      return res.status(404).json({ error: 'Pattern not found' });
    }
    const result = await PatternEndorsementModel.deleteOne({
      patternId: pattern._id,
      userId: req.user!._id,
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'No endorsement to remove' });
    }
    createAuditEntry({
      userId: String(req.user!._id),
      action: 'pattern_endorsement_removed',
      entityType: 'decision_pattern',
      entityId: pattern.slug,
      ip: req.ip,
      userAgent: req.get('user-agent') || undefined,
      riskLevel: 'low',
    }).catch((err) => {
      console.error('[decisionPatterns] audit failed:', err.message);
    });
    res.json({ ok: true });
  }
);

export { router as decisionPatternsRouter };
export default router;
