import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { generateRoadmap, previewCandidates } from '../services/roadmap.service';
import { TransformationRoadmap } from '../models/TransformationRoadmap';

const router = Router();

router.use(authenticate);

const CreateRoadmapSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  strategy: z.enum(['conservative', 'balanced', 'aggressive']).default('balanced'),
  maxWaves: z.number().int().min(2).max(8).default(4),
  targetStates: z.record(z.string(), z.enum(['current', 'target', 'transitional', 'retired'])).default({}),
  includeAIRecommendations: z.boolean().default(false),
  customConstraints: z.string().max(2000).optional(),
});

// Generate new roadmap
router.post(
  '/:projectId/roadmaps',
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const userId = String((req as any).user?._id || (req as any).user?.id);
      const parsed = CreateRoadmapSchema.parse(req.body);

      const roadmap = await generateRoadmap(projectId, userId, {
        strategy: parsed.strategy,
        maxWaves: parsed.maxWaves,
        targetStates: parsed.targetStates,
        includeAIRecommendations: parsed.includeAIRecommendations,
        customConstraints: parsed.customConstraints,
      });

      res.status(201).json({ success: true, data: roadmap });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Invalid config', details: err.errors });
      }
      console.error('[Roadmap] Generate error:', err);
      res.status(500).json({ success: false, error: 'Roadmap generation failed' });
    }
  },
);

// List roadmaps for project
router.get(
  '/:projectId/roadmaps',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const docs = await TransformationRoadmap.find({ projectId })
        .sort({ createdAt: -1 })
        .select('name status config.strategy waves summary version createdAt')
        .lean();

      const items = docs.map((d: any) => ({
        id: d._id.toString(),
        name: d.name,
        status: d.status,
        waveCount: d.waves?.length || 0,
        totalCost: d.summary?.totalCost || 0,
        totalDurationMonths: d.summary?.totalDurationMonths || 0,
        strategy: d.config?.strategy || 'balanced',
        version: d.version || 1,
        createdAt: d.createdAt?.toISOString?.() || d.createdAt,
      }));

      res.json({ success: true, data: items });
    } catch (err) {
      console.error('[Roadmap] List error:', err);
      res.status(500).json({ success: false, error: 'Failed to list roadmaps' });
    }
  },
);

// Preview migration candidates (TOGAF Gap Analysis)
router.get(
  '/:projectId/roadmaps/candidates',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const preview = await previewCandidates(projectId);
      res.json({ success: true, data: preview });
    } catch (err) {
      console.error('[Roadmap] Candidates preview error:', err);
      res.status(500).json({ success: false, error: 'Failed to preview candidates' });
    }
  },
);

// Get single roadmap
router.get(
  '/:projectId/roadmaps/:roadmapId',
  requirePermission(PERMISSIONS.ANALYTICS_VIEW),
  async (req: Request, res: Response) => {
    try {
      const doc = await TransformationRoadmap.findById(req.params.roadmapId).lean();
      if (!doc) return res.status(404).json({ success: false, error: 'Roadmap not found' });

      const roadmap = {
        id: (doc as any)._id.toString(),
        projectId: (doc as any).projectId.toString(),
        createdBy: (doc as any).createdBy.toString(),
        name: doc.name,
        config: doc.config,
        waves: doc.waves,
        summary: doc.summary,
        advisorInsightsAddressed: doc.advisorInsightsAddressed,
        status: doc.status,
        version: doc.version,
        createdAt: (doc as any).createdAt?.toISOString?.() || doc.createdAt,
        updatedAt: (doc as any).updatedAt?.toISOString?.() || doc.updatedAt,
      };

      res.json({ success: true, data: roadmap });
    } catch (err) {
      console.error('[Roadmap] Get error:', err);
      res.status(500).json({ success: false, error: 'Failed to get roadmap' });
    }
  },
);

// Delete roadmap
router.delete(
  '/:projectId/roadmaps/:roadmapId',
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const result = await TransformationRoadmap.findByIdAndDelete(req.params.roadmapId);
      if (!result) return res.status(404).json({ success: false, error: 'Roadmap not found' });
      res.json({ success: true });
    } catch (err) {
      console.error('[Roadmap] Delete error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete roadmap' });
    }
  },
);

// Regenerate roadmap with new config
router.post(
  '/:projectId/roadmaps/:roadmapId/regenerate',
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const userId = String((req as any).user?._id || (req as any).user?.id);
      const existing = await TransformationRoadmap.findById(req.params.roadmapId).lean();
      if (!existing) return res.status(404).json({ success: false, error: 'Roadmap not found' });

      const parsed = CreateRoadmapSchema.parse(req.body);
      const roadmap = await generateRoadmap(projectId, userId, {
        strategy: parsed.strategy,
        maxWaves: parsed.maxWaves,
        targetStates: parsed.targetStates,
        includeAIRecommendations: parsed.includeAIRecommendations,
        customConstraints: parsed.customConstraints,
      });

      // Update version on the new doc
      await TransformationRoadmap.findByIdAndUpdate(roadmap.id, { version: (existing.version || 1) + 1 });

      res.status(201).json({ success: true, data: { ...roadmap, version: (existing.version || 1) + 1 } });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ success: false, error: 'Invalid config', details: err.errors });
      }
      console.error('[Roadmap] Regenerate error:', err);
      res.status(500).json({ success: false, error: 'Regeneration failed' });
    }
  },
);

export default router;
