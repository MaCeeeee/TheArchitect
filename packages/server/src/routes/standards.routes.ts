import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import {
  parseAndStore,
  getStandards,
  getStandard,
  deleteStandard,
  getMappings,
  getMappingMatrix,
  upsertMapping,
  bulkCreateMappings,
  deleteMapping,
} from '../services/standards.service';
import { generateMappingSuggestions, validateConfidence, generatePoliciesFromStandard } from '../services/ai.service';
import { StandardMapping } from '../models/StandardMapping';
import { Policy } from '../models/Policy';
import {
  getOrCreatePipelineState,
  refreshMappingStats,
  refreshPolicyStats,
  getPipelineStatus,
  getPortfolioOverview,
} from '../services/compliance-pipeline.service';

const router = Router();
router.use(authenticate);

function getUserId(req: Request): string {
  return (req as unknown as { user: { userId: string } }).user.userId;
}
function pid(req: Request): string {
  return String(req.params.projectId);
}
function sid(req: Request): string {
  return String(req.params.standardId);
}

// Multer config: memory storage, PDF only, max 20MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// ─── Standards CRUD ───

// Upload + parse PDF
router.post(
  '/:projectId/standards/upload',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  upload.single('standard'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file uploaded' });
      }

      const { name, version, type, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const standard = await parseAndStore(
        pid(req),
        req.file.buffer,
        {
          name,
          version: version || '',
          type: type || 'iso',
          description: description || '',
        },
        getUserId(req),
      );

      // Create pipeline state for new standard
      await getOrCreatePipelineState(pid(req), String(standard._id));

      res.status(201).json({
        id: standard._id,
        name: standard.name,
        version: standard.version,
        type: standard.type,
        pageCount: standard.pageCount,
        sectionsCount: standard.sections.length,
        sections: standard.sections.map((s) => ({
          id: s.id,
          number: s.number,
          title: s.title,
          level: s.level,
        })),
      });
    } catch (err) {
      console.error('[Standards] Upload error:', err);
      res.status(500).json({ error: 'Failed to parse and store PDF' });
    }
  },
);

// List all standards for a project
router.get(
  '/:projectId/standards',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const standards = await getStandards(pid(req));
      res.json(standards);
    } catch (err) {
      console.error('[Standards] List error:', err);
      res.status(500).json({ error: 'Failed to list standards' });
    }
  },
);

// --- Compliance Pipeline Endpoints (BEFORE :standardId routes) ---

// GET pipeline status for all standards in project
router.get(
  '/:projectId/standards/pipeline-status',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = pid(req);
      const states = await getPipelineStatus(projectId);
      res.json(states);
    } catch (err) {
      console.error('[Pipeline] Status error:', err);
      res.status(500).json({ error: 'Failed to get pipeline status' });
    }
  }
);

// GET portfolio overview (aggregated)
router.get(
  '/:projectId/standards/portfolio',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = pid(req);
      const overview = await getPortfolioOverview(projectId);
      res.json(overview);
    } catch (err) {
      console.error('[Pipeline] Portfolio error:', err);
      res.status(500).json({ error: 'Failed to get portfolio' });
    }
  }
);

// Get single standard with sections
router.get(
  '/:projectId/standards/:standardId',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const standard = await getStandard(sid(req));
      if (!standard) return res.status(404).json({ error: 'Standard not found' });
      res.json(standard);
    } catch (err) {
      console.error('[Standards] Get error:', err);
      res.status(500).json({ error: 'Failed to get standard' });
    }
  },
);

// Delete standard + all mappings
router.delete(
  '/:projectId/standards/:standardId',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      await deleteStandard(sid(req));
      res.json({ success: true });
    } catch (err) {
      console.error('[Standards] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete standard' });
    }
  },
);

// ─── Mappings ───

// Get all mappings for a standard
router.get(
  '/:projectId/standards/:standardId/mappings',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const mappings = await getMappings(pid(req), sid(req));
      res.json(mappings);
    } catch (err) {
      console.error('[Standards] Mappings list error:', err);
      res.status(500).json({ error: 'Failed to get mappings' });
    }
  },
);

// Get aggregated matrix (Sections × Layers)
router.get(
  '/:projectId/standards/:standardId/matrix',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const sectionIds = req.query.sectionIds
        ? String(req.query.sectionIds).split(',')
        : undefined;
      const matrix = await getMappingMatrix(pid(req), sid(req), sectionIds);
      res.json(matrix);
    } catch (err) {
      console.error('[Standards] Matrix error:', err);
      res.status(500).json({ error: 'Failed to build matrix' });
    }
  },
);

// Create or update a mapping
router.post(
  '/:projectId/standards/:standardId/mappings',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const { sectionId, sectionNumber, elementId, elementName, elementLayer, status, notes } = req.body;
      if (!sectionId || !elementId) {
        return res.status(400).json({ error: 'sectionId and elementId are required' });
      }

      const mapping = await upsertMapping({
        projectId: pid(req),
        standardId: sid(req),
        sectionId,
        sectionNumber: sectionNumber || '',
        elementId,
        elementName: elementName || '',
        elementLayer: elementLayer || '',
        status: status || 'gap',
        notes: notes || '',
        source: 'manual',
        createdBy: getUserId(req),
      });

      res.status(201).json(mapping);
    } catch (err) {
      console.error('[Standards] Mapping create error:', err);
      res.status(500).json({ error: 'Failed to create mapping' });
    }
  },
);

