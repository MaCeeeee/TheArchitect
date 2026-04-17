import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { audit } from '../middleware/audit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { Workspace } from '../models/Workspace';
import { runCypher } from '../config/neo4j';
import { generateBlueprint, autofillFromDocument } from '../services/blueprint.service';
import { extractText, isSupportedDocument, getSupportedFormats } from '../services/document-parser.service';
import type { BlueprintStreamEvent } from '@thearchitect/shared';

const router = Router();

router.use(authenticate);

// ─── Validation Schemas ───

// Lenient enum: accept known values, coerce unknown to closest match or passthrough
const lenientEnum = <T extends string>(values: readonly [T, ...T[]]) =>
  z.string().transform((v) => (values.includes(v as T) ? v as T : values[values.length - 1])).optional();

const BlueprintQuestionnaireSchema = z.object({
  businessDescription: z.string().min(1),
  targetUsers: z.string().min(1),
  problemSolved: z.string().min(1),
  urgencyDriver: z.string().optional(),
  goals: z.tuple([z.string(), z.string(), z.string()]),
  successVision: z.string().optional(),
  principles: z.string().optional(),
  capabilities: z.string().min(1),
  customerJourney: z.string().optional(),
  teamDescription: z.string().optional(),
  mainProcesses: z.string().optional(),
  existingTools: z.array(z.string()).optional(),
  productType: lenientEnum(['web_app', 'mobile_app', 'api_platform', 'marketplace', 'saas', 'hardware_software', 'other'] as const),
  techDecisions: z.string().optional(),
  constraints: z.string().optional(),
  teamSize: lenientEnum(['1-2', '3-5', '6-15', '16-50', '50+'] as const),
  monthlyBudget: lenientEnum(['<500', '500-2K', '2K-10K', '10K-50K', '50K+'] as const),
  regulations: z.array(z.string()).optional(),
});

const BlueprintInputSchema = z.object({
  motivation: z.string().min(1),
  strategy: z.string().min(1),
  requirements: z.string(),
  industryHint: z.string().optional(),
  complexityHint: z.enum(['minimal', 'standard', 'comprehensive']).optional(),
  rawQuestionnaire: BlueprintQuestionnaireSchema,
});

// ─── POST /:projectId/blueprint/generate — SSE streaming ───

const generateRateLimit = rateLimit({ name: 'ai-blueprint-generate', windowMs: 24 * 60 * 60 * 1000, max: 10 });
const autofillRateLimit = rateLimit({ name: 'ai-blueprint-autofill', windowMs: 60 * 60 * 1000, max: 30 });

router.post(
  '/:projectId/blueprint/generate',
  generateRateLimit,
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  async (req: Request, res: Response) => {
    // Validate input
    const parsed = BlueprintInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: BlueprintStreamEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await generateBlueprint(parsed.data, sendEvent);
    } catch (err) {
      sendEvent({ type: 'error', message: (err as Error).message });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  },
);

// ─── POST /:projectId/blueprint/autofill — Extract from document ───

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (isSupportedDocument(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Supported: ${getSupportedFormats()}`));
    }
  },
});

// Wrap multer to catch file filter / size errors and return proper JSON
function handleUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('document')(req, res, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.post(
  '/:projectId/blueprint/autofill',
  autofillRateLimit,
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  async (req: Request, res: Response) => {
    try {
      await handleUpload(req, res);

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      // Extract text from document
      const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);

      if (!text.trim()) {
        res.status(400).json({ error: 'Could not extract text from document. The file may be empty or image-based.' });
        return;
      }

      // Use AI to map extracted text to questionnaire fields
      const fields = await autofillFromDocument(text);

      res.json({
        success: true,
        data: {
          fields,
          documentName: req.file.originalname,
          extractedCharacters: text.length,
        },
      });
    } catch (err: any) {
      console.error('[Blueprint] Autofill error:', err);
      // Multer errors (file too large, unsupported type)
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File too large. Maximum size is 20MB.' });
        return;
      }
      if (err.message?.includes('Unsupported file type')) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err.message || 'Failed to process document' });
    }
  },
);

// ─── POST /:projectId/blueprint/import ───

router.post(
  '/:projectId/blueprint/import',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  audit({ action: 'import_blueprint', entityType: 'project', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { elements, connections, input, workspaceName } = req.body;

      if (!Array.isArray(elements) || !Array.isArray(connections)) {
        res.status(400).json({ error: 'Invalid import data' });
        return;
      }

      // Create workspace
      const workspace = await Workspace.create({
        name: workspaceName || `Blueprint - ${new Date().toLocaleDateString('en-US')}`,
        projectId,
        source: 'blueprint',
        color: '#7c3aed',
        offsetX: 0,
        createdBy: (req as any).user._id,
        metadata: input ? { blueprintInput: input } : undefined,
      });

      const workspaceId = workspace._id.toString();

      // Create elements in Neo4j
      for (const el of elements) {
        const id = el.id || uuid();
        await runCypher(
          `CREATE (e:ArchitectureElement {
            id: $id, projectId: $projectId, type: $type, name: $name,
            description: $description, layer: $layer, togafDomain: $togafDomain,
            maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
            posX: $posX, posY: $posY, posZ: $posZ,
            workspaceId: $workspaceId,
            metadataJson: $metadataJson, sourceImport: 'blueprint',
            createdAt: datetime(), updatedAt: datetime()
          })`,
          {
            id,
            projectId,
            type: el.type,
            name: el.name,
            description: el.description || '',
            layer: el.layer,
            togafDomain: el.togafDomain,
            maturityLevel: el.maturityLevel || 3,
            riskLevel: el.riskLevel || 'low',
            status: el.status || 'target',
            posX: el.position3D?.x || 0,
            posY: el.position3D?.y || 0,
            posZ: el.position3D?.z || 0,
            workspaceId,
            metadataJson: JSON.stringify(el.metadata || {}),
          },
        );
      }

      // Create connections in Neo4j
      for (const conn of connections) {
        const connectionId = conn.id || uuid();
        await runCypher(
          `MATCH (a:ArchitectureElement {id: $sourceId, projectId: $projectId}),
                 (b:ArchitectureElement {id: $targetId, projectId: $projectId})
           CREATE (a)-[:CONNECTS_TO {id: $connectionId, type: $type, label: $label}]->(b)`,
          {
            sourceId: conn.sourceId,
            targetId: conn.targetId,
            projectId,
            connectionId,
            type: conn.type || 'association',
            label: conn.label || '',
          },
        );
      }

      res.status(201).json({
        success: true,
        data: {
          elementsCreated: elements.length,
          connectionsCreated: connections.length,
          workspaceId,
        },
      });
    } catch (err) {
      console.error('[Blueprint] Import error:', err);
      res.status(500).json({ error: 'Failed to import blueprint' });
    }
  },
);

export default router;
