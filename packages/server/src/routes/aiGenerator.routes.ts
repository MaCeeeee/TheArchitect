// UC-ADD-004 — AI-Generator Routes
// Generator A: Process → Activities (SSE stream)
// Generator C: PDF/Document → Full-Hierarchy (SSE stream + apply)

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { runCypher } from '../config/neo4j';
import { Project } from '../models/Project';
import {
  generateActivitiesForProcess,
  GeneratedActivity,
  GeneratorEvent,
} from '../services/activityGenerator.service';
import {
  extractArchitectureFromDocument,
  HierarchyEvent,
  ExtractedHierarchy,
  Stakeholder as AIStakeholder,
} from '../services/architectureGenerator.service';
import { extractText, isSupportedDocument, getSupportedFormats } from '../services/document-parser.service';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

// ─── Generate Activities (SSE) ──────────────────────────────────────────────

router.post(
  '/projects/:projectId/processes/:processId/generate-activities',
  requireProjectAccess('viewer'),
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'aiGenerator-activities' }),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const processId = String(req.params.processId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: GeneratorEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await generateActivitiesForProcess({ projectId, processId, onEvent: sendEvent });
    } catch (err) {
      log.error({ err, projectId, processId }, '[AI-Generator] activity generation failed');
      sendEvent({ type: 'error', message: (err as Error).message });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  },
);

// ─── Apply Activities (bulk persist after user-accept) ──────────────────────

interface ApplyRequest {
  activities: GeneratedActivity[];
  parentX?: number;
  parentZ?: number;
}

router.post(
  '/projects/:projectId/processes/:processId/apply-activities',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const processId = String(req.params.processId);
    const body = req.body as ApplyRequest;

    if (!Array.isArray(body?.activities) || body.activities.length === 0) {
      return res.status(400).json({ error: 'activities array is required' });
    }

    const parentX = body.parentX ?? 0;
    const parentZ = body.parentZ ?? 0;
    const HIDDEN_Y = -100;

    const createdIds: string[] = [];

    try {
      for (let i = 0; i < body.activities.length; i++) {
        const a = body.activities[i];
        const aId = `${processId}-act-ai-${Date.now()}-${i + 1}`;
        createdIds.push(aId);

        const metadata = {
          source: 'ai-generated',
          aiGenerated: true,
          aiGeneratedAt: new Date().toISOString(),
          isActivity: true,
          sequenceIndex: i + 1,
          activityOwner: a.owner,
          activityAction: a.action,
          activitySystem: a.system,
          activityWhen: a.when,
          activityOutput: a.output,
          activityEnables: a.enables,
        };

        const description = `${a.owner} ${a.action} (${a.system}) — ${a.when}. Output: ${a.output} → ermöglicht ${a.enables}.`;

        await runCypher(
          `CREATE (e:ArchitectureElement {
            id: $id, projectId: $projectId, type: 'process', name: $name,
            description: $description, layer: 'business', togafDomain: 'business',
            maturityLevel: 3, riskLevel: 'low', status: 'current',
            posX: $posX, posY: $posY, posZ: $posZ,
            metadataJson: $metadataJson,
            createdAt: datetime(), updatedAt: datetime()
          }) RETURN e`,
          {
            id: aId,
            projectId,
            name: a.name,
            description,
            posX: parentX,
            posY: HIDDEN_Y,
            posZ: parentZ,
            metadataJson: JSON.stringify(metadata),
          },
        );

        // Composition: parent process → child activity
        await runCypher(
          `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId}),
                 (c:ArchitectureElement {id: $childId, projectId: $projectId})
           CREATE (p)-[r:CONNECTS_TO {id: $connId, type: 'composition', label: 'composes'}]->(c)
           RETURN r`,
          { processId, projectId, childId: aId, connId: uuid() },
        );
      }

      // Sequential flow connections between siblings
      for (let i = 0; i < createdIds.length - 1; i++) {
        await runCypher(
          `MATCH (a:ArchitectureElement {id: $from, projectId: $projectId}),
                 (b:ArchitectureElement {id: $to, projectId: $projectId})
           CREATE (a)-[r:CONNECTS_TO {id: $connId, type: 'flow', label: 'next'}]->(b)
           RETURN r`,
          { from: createdIds[i], to: createdIds[i + 1], projectId, connId: uuid() },
        );
      }

      log.info(
        { projectId, processId, activitiesCreated: createdIds.length },
        '[AI-Generator] activities applied successfully',
      );

      res.json({
        success: true,
        activityIds: createdIds,
        count: createdIds.length,
      });
    } catch (err) {
      log.error({ err, projectId, processId }, '[AI-Generator] apply-activities failed');
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── Generator C — PDF → Full-Hierarchy (SSE) ───────────────────────────────

const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    if (isSupportedDocument(file.mimetype, file.originalname)) cb(null, true);
    else cb(new Error(`Unsupported file type. Supported: ${getSupportedFormats()}`));
  },
});

function handleDocUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    docUpload.single('document')(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.post(
  '/projects/:projectId/architecture/generate-from-document',
  requireProjectAccess('viewer'),
  rateLimit({ windowMs: 60 * 60 * 1000, max: 3, name: 'aiGenerator-hierarchy' }),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);

    try {
      await handleDocUpload(req, res);
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      return res.status(400).json({ error: 'document file is required (field name: document)' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: HierarchyEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const documentText = await extractText(file.buffer, file.mimetype, file.originalname);
      if (!documentText || documentText.trim().length < 100) {
        sendEvent({ type: 'error', message: 'Document text too short — extraction may have failed' });
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      await extractArchitectureFromDocument({
        projectId,
        fileBuffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        documentText,
        onEvent: sendEvent,
      });
    } catch (err) {
      log.error({ err, projectId }, '[Gen-C] hierarchy extraction failed');
      sendEvent({ type: 'error', message: (err as Error).message });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  },
);

// ─── Apply Hierarchy (atomic-ish bulk-persist) ──────────────────────────────

interface ApplyHierarchyRequest {
  hierarchy: ExtractedHierarchy;
  accept: {
    vision?: boolean;
    stakeholders?: boolean[];
    capabilities?: boolean[];
    processes?: boolean[];
    activities?: boolean[];
  };
}

router.post(
  '/projects/:projectId/architecture/apply-hierarchy',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const body = req.body as ApplyHierarchyRequest;

    if (!body?.hierarchy) {
      return res.status(400).json({ error: 'hierarchy is required' });
    }

    const accept = body.accept ?? {};
    const counts = { goals: 0, stakeholders: 0, capabilities: 0, processes: 0, activities: 0, connections: 0 };

    // Layer Y-positions (matching togaf.constants ARCHITECTURE_LAYERS)
    const Y_MOTIVATION = 16;
    const Y_STRATEGY = 12;
    const Y_BUSINESS = 8;
    const Y_HIDDEN_ACTIVITY = -100;

    // Helpers to lay out elements horizontally on their layer
    const layoutX = (i: number, total: number, span = 24) =>
      total > 1 ? -span / 2 + (i / (total - 1)) * span : 0;

    // Track created ID-mappings for parent→child connections
    const capabilityIdByName = new Map<string, string>();
    const processIdByName = new Map<string, string>();

    try {
      // ─── 1) Vision (as goal element) ──────────────────────────────────
      if (accept.vision !== false) {
        for (let i = 0; i < body.hierarchy.vision.visionStatements.length; i++) {
          const v = body.hierarchy.vision.visionStatements[i];
          await createElement({
            projectId,
            id: `ai-vision-${Date.now()}-${i}`,
            type: 'goal',
            name: v.length > 100 ? v.slice(0, 97) + '…' : v,
            description: v,
            layer: 'motivation',
            togafDomain: 'motivation',
            posX: layoutX(i, body.hierarchy.vision.visionStatements.length, 18),
            posY: Y_MOTIVATION,
            posZ: -8,
            metadata: { source: 'ai-generated', aiGenerated: true, kind: 'vision' },
          });
          counts.goals++;
        }
        // Mission as a separate goal
        if (body.hierarchy.vision.mission) {
          await createElement({
            projectId,
            id: `ai-mission-${Date.now()}`,
            type: 'goal',
            name: 'Mission',
            description: body.hierarchy.vision.mission,
            layer: 'motivation',
            togafDomain: 'motivation',
            posX: 0,
            posY: Y_MOTIVATION,
            posZ: -10,
            metadata: { source: 'ai-generated', aiGenerated: true, kind: 'mission' },
          });
          counts.goals++;
        }
      }

      // ─── 2) Stakeholders ──────────────────────────────────────────────
      const sList = body.hierarchy.stakeholders;
      for (let i = 0; i < sList.length; i++) {
        if (accept.stakeholders && accept.stakeholders[i] === false) continue;
        const s = sList[i];
        await createElement({
          projectId,
          id: `ai-stk-${Date.now()}-${i}`,
          type: 'stakeholder',
          name: s.name,
          description: `${s.role} — Influence: ${s.influence}, Attitude: ${s.attitude}${
            s.interests && s.interests.length > 0 ? `, Interests: ${s.interests.join(', ')}` : ''
          }`,
          layer: 'motivation',
          togafDomain: 'motivation',
          posX: layoutX(i, sList.length, 26),
          posY: Y_MOTIVATION,
          posZ: -3,
          metadata: {
            source: 'ai-generated',
            aiGenerated: true,
            stakeholderType: s.stakeholderType,
            influence: s.influence,
            attitude: s.attitude,
            interests: s.interests ?? [],
          },
        });
        counts.stakeholders++;
      }

      // ─── 3) Capabilities ──────────────────────────────────────────────
      const cList = body.hierarchy.capabilities;
      for (let i = 0; i < cList.length; i++) {
        if (accept.capabilities && accept.capabilities[i] === false) continue;
        const c = cList[i];
        const cId = `ai-cap-${Date.now()}-${i}`;
        await createElement({
          projectId,
          id: cId,
          type: 'business_capability',
          name: c.name,
          description: c.description,
          layer: 'strategy',
          togafDomain: 'strategy',
          posX: layoutX(i, cList.length, 30),
          posY: Y_STRATEGY,
          posZ: 0,
          metadata: { source: 'ai-generated', aiGenerated: true, level: c.level ?? 1 },
        });
        capabilityIdByName.set(c.name, cId);
        counts.capabilities++;
      }

      // ─── 4) Processes ──────────────────────────────────────────────────
      const pList = body.hierarchy.processes;
      for (let i = 0; i < pList.length; i++) {
        if (accept.processes && accept.processes[i] === false) continue;
        const p = pList[i];
        const pId = `ai-proc-${Date.now()}-${i}`;
        await createElement({
          projectId,
          id: pId,
          type: 'business_process',
          name: p.name,
          description: p.description,
          layer: 'business',
          togafDomain: 'business',
          posX: layoutX(i, pList.length, 30),
          posY: Y_BUSINESS,
          posZ: 3,
          metadata: { source: 'ai-generated', aiGenerated: true, parentCapability: p.parentCapability },
        });
        processIdByName.set(p.name, pId);
        counts.processes++;

        // Composition: capability → process
        const capId = capabilityIdByName.get(p.parentCapability);
        if (capId) {
          await createConnection(projectId, capId, pId, 'composition', 'composes');
          counts.connections++;
        }
      }

      // ─── 5) Activities ────────────────────────────────────────────────
      const aList = body.hierarchy.activities;
      const activityIdsByProcess = new Map<string, string[]>();
      for (let i = 0; i < aList.length; i++) {
        if (accept.activities && accept.activities[i] === false) continue;
        const a = aList[i];
        const parentProcId = processIdByName.get(a.parentProcess);
        if (!parentProcId) continue; // orphan activity, skip

        const aId = `ai-act-${Date.now()}-${i}`;
        await createElement({
          projectId,
          id: aId,
          type: 'process',
          name: a.name,
          description: `${a.owner} ${a.action} (${a.system}) — ${a.when}. Output: ${a.output} → ermöglicht ${a.enables || '—'}.`,
          layer: 'business',
          togafDomain: 'business',
          posX: 0,
          posY: Y_HIDDEN_ACTIVITY,
          posZ: 0,
          metadata: {
            source: 'ai-generated',
            aiGenerated: true,
            isActivity: true,
            sequenceIndex: (activityIdsByProcess.get(parentProcId)?.length ?? 0) + 1,
            activityOwner: a.owner,
            activityAction: a.action,
            activitySystem: a.system,
            activityWhen: a.when,
            activityOutput: a.output,
            activityEnables: a.enables ?? '',
            parentProcess: a.parentProcess,
          },
        });
        counts.activities++;

        // Composition: process → activity
        await createConnection(projectId, parentProcId, aId, 'composition', 'composes');
        counts.connections++;

        // Track for flow connections within same process
        if (!activityIdsByProcess.has(parentProcId)) activityIdsByProcess.set(parentProcId, []);
        activityIdsByProcess.get(parentProcId)!.push(aId);
      }

      // Flow-Connections between sibling activities
      for (const [, ids] of activityIdsByProcess) {
        for (let i = 0; i < ids.length - 1; i++) {
          await createConnection(projectId, ids[i], ids[i + 1], 'flow', 'next');
          counts.connections++;
        }
      }

      // ─── 6) Mirror Vision + Stakeholders into Project document (Phase-A bridge) ─
      try {
        const visionPatch = buildVisionPatch(body.hierarchy.vision, accept.vision !== false);
        const stakeholderDocs = buildStakeholderDocs(body.hierarchy.stakeholders, accept.stakeholders ?? []);
        await Project.findByIdAndUpdate(
          projectId,
          {
            $set: visionPatch,
            ...(stakeholderDocs.length > 0 ? { $push: { stakeholders: { $each: stakeholderDocs } } } : {}),
          },
          { new: true },
        );
      } catch (err) {
        log.warn({ err: (err as Error).message, projectId }, '[Gen-C] Project-document mirror failed (non-blocking)');
      }

      log.info({ projectId, counts }, '[Gen-C] hierarchy applied successfully');

      res.json({ success: true, counts });
    } catch (err) {
      log.error({ err, projectId }, '[Gen-C] apply-hierarchy failed');
      res.status(500).json({ error: (err as Error).message, partialCounts: counts });
    }
  },
);

// ─── Cypher helpers (Gen-C apply) ────────────────────────────────────────────

interface ElementInsert {
  projectId: string;
  id: string;
  type: string;
  name: string;
  description: string;
  layer: string;
  togafDomain: string;
  posX: number;
  posY: number;
  posZ: number;
  metadata: Record<string, unknown>;
}

async function createElement(el: ElementInsert): Promise<void> {
  await runCypher(
    `CREATE (e:ArchitectureElement {
      id: $id, projectId: $projectId, type: $type, name: $name,
      description: $description, layer: $layer, togafDomain: $togafDomain,
      maturityLevel: 3, riskLevel: 'low', status: 'target',
      posX: $posX, posY: $posY, posZ: $posZ,
      metadataJson: $metadataJson,
      createdAt: datetime(), updatedAt: datetime()
    }) RETURN e`,
    {
      id: el.id,
      projectId: el.projectId,
      type: el.type,
      name: el.name,
      description: el.description,
      layer: el.layer,
      togafDomain: el.togafDomain,
      posX: el.posX,
      posY: el.posY,
      posZ: el.posZ,
      metadataJson: JSON.stringify(el.metadata),
    },
  );
}

// Map AI hierarchy.vision into Project.vision-shape (text fields the EnvisionPanel reads)
function buildVisionPatch(
  vision: ExtractedHierarchy['vision'] & { principles?: string[]; goals?: string[] },
  accept: boolean,
): Record<string, unknown> {
  if (!accept || !vision) return {};
  const visionStatement = vision.visionStatements.join(' ').trim();
  return {
    'vision.scope': vision.mission || visionStatement.slice(0, 240),
    'vision.visionStatement': visionStatement,
    'vision.drivers': vision.drivers ?? [],
    'vision.principles': vision.principles ?? [],
    'vision.goals': vision.goals && vision.goals.length > 0 ? vision.goals : vision.visionStatements,
  };
}

const STAKEHOLDER_TYPE_MAP: Record<AIStakeholder['stakeholderType'], 'c_level' | 'business_unit' | 'it_ops' | 'data_team' | 'external'> = {
  internal: 'business_unit',
  external: 'external',
  regulator: 'external',
  customer: 'external',
  supplier: 'external',
  partner: 'external',
  investor: 'external',
  employee: 'business_unit',
  other: 'business_unit',
};

const STAKEHOLDER_ATTITUDE_MAP: Record<AIStakeholder['attitude'], 'champion' | 'supporter' | 'neutral' | 'critic'> = {
  supportive: 'supporter',
  neutral: 'neutral',
  skeptical: 'critic',
  blocker: 'critic',
};

function buildStakeholderDocs(stakeholders: AIStakeholder[], accept: boolean[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < stakeholders.length; i++) {
    if (accept[i] === false) continue;
    const s = stakeholders[i];
    // Hint: c_level for known C-suite role names
    const isC = /^(C[EOFTSI]O|Chief|Vorstand|Board)/i.test(s.name) || /^(C[EOFTSI]O|Chief)/i.test(s.role);
    out.push({
      id: uuid(),
      name: s.name,
      role: s.role,
      stakeholderType: isC ? 'c_level' : STAKEHOLDER_TYPE_MAP[s.stakeholderType],
      interests: s.interests ?? [],
      influence: s.influence,
      attitude: STAKEHOLDER_ATTITUDE_MAP[s.attitude],
    });
  }
  return out;
}

async function createConnection(
  projectId: string,
  sourceId: string,
  targetId: string,
  type: string,
  label: string,
): Promise<void> {
  await runCypher(
    `MATCH (a:ArchitectureElement {id: $sourceId, projectId: $projectId}),
           (b:ArchitectureElement {id: $targetId, projectId: $projectId})
     CREATE (a)-[r:CONNECTS_TO {id: $connId, type: $type, label: $label}]->(b)
     RETURN r`,
    { sourceId, targetId, projectId, connId: uuid(), type, label },
  );
}

export default router;