// Bulk create mappings (for AI suggestions)
router.post(
  '/:projectId/standards/:standardId/mappings/bulk',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const { mappings } = req.body;
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ error: 'mappings array is required' });
      }

      const userId = getUserId(req);
      const prepared = mappings.map((m: Record<string, unknown>) => ({
        projectId: pid(req),
        standardId: sid(req),
        sectionId: String(m.sectionId || ''),
        sectionNumber: String(m.sectionNumber || ''),
        elementId: String(m.elementId || ''),
        elementName: String(m.elementName || ''),
        elementLayer: String(m.elementLayer || ''),
        status: (m.status as 'compliant' | 'partial' | 'gap' | 'not_applicable') || 'gap',
        notes: String(m.notes || ''),
        source: 'ai' as const,
        confidence: Number(m.confidence) || 0,
        createdBy: userId,
      }));

      const count = await bulkCreateMappings(prepared);
      res.status(201).json({ created: count });
    } catch (err) {
      console.error('[Standards] Bulk create error:', err);
      res.status(500).json({ error: 'Failed to bulk create mappings' });
    }
  },
);

// Delete a mapping
router.delete(
  '/:projectId/standards/:standardId/mappings/:mappingId',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      await deleteMapping(String(req.params.mappingId));
      res.json({ success: true });
    } catch (err) {
      console.error('[Standards] Mapping delete error:', err);
      res.status(500).json({ error: 'Failed to delete mapping' });
    }
  },
);

// POST refresh mapping stats for a standard
router.post(
  '/:projectId/standards/:standardId/refresh-stats',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const projectId = pid(req);
      const standardId = sid(req);
      const state = await refreshMappingStats(projectId, standardId);
      res.json(state);
    } catch (err) {
      console.error('[Pipeline] Refresh stats error:', err);
      res.status(500).json({ error: 'Failed to refresh stats' });
    }
  }
);

// ─── AI Policy Generation (SSE) — REQ-CDTP-006 ───

router.post(
  '/:projectId/standards/:standardId/generate-policies',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI not configured' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await generatePoliciesFromStandard(
        pid(req),
        sid(req),
        (text) => {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        },
        async (drafts) => {
          res.write(`data: ${JSON.stringify({ drafts, done: true })}\n\n`);
          res.end();
        },
        (err) => {
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        },
      );
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Policy generation failed' });
      } else {
        res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
        res.end();
      }
    }
  },
);

// ─── Approve Policy Drafts — REQ-CDTP-009 ───

router.post(
  '/:projectId/standards/:standardId/approve-policies',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const { approved } = req.body;
      if (!Array.isArray(approved) || approved.length === 0) {
        return res.status(400).json({ error: 'approved array is required' });
      }

      const userId = getUserId(req);
      const projectId = pid(req);
      const standardId = sid(req);

      const policies = await Policy.insertMany(
        approved.map((draft: Record<string, unknown>) => ({
          projectId,
          name: draft.name,
          description: draft.description || '',
          category: 'compliance' as const,
          framework: 'Standard Compliance',
          severity: draft.severity || 'warning',
          scope: draft.scope || { domains: [], elementTypes: [], layers: [] },
          rules: draft.rules || [],
          standardId,
          sourceSectionNumber: draft.sourceSection || '',
          enabled: true,
          createdBy: userId,
        }))
      );

      // Update pipeline state
      await refreshPolicyStats(projectId, standardId);

      res.status(201).json({ created: policies.length, policies });
    } catch (err) {
      console.error('[Standards] Approve policies error:', err);
      res.status(500).json({ error: 'Failed to approve policies' });
    }
  },
);

// ─── AI Mapping Suggestions (SSE) ───

router.post(
  '/:projectId/standards/:standardId/ai-suggest',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'AI not configured' });
    }

    const { sectionIds } = req.body;

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await generateMappingSuggestions(
        pid(req),
        sid(req),
        sectionIds,
        (text) => {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        },
        async (suggestions) => {
          // Save AI suggestions as mappings
          if (suggestions.length > 0) {
            const userId = getUserId(req);

            // Separate non-gap suggestions from coverage gaps
            const nonGapSuggestions = suggestions.filter((s: any) => s.coverageGap !== true);
            // existing bulkCreateMappings processes only non-gap suggestions
            if (nonGapSuggestions.length > 0) {
              const prepared = nonGapSuggestions.map((s) => ({
                ...s,
                projectId: pid(req),
                standardId: sid(req),
                source: 'ai' as const,
                createdBy: userId,
              }));
              await bulkCreateMappings(prepared);
            }

            // Coverage gap entries — inserted separately with suggestedNewElement
            const coverageGaps = suggestions.filter((s: any) => s.coverageGap === true);
            if (coverageGaps.length > 0) {
              const gapMappings = coverageGaps.map((g: any) => ({
                projectId: pid(req),
                standardId: sid(req),
                sectionId: g.sectionId,
                sectionNumber: g.sectionNumber || '',
                elementId: '__COVERAGE_GAP__',
                elementName: 'Coverage Gap',
                elementLayer: g.suggestedElementLayer || 'technology',
                status: 'gap' as const,
                notes: `AI identified coverage gap. Suggested element: ${g.suggestedElementName}`,
                source: 'ai' as const,
                confidence: validateConfidence(g, []),  // No element to compare for gaps
                createdBy: getUserId(req),
                suggestedNewElement: {
                  name: g.suggestedElementName || 'Unknown',
                  type: g.suggestedElementType || 'application_component',
                  layer: g.suggestedElementLayer || 'application',
                  description: g.description || '',
                },
              }));
              // Use StandardMapping.insertMany directly since bulkCreateMappings
              // type signature doesn't include suggestedNewElement yet
              await StandardMapping.insertMany(gapMappings);
            }
          }
          res.write(`data: ${JSON.stringify({ suggestions, done: true })}\n\n`);
          res.end();
        },
        (err) => {
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
        },
      );
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'AI suggestion failed' });
      } else {
        res.write(`data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`);
        res.end();
      }
    }
  },
);

export default router;
