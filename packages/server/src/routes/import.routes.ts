import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { ImportProfile } from '../models/ImportProfile';
import { detectFormat, parseArchitectureFile, createTemporaryGraph } from '../services/upload.service';
import type { ParseResult } from '../services/upload.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

// ─── Preview: parse file and return preview without importing ───
// POST /api/projects/:projectId/import/preview
router.post(
  '/:projectId/import/preview',
  requireProjectAccess('editor'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const buffer = req.file.buffer;
      const filename = req.file.originalname;
      const format = detectFormat(buffer, filename);

      // Parse the file
      const result = parseArchitectureFile(buffer, filename);

      // Detect columns from first element's keys (for mapping UI)
      const detectedColumns = result.elements.length > 0
        ? Object.keys(result.elements[0])
        : [];

      // Auto-detect column mapping suggestions
      const suggestedMappings = autoDetectMappings(detectedColumns);

      res.json({
        success: true,
        data: {
          format,
          filename,
          totalElements: result.elements.length,
          totalConnections: result.connections.length,
          warnings: result.warnings,
          detectedColumns,
          suggestedMappings,
          // Preview first 20 elements
          previewElements: result.elements.slice(0, 20).map(el => ({
            id: el.id,
            name: el.name,
            type: el.type,
            layer: el.layer,
            description: el.description?.substring(0, 100),
            status: el.status,
            riskLevel: el.riskLevel,
          })),
          previewConnections: result.connections.slice(0, 10),
        },
      });
    } catch (err: any) {
      console.error('[Import] Preview error:', err);
      res.status(400).json({ success: false, error: err.message || 'Failed to parse file' });
    }
  },
);

// ─── Execute: import with optional column mapping overrides ───
// POST /api/projects/:projectId/import/execute
router.post(
  '/:projectId/import/execute',
  requireProjectAccess('editor'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const projectId = String(req.params.projectId);
      const buffer = req.file.buffer;
      const filename = req.file.originalname;

      // Parse file
      let result: ParseResult = parseArchitectureFile(buffer, filename);

      // Apply column mapping overrides if provided
      const mappings = req.body.mappings;
      if (mappings && Array.isArray(mappings)) {
        result = applyColumnMappings(result, mappings);
      }

      // Apply default values
      const defaults = req.body.defaults;
      if (defaults && typeof defaults === 'object') {
        for (const el of result.elements) {
          if (defaults.status && !el.status) el.status = defaults.status;
          if (defaults.riskLevel && !el.riskLevel) el.riskLevel = defaults.riskLevel;
          if (defaults.layer && !el.layer) el.layer = defaults.layer;
        }
      }

      // Create temporary graph and return result
      const graph = await createTemporaryGraph(result);

      res.json({
        success: true,
        data: {
          uploadToken: graph.uploadToken,
          tempProjectId: graph.projectId,
          targetProjectId: projectId,
          elementCount: result.elements.length,
          connectionCount: result.connections.length,
          warnings: result.warnings,
          format: result.format,
        },
      });
    } catch (err: any) {
      console.error('[Import] Execute error:', err);
      res.status(400).json({ success: false, error: err.message || 'Import failed' });
    }
  },
);

// ─── Profile CRUD ───

// GET /api/projects/:projectId/import/profiles
router.get(
  '/:projectId/import/profiles',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const profiles = await ImportProfile.find({ projectId }).sort({ updatedAt: -1 }).lean();
      res.json({ success: true, data: profiles });
    } catch (err) {
      console.error('[Import] List profiles error:', err);
      res.status(500).json({ success: false, error: 'Failed to list profiles' });
    }
  },
);

// POST /api/projects/:projectId/import/profiles
router.post(
  '/:projectId/import/profiles',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const userId = (req as any).user?.id || '';
      const { name, description, sourceFormat, columnMappings, defaultValues, skipRows, sheetName, isDefault } = req.body;

      if (!name || !sourceFormat) {
        return res.status(400).json({ success: false, error: 'Name and sourceFormat are required' });
      }

      // If setting as default, unset other defaults for same format
      if (isDefault) {
        await ImportProfile.updateMany(
          { projectId, sourceFormat, isDefault: true },
          { isDefault: false },
        );
      }

      const profile = await ImportProfile.create({
        projectId,
        userId,
        name,
        description: description || '',
        sourceFormat,
        columnMappings: columnMappings || [],
        defaultValues: defaultValues || {},
        skipRows: skipRows || 0,
        sheetName,
        isDefault: isDefault || false,
      });

      res.json({ success: true, data: profile });
    } catch (err) {
      console.error('[Import] Create profile error:', err);
      res.status(500).json({ success: false, error: 'Failed to create profile' });
    }
  },
);

// DELETE /api/projects/:projectId/import/profiles/:profileId
router.delete(
  '/:projectId/import/profiles/:profileId',
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const profileId = String(req.params.profileId);
      await ImportProfile.findByIdAndDelete(profileId);
      res.json({ success: true });
    } catch (err) {
      console.error('[Import] Delete profile error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete profile' });
    }
  },
);

// ─── Helpers ───

const TARGET_FIELDS = [
  'name', 'type', 'layer', 'description', 'status', 'riskLevel',
  'maturityLevel', 'lifecyclePhase', 'businessOwner', 'technicalOwner',
  'annualCost', 'userCount', 'goLiveDate', 'endOfLifeDate',
];

const COLUMN_HINTS: Record<string, string[]> = {
  name: ['name', 'display_name', 'displayname', 'title', 'element_name', 'factsheet_name', 'label'],
  type: ['type', 'element_type', 'factsheet_type', 'archimate_type', 'category'],
  layer: ['layer', 'architecture_layer', 'domain'],
  description: ['description', 'desc', 'documentation', 'notes', 'comment'],
  status: ['status', 'state', 'lifecycle_status', 'element_status'],
  riskLevel: ['risk', 'risk_level', 'risklevel', 'overall_risk', 'business_risk'],
  maturityLevel: ['maturity', 'maturity_level', 'maturitylevel', 'technical_fit'],
  lifecyclePhase: ['lifecycle', 'lifecycle_phase', 'phase'],
  businessOwner: ['owner', 'business_owner', 'responsible', 'steward'],
  technicalOwner: ['technical_owner', 'tech_owner', 'it_owner'],
  annualCost: ['cost', 'annual_cost', 'yearly_cost', 'total_cost'],
  userCount: ['users', 'user_count', 'usercount', 'num_users'],
  goLiveDate: ['go_live', 'golive', 'go_live_date', 'start_date', 'launch_date'],
  endOfLifeDate: ['eol', 'end_of_life', 'eol_date', 'retirement_date', 'sunset_date'],
};

function autoDetectMappings(columns: string[]): Array<{ sourceColumn: string; targetField: string; confidence: number }> {
  const mappings: Array<{ sourceColumn: string; targetField: string; confidence: number }> = [];
  const usedTargets = new Set<string>();

  for (const col of columns) {
    const lower = col.toLowerCase().replace(/[\s-]+/g, '_');
    let bestMatch: { target: string; confidence: number } | null = null;

    for (const [target, hints] of Object.entries(COLUMN_HINTS)) {
      if (usedTargets.has(target)) continue;

      // Exact match
      if (hints.includes(lower)) {
        bestMatch = { target, confidence: 1.0 };
        break;
      }

      // Partial match
      for (const hint of hints) {
        if (lower.includes(hint) || hint.includes(lower)) {
          const confidence = 0.7;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { target, confidence };
          }
        }
      }
    }

    if (bestMatch) {
      usedTargets.add(bestMatch.target);
      mappings.push({ sourceColumn: col, targetField: bestMatch.target, confidence: bestMatch.confidence });
    }
  }

  return mappings;
}

function applyColumnMappings(result: ParseResult, mappings: Array<{ sourceColumn: string; targetField: string }>): ParseResult {
  // Create a reverse map: targetField → sourceColumn
  const fieldMap = new Map<string, string>();
  for (const m of mappings) {
    fieldMap.set(m.targetField, m.sourceColumn);
  }

  // Re-map elements if properties contain original column values
  for (const el of result.elements) {
    if (!el.properties) continue;
    for (const [target, source] of fieldMap) {
      const value = el.properties[source];
      if (value !== undefined) {
        switch (target) {
          case 'name': el.name = value; break;
          case 'description': el.description = value; break;
          case 'status': el.status = value; break;
          case 'riskLevel': el.riskLevel = value; break;
          case 'maturityLevel': el.maturityLevel = parseInt(value, 10) || 3; break;
        }
      }
    }
  }

  return result;
}

export default router;
