// UC-ADD-004 — AI-Generator Routes
// Generator A: Process → Activities (SSE stream)
// Generator B: Capability → Processes (SSE stream + apply)
// Generator C: PDF/Document → Full-Hierarchy (SSE stream + apply)
// Generator D: Process → Data-Objects (SSE stream + apply) — UC-DATA-001

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
  generateProcessesForCapability,
  GeneratedProcess,
  ProcessGeneratorEvent,
} from '../services/processGenerator.service';
import {
  extractArchitectureFromDocument,
  HierarchyEvent,
  ExtractedHierarchy,
  Stakeholder as AIStakeholder,
} from '../services/architectureGenerator.service';
import {
  generateDataObjectsForProcess,
  GeneratedDataObject,
  DataObjectGeneratorEvent,
} from '../services/dataObjectGenerator.service';
import { extractText, isSupportedDocument, getSupportedFormats } from '../services/document-parser.service';
import { upsertEmbedding, findSimilarElements } from '../services/elementSimilarity.service';
import { createAuditEntry } from '../middleware/audit.middleware';
import { log } from '../config/logger';
import { defaultStatusForType } from '@thearchitect/shared';
import type { ElementType } from '@thearchitect/shared';

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
      const result = await generateActivitiesForProcess({ projectId, processId, onEvent: sendEvent });
      // AC-A9: log token-cost of the generation in the project audit log
      const userId = (req as any).user?._id?.toString();
      if (userId) {
        await createAuditEntry({
          userId,
          projectId,
          action: 'ai_generate_activities',
          entityType: 'architecture_element',
          entityId: processId,
          after: {
            activitiesProposed: result.activities.length,
            tokenEstimate: result.tokenEstimate,
            durationMs: result.durationMs,
          },
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.get('user-agent') || '',
          riskLevel: 'low',
        });
      }
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

    const processedIds: string[] = [];  // every activity-id in input order — used for sequential flow
    const createdIds: string[] = [];    // newly created only
    const reused: ReusedItem[] = [];

    try {
      for (let i = 0; i < body.activities.length; i++) {
        const a = body.activities[i];
        const description = `${a.owner} ${a.action} (${a.system}) — ${a.when}. Output: ${a.output} → ermöglicht ${a.enables}.`;

        // REQ-SIM-004 Stage 3 — V2 reuse for activities. No V1-baseline,
        // no pending-confirm (would be UX-hell on a 36-activity pyramid).
        // Only SAME-tier (>=0.85) auto-reuse; everything else creates.
        let topActivityMatch: { elementId: string; name: string; type: string; score: number } | null = null;
        try {
          const sim = await findSimilarElements(String(projectId), {
            text: `${a.name} — ${description}`,
            topK: 3,
            scoreThreshold: REUSE_SAME_THRESHOLD,
          });
          const firstActivityMatch = sim.results.find((r) => r.type === 'process');
          if (firstActivityMatch) topActivityMatch = firstActivityMatch;
        } catch (e) {
          log.warn(
            { err: (e as Error).message, projectId, name: a.name },
            '[similarity] findSimilar failed in apply-activities, falling back to CREATE',
          );
        }

        let aId: string;
        if (topActivityMatch) {
          // Tier 2a — silent reuse
          aId = topActivityMatch.elementId;
          reused.push({
            originalIndex: i,
            originalName: a.name,
            reusedAs: aId,
            via: 'similarity',
            score: topActivityMatch.score,
          });
          // Composition is MERGEd (idempotent) so re-attaching to a new
          // parent process doesn't create a duplicate edge.
          await runCypher(
            `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId}),
                   (c:ArchitectureElement {id: $childId, projectId: $projectId})
             MERGE (p)-[r:CONNECTS_TO {sourceElementId: $processId, targetElementId: $childId, type: 'composition'}]->(c)
             ON CREATE SET r.id = $connId, r.label = 'composes', r.createdAt = timestamp()
             RETURN r`,
            { processId, projectId, childId: aId, connId: uuid() },
          );
        } else {
          // Tier 3 — CREATE
          aId = `${processId}-act-ai-${Date.now()}-${i + 1}`;
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

          upsertEmbedding(String(projectId), {
            id: aId,
            name: a.name,
            description,
            type: 'process',
            layer: 'business',
            projectId: String(projectId),
          }).catch((e) =>
            log.warn(
              { err: (e as Error).message, projectId, elementId: aId },
              '[similarity] upsert hook failed (ai-gen activity)',
            ),
          );

          await runCypher(
            `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId}),
                   (c:ArchitectureElement {id: $childId, projectId: $projectId})
             CREATE (p)-[r:CONNECTS_TO {id: $connId, type: 'composition', label: 'composes'}]->(c)
             RETURN r`,
            { processId, projectId, childId: aId, connId: uuid() },
          );
        }

        processedIds.push(aId);
      }

      // Sequential flow connections between siblings — operates on the
      // full ordered list (created + reused) so the pyramid wiring is
      // intact even when some activities came from prior runs.
      for (let i = 0; i < processedIds.length - 1; i++) {
        await runCypher(
          `MATCH (a:ArchitectureElement {id: $from, projectId: $projectId}),
                 (b:ArchitectureElement {id: $to, projectId: $projectId})
           MERGE (a)-[r:CONNECTS_TO {sourceElementId: $from, targetElementId: $to, type: 'flow'}]->(b)
           ON CREATE SET r.id = $connId, r.label = 'next', r.createdAt = timestamp()
           RETURN r`,
          { from: processedIds[i], to: processedIds[i + 1], projectId, connId: uuid() },
        );
      }

      log.info(
        { projectId, processId, activitiesCreated: createdIds.length, reused: reused.length },
        '[AI-Generator] activities applied successfully',
      );

      res.json({
        success: true,
        activityIds: createdIds,
        count: createdIds.length,
        // REQ-SIM-004: ids that came from similarity-reuse (already in the
        // project, attached to this new parent). Sequential flow uses both.
        reused,
        activityIdsAll: processedIds,
      });
    } catch (err) {
      log.error({ err, projectId, processId }, '[AI-Generator] apply-activities failed');
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── Generator D — Process → Data-Objects (SSE) — UC-DATA-001 ─────────────

router.post(
  '/projects/:projectId/processes/:processId/generate-data-objects',
  requireProjectAccess('viewer'),
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'aiGenerator-data-objects' }),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const processId = String(req.params.processId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: DataObjectGeneratorEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await generateDataObjectsForProcess({ projectId, processId, onEvent: sendEvent });
      const userId = (req as any).user?._id?.toString();
      if (userId) {
        await createAuditEntry({
          userId,
          projectId,
          action: 'ai_generate_data_objects',
          entityType: 'architecture_element',
          entityId: processId,
          after: {
            dataObjectsProposed: result.dataObjects.length,
            rejectedCount: result.rejectedCount,
            tokenEstimate: result.tokenEstimate,
            durationMs: result.durationMs,
          },
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.get('user-agent') || '',
          riskLevel: 'low',
        });
      }
    } catch (err) {
      log.error({ err, projectId, processId }, '[AI-Generator] data-object generation failed');
      sendEvent({ type: 'error', message: (err as Error).message });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  },
);

// ─── Apply Data-Objects (bulk persist after user-accept) — UC-DATA-001 ────

interface ApplyDataObjectsRequest {
  dataObjects: GeneratedDataObject[];
  parentX?: number;
  parentZ?: number;
}

// REQ-SIM-004 V2 reuse tiers — score thresholds inherited from the PoC
// (notebooks/predictive-poc/findings.md). Kept here so changes in the
// service constants don't silently shift the dedup behavior in Gen-D.
const REUSE_SAME_THRESHOLD = 0.85;     // silent auto-reuse
const REUSE_SIMILAR_THRESHOLD = 0.65;  // ask the user via pendingConfirm
const DATA_TYPES = ['data_object', 'data_entity', 'data_model'] as const;
type DataType = typeof DATA_TYPES[number];

interface PendingConfirmItem {
  originalIndex: number;
  original: GeneratedDataObject;
  suggestion: {
    elementId: string;
    name: string;
    type: string;
    score: number;
  };
}

interface ReusedItem {
  originalIndex: number;
  originalName: string;
  reusedAs: string;
  via: 'exact-name' | 'similarity';
  score?: number;
}

router.post(
  '/projects/:projectId/processes/:processId/apply-data-objects',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const processId = String(req.params.processId);
    const body = req.body as ApplyDataObjectsRequest;

    if (!Array.isArray(body?.dataObjects) || body.dataObjects.length === 0) {
      return res.status(400).json({ error: 'dataObjects array is required' });
    }

    const parentX = body.parentX ?? 0;
    const parentZ = body.parentZ ?? 0;
    const INFORMATION_LAYER_Y = 4; // matches LAYER_Y.information

    const createdElementIds: string[] = [];
    const createdConnectionIds: string[] = [];
    const reused: ReusedItem[] = [];
    const pendingConfirm: PendingConfirmItem[] = [];

    try {
      for (let i = 0; i < body.dataObjects.length; i++) {
        const d = body.dataObjects[i];

        // Tier 1 — V1 exact-name-match: if a data-object with this exact
        // name already exists in the project, link to it. Cheapest check,
        // always reliable, doesn't depend on the embedding stack.
        const existing = await runCypher(
          `MATCH (e:ArchitectureElement {projectId: $projectId, name: $name})
           WHERE e.type IN ['data_object', 'data_entity', 'data_model']
           RETURN e.id AS id LIMIT 1`,
          { projectId, name: d.name },
        );

        let dataObjectId: string;
        if (existing.length > 0) {
          dataObjectId = existing[0].get('id') as string;
          reused.push({
            originalIndex: i,
            originalName: d.name,
            reusedAs: dataObjectId,
            via: 'exact-name',
          });
        } else {
          // Tier 2 — V2 semantic similarity. Pull the top suggestion that
          // lives in a data-* type so we don't suggest reusing a process
          // when the user wanted a data-object.
          let topMatch: { elementId: string; name: string; type: string; score: number } | null = null;
          try {
            const sim = await findSimilarElements(String(projectId), {
              text: `${d.name}${d.description ? ` — ${d.description}` : ''}`,
              topK: 3,
              scoreThreshold: REUSE_SIMILAR_THRESHOLD,
            });
            const firstDataMatch = sim.results.find((r) =>
              (DATA_TYPES as readonly string[]).includes(r.type),
            );
            if (firstDataMatch) topMatch = firstDataMatch;
          } catch (e) {
            // Sidecar / Qdrant unavailable → fall through to CREATE. We
            // never let an embedding-stack outage block element creation.
            log.warn(
              { err: (e as Error).message, projectId, name: d.name },
              '[similarity] findSimilar failed in apply-data-objects, falling back to CREATE',
            );
          }

          // Tier 2a — SAME: silent auto-reuse, no user prompt
          if (topMatch && topMatch.score >= REUSE_SAME_THRESHOLD) {
            dataObjectId = topMatch.elementId;
            reused.push({
              originalIndex: i,
              originalName: d.name,
              reusedAs: dataObjectId,
              via: 'similarity',
              score: topMatch.score,
            });
          }
          // Tier 2b — SIMILAR: ask the user, do NOT create an element or
          // connection for this item. The frontend will collect choices
          // and re-submit via a follow-up endpoint (Stage 6).
          else if (topMatch && topMatch.score >= REUSE_SIMILAR_THRESHOLD) {
            pendingConfirm.push({
              originalIndex: i,
              original: d,
              suggestion: topMatch,
            });
            continue; // skip CREATE + access-connection for this iteration
          }
          // Tier 3 — UNIQUE: brand new, create it
          else {
          dataObjectId = `${processId}-do-ai-${Date.now()}-${i + 1}`;
          createdElementIds.push(dataObjectId);

          const metadata = {
            source: 'ai-generated',
            aiGenerated: true,
            aiGeneratedAt: new Date().toISOString(),
            aiSourceProcessId: processId,
            sensitivity: d.sensitivity,
            dataClass: d.dataClass,
          };

          // Spread data-objects horizontally next to the parent process at
          // information-layer height. V2 might do smarter graph-aware layout.
          const offsetX = parentX + (i - body.dataObjects.length / 2) * 3;

          await runCypher(
            `CREATE (e:ArchitectureElement {
              id: $id, projectId: $projectId, type: $type, name: $name,
              description: $description, layer: 'information', togafDomain: 'data',
              maturityLevel: 3, riskLevel: 'low', status: 'current',
              posX: $posX, posY: $posY, posZ: $posZ,
              metadataJson: $metadataJson,
              createdAt: datetime(), updatedAt: datetime()
            }) RETURN e`,
            {
              id: dataObjectId,
              projectId,
              type: d.archimateType,
              name: d.name,
              description: d.description,
              posX: offsetX,
              posY: INFORMATION_LAYER_Y,
              posZ: parentZ,
              metadataJson: JSON.stringify(metadata),
            },
          );

          // REQ-SIM-002: index the new data-object so future generator runs
          // can reuse-by-similarity (V2 logic in this same endpoint will
          // replace the exact-name-match path above).
          upsertEmbedding(String(projectId), {
            id: dataObjectId,
            name: d.name,
            description: d.description,
            type: d.archimateType,
            layer: 'information',
            projectId: String(projectId),
          }).catch((e) =>
            log.warn(
              { err: (e as Error).message, projectId, elementId: dataObjectId },
              '[similarity] upsert hook failed (ai-gen data-object)',
            ),
          );
          } // end Tier 3 (UNIQUE)
        } // end outer else (V2 wrapper)

        // Process --access--> Data-Object
        // Map CRUD letters to ArchiMate access type:
        //   only R     → read
        //   only W/U/D → write
        //   any combination → read-write
        const ops = d.crudOperations.toUpperCase();
        const reads = ops.includes('R');
        const writes = /[CUD]/.test(ops);
        const accessLabel = reads && writes ? 'read-write' : writes ? 'write' : 'read';

        const connectionId = uuid();
        await runCypher(
          `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId}),
                 (d:ArchitectureElement {id: $dataId, projectId: $projectId})
           MERGE (p)-[r:CONNECTS_TO {sourceElementId: $processId, targetElementId: $dataId, type: 'access'}]->(d)
           ON CREATE SET r.id = $connId, r.label = $label, r.createdAt = timestamp()
           ON MATCH  SET r.label = coalesce($label, r.label)
           RETURN r.id AS id`,
          { processId, projectId, dataId: dataObjectId, connId: connectionId, label: accessLabel },
        );
        createdConnectionIds.push(connectionId);
      }

      log.info(
        {
          projectId,
          processId,
          dataObjectsCreated: createdElementIds.length,
          connectionsCreated: createdConnectionIds.length,
          reused: reused.length,
          pendingConfirm: pendingConfirm.length,
        },
        '[AI-Generator] data-objects applied successfully',
      );

      res.json({
        success: true,
        dataObjectIds: createdElementIds,
        connectionIds: createdConnectionIds,
        count: createdElementIds.length,
        // REQ-SIM-004: V2 reuse outcome — frontend uses these to render
        // "reused N, confirm M" badges and the pending-confirm modal.
        reused,
        pendingConfirm,
      });
    } catch (err) {
      log.error({ err, projectId, processId }, '[AI-Generator] apply-data-objects failed');
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── Apply Data-Object Decisions (REQ-SIM-004 Stage 6b) ────────────────────
//
// Follow-up endpoint for items the user had to confirm:
//   - 'merge'  -> link the parent process to the suggested existing
//                 data-object (no new element, MERGE-safe access edge)
//   - 'create' -> bypass similarity-reuse and force-create the
//                 originally-proposed item (still gets an embedding)
//
// Bodies look like:
//   {
//     decisions: [
//       { originalIndex, action: 'merge',  original, suggestion: { elementId, name } },
//       { originalIndex, action: 'create', original },
//     ],
//     parentX?, parentZ?
//   }

interface ConfirmDecision {
  originalIndex: number;
  action: 'merge' | 'create';
  original: GeneratedDataObject;
  suggestion?: { elementId: string; name: string };
}

interface ApplyDataObjectDecisionsRequest {
  decisions: ConfirmDecision[];
  parentX?: number;
  parentZ?: number;
}

router.post(
  '/projects/:projectId/processes/:processId/apply-data-object-decisions',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const processId = String(req.params.processId);
    const body = req.body as ApplyDataObjectDecisionsRequest;

    if (!Array.isArray(body?.decisions) || body.decisions.length === 0) {
      return res.status(400).json({ error: 'decisions array is required' });
    }

    const parentX = body.parentX ?? 0;
    const parentZ = body.parentZ ?? 0;
    const INFORMATION_LAYER_Y = 4;

    const createdElementIds: string[] = [];
    const createdConnectionIds: string[] = [];
    const reused: ReusedItem[] = [];

    try {
      for (let i = 0; i < body.decisions.length; i++) {
        const d = body.decisions[i];
        const orig = d.original;
        if (!orig?.name) {
          return res.status(400).json({ error: `decisions[${i}] missing original.name` });
        }

        let dataObjectId: string;

        if (d.action === 'merge') {
          if (!d.suggestion?.elementId) {
            return res.status(400).json({
              error: `decisions[${i}] action=merge requires suggestion.elementId`,
            });
          }
          dataObjectId = d.suggestion.elementId;
          reused.push({
            originalIndex: d.originalIndex,
            originalName: orig.name,
            reusedAs: dataObjectId,
            via: 'similarity', // user-confirmed similarity-based merge
          });
        } else if (d.action === 'create') {
          // Force-create — bypasses the similarity check entirely. We
          // intentionally do NOT call findSimilar here because the user
          // already saw the suggestion and chose to create anyway.
          dataObjectId = `${processId}-do-ai-${Date.now()}-${i + 1}`;
          createdElementIds.push(dataObjectId);

          const metadata = {
            source: 'ai-generated',
            aiGenerated: true,
            aiGeneratedAt: new Date().toISOString(),
            aiSourceProcessId: processId,
            sensitivity: orig.sensitivity,
            dataClass: orig.dataClass,
            forceCreated: true, // audit hint: user chose create-anyway
          };

          const offsetX = parentX + (i - body.decisions.length / 2) * 3;

          await runCypher(
            `CREATE (e:ArchitectureElement {
              id: $id, projectId: $projectId, type: $type, name: $name,
              description: $description, layer: 'information', togafDomain: 'data',
              maturityLevel: 3, riskLevel: 'low', status: 'current',
              posX: $posX, posY: $posY, posZ: $posZ,
              metadataJson: $metadataJson,
              createdAt: datetime(), updatedAt: datetime()
            }) RETURN e`,
            {
              id: dataObjectId,
              projectId,
              type: orig.archimateType,
              name: orig.name,
              description: orig.description,
              posX: offsetX,
              posY: INFORMATION_LAYER_Y,
              posZ: parentZ,
              metadataJson: JSON.stringify(metadata),
            },
          );

          upsertEmbedding(String(projectId), {
            id: dataObjectId,
            name: orig.name,
            description: orig.description,
            type: orig.archimateType,
            layer: 'information',
            projectId: String(projectId),
          }).catch((e) =>
            log.warn(
              { err: (e as Error).message, projectId, elementId: dataObjectId },
              '[similarity] upsert hook failed (ai-gen force-create)',
            ),
          );
        } else {
          return res.status(400).json({
            error: `decisions[${i}] action must be "merge" or "create" (got "${d.action}")`,
          });
        }

        // Access-connection — MERGE-safe so re-running the same decision
        // doesn't double up edges. CRUD-letter mapping mirrors the
        // primary apply-data-objects route.
        const ops = orig.crudOperations.toUpperCase();
        const reads = ops.includes('R');
        const writes = /[CUD]/.test(ops);
        const accessLabel = reads && writes ? 'read-write' : writes ? 'write' : 'read';

        const connectionId = uuid();
        await runCypher(
          `MATCH (p:ArchitectureElement {id: $processId, projectId: $projectId}),
                 (d:ArchitectureElement {id: $dataId, projectId: $projectId})
           MERGE (p)-[r:CONNECTS_TO {sourceElementId: $processId, targetElementId: $dataId, type: 'access'}]->(d)
           ON CREATE SET r.id = $connId, r.label = $label, r.createdAt = timestamp()
           ON MATCH  SET r.label = coalesce($label, r.label)
           RETURN r.id AS id`,
          { processId, projectId, dataId: dataObjectId, connId: connectionId, label: accessLabel },
        );
        createdConnectionIds.push(connectionId);
      }

      log.info(
        {
          projectId,
          processId,
          decisions: body.decisions.length,
          merged: reused.length,
          created: createdElementIds.length,
        },
        '[AI-Generator] data-object decisions applied',
      );

      res.json({
        success: true,
        dataObjectIds: createdElementIds,
        connectionIds: createdConnectionIds,
        count: createdElementIds.length,
        reused,
      });
    } catch (err) {
      log.error(
        { err, projectId, processId },
        '[AI-Generator] apply-data-object-decisions failed',
      );
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ─── Generator B — Capability → Processes (SSE) ────────────────────────────

router.post(
  '/projects/:projectId/capabilities/:capabilityId/generate-processes',
  requireProjectAccess('viewer'),
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'aiGenerator-processes' }),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const capabilityId = String(req.params.capabilityId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (event: ProcessGeneratorEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await generateProcessesForCapability({ projectId, capabilityId, onEvent: sendEvent });
      const userId = (req as any).user?._id?.toString();
      if (userId) {
        await createAuditEntry({
          userId,
          projectId,
          action: 'ai_generate_processes',
          entityType: 'architecture_element',
          entityId: capabilityId,
          after: {
            processesProposed: result.processes.length,
            tokenEstimate: result.tokenEstimate,
            durationMs: result.durationMs,
          },
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.get('user-agent') || '',
          riskLevel: 'low',
        });
      }
    } catch (err) {
      log.error({ err, projectId, capabilityId }, '[AI-Generator] process generation failed');
      sendEvent({ type: 'error', message: (err as Error).message });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  },
);

// ─── Apply Processes (bulk persist after user-accept) ──────────────────────

interface ApplyProcessesRequest {
  processes: GeneratedProcess[];
  parentX?: number;
  parentZ?: number;
}

router.post(
  '/projects/:projectId/capabilities/:capabilityId/apply-processes',
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    const projectId = String(req.params.projectId);
    const capabilityId = String(req.params.capabilityId);
    const body = req.body as ApplyProcessesRequest;

    if (!Array.isArray(body?.processes) || body.processes.length === 0) {
      return res.status(400).json({ error: 'processes array is required' });
    }

    const parentX = body.parentX ?? 0;
    const parentZ = body.parentZ ?? 0;
    const Y_BUSINESS = 8;

    const createdIds: string[] = [];
    const reused: ReusedItem[] = [];

    try {
      // Layout child processes around the parent capability on the business layer.
      // Span horizontally so they don't pile on top of each other.
      const span = Math.max(20, body.processes.length * 5);
      const layoutX = (i: number, total: number) =>
        total > 1 ? parentX - span / 2 + (i / (total - 1)) * span : parentX;

      for (let i = 0; i < body.processes.length; i++) {
        const p = body.processes[i];

        // REQ-SIM-004 Stage 4 — V2 reuse for business-processes. Same
        // SAME-only-tier policy as activities (Stage 3): no V1, no
        // pending-confirm. Type filter: only 'business_process' matches
        // (so we never reuse an activity by mistake — activities are
        // type='process').
        let topProcessMatch: { elementId: string; name: string; type: string; score: number } | null = null;
        try {
          const sim = await findSimilarElements(String(projectId), {
            text: `${p.name} — ${p.description}`,
            topK: 3,
            scoreThreshold: REUSE_SAME_THRESHOLD,
          });
          const firstProcessMatch = sim.results.find((r) => r.type === 'business_process');
          if (firstProcessMatch) topProcessMatch = firstProcessMatch;
        } catch (e) {
          log.warn(
            { err: (e as Error).message, projectId, name: p.name },
            '[similarity] findSimilar failed in apply-processes, falling back to CREATE',
          );
        }

        let pId: string;
        if (topProcessMatch) {
          pId = topProcessMatch.elementId;
          reused.push({
            originalIndex: i,
            originalName: p.name,
            reusedAs: pId,
            via: 'similarity',
            score: topProcessMatch.score,
          });
          // Composition MERGE — idempotent, supports attaching the same
          // canonical process under multiple capabilities.
          await runCypher(
            `MATCH (cap:ArchitectureElement {id: $capabilityId, projectId: $projectId}),
                   (proc:ArchitectureElement {id: $procId, projectId: $projectId})
             MERGE (cap)-[r:CONNECTS_TO {sourceElementId: $capabilityId, targetElementId: $procId, type: 'composition'}]->(proc)
             ON CREATE SET r.id = $connId, r.label = 'composes', r.createdAt = timestamp()
             RETURN r`,
            { capabilityId, procId: pId, projectId, connId: uuid() },
          );
        } else {
          pId = `${capabilityId}-proc-ai-${Date.now()}-${i + 1}`;
          createdIds.push(pId);

          const metadata = {
            source: 'ai-generated',
            aiGenerated: true,
            aiGeneratedAt: new Date().toISOString(),
            parentCapability: capabilityId,
            generator: 'B',
          };

          await runCypher(
            `CREATE (e:ArchitectureElement {
              id: $id, projectId: $projectId, type: 'business_process', name: $name,
              description: $description, layer: 'business', togafDomain: 'business',
              maturityLevel: 3, riskLevel: 'low', status: 'current',
              posX: $posX, posY: $posY, posZ: $posZ,
              metadataJson: $metadataJson,
              createdAt: datetime(), updatedAt: datetime()
            }) RETURN e`,
            {
              id: pId,
              projectId,
              name: p.name,
              description: p.description,
              posX: layoutX(i, body.processes.length),
              posY: Y_BUSINESS,
              posZ: parentZ,
              metadataJson: JSON.stringify(metadata),
            },
          );

          upsertEmbedding(String(projectId), {
            id: pId,
            name: p.name,
            description: p.description,
            type: 'business_process',
            layer: 'business',
            projectId: String(projectId),
          }).catch((e) =>
            log.warn(
              { err: (e as Error).message, projectId, elementId: pId },
              '[similarity] upsert hook failed (ai-gen process)',
            ),
          );

          await runCypher(
            `MATCH (cap:ArchitectureElement {id: $capabilityId, projectId: $projectId}),
                   (proc:ArchitectureElement {id: $procId, projectId: $projectId})
             CREATE (cap)-[r:CONNECTS_TO {id: $connId, type: 'composition', label: 'composes'}]->(proc)
             RETURN r`,
            { capabilityId, procId: pId, projectId, connId: uuid() },
          );
        }
      }

      log.info(
        { projectId, capabilityId, processesCreated: createdIds.length, reused: reused.length },
        '[AI-Generator] processes applied successfully',
      );

      res.json({
        success: true,
        processIds: createdIds,
        count: createdIds.length,
        reused,
      });
    } catch (err) {
      log.error({ err, projectId, capabilityId }, '[AI-Generator] apply-processes failed');
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

      const result = await extractArchitectureFromDocument({
        projectId,
        fileBuffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        documentText,
        onEvent: sendEvent,
      });
      const userId = (req as any).user?._id?.toString();
      if (userId) {
        await createAuditEntry({
          userId,
          projectId,
          action: 'ai_generate_hierarchy',
          entityType: 'architecture_hierarchy',
          entityId: file.originalname,
          after: {
            fileName: file.originalname,
            fileSize: file.size,
            documentChars: documentText.length,
            tokenEstimate: result.tokenEstimate,
            durationMs: result.durationMs,
            counts: {
              visionStatements: result.hierarchy.vision.visionStatements.length,
              stakeholders: result.hierarchy.stakeholders.length,
              capabilities: result.hierarchy.capabilities.length,
              processes: result.hierarchy.processes.length,
              activities: result.hierarchy.activities.length,
            },
          },
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.get('user-agent') || '',
          riskLevel: 'medium',
        });
      }
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
    const counts = { goals: 0, drivers: 0, stakeholders: 0, capabilities: 0, processes: 0, activities: 0, connections: 0 };

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

      // ─── 1.5) Drivers (ArchiMate Motivation Layer) ────────────────────
      // Without this loop, drivers extracted from the PDF were only stored
      // as text strings on Project.vision.drivers — they showed up in the
      // Envision panel but never as real architecture elements in Neo4j,
      // so the 3D scene + sidebar showed 0 drivers and the realization
      // chain (Driver → Goal → Capability → Process) had no roots.
      if (accept.vision !== false) {
        const drivers = body.hierarchy.vision.drivers ?? [];
        for (let i = 0; i < drivers.length; i++) {
          const d = drivers[i];
          if (!d || !d.trim()) continue;
          await createElement({
            projectId,
            id: `ai-drv-${Date.now()}-${i}`,
            type: 'driver',
            name: d.length > 100 ? d.slice(0, 97) + '…' : d,
            description: d,
            layer: 'motivation',
            togafDomain: 'motivation',
            posX: layoutX(i, drivers.length, 22),
            posY: Y_MOTIVATION,
            posZ: -14,
            metadata: { source: 'ai-generated', aiGenerated: true, kind: 'driver' },
          });
          counts.drivers++;
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
        // realCId may differ from the proposed id when createElement
        // resolves a similar pre-existing capability (REQ-SIM-004 Stage 5).
        const realCId = await createElement({
          projectId,
          id: `ai-cap-${Date.now()}-${i}`,
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
        capabilityIdByName.set(c.name, realCId);
        counts.capabilities++;
      }

      // ─── 4) Processes ──────────────────────────────────────────────────
      const pList = body.hierarchy.processes;
      for (let i = 0; i < pList.length; i++) {
        if (accept.processes && accept.processes[i] === false) continue;
        const p = pList[i];
        const realPId = await createElement({
          projectId,
          id: `ai-proc-${Date.now()}-${i}`,
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
        processIdByName.set(p.name, realPId);
        counts.processes++;

        // Composition: capability → process (createConnection is MERGE-safe)
        const capId = capabilityIdByName.get(p.parentCapability);
        if (capId) {
          await createConnection(projectId, capId, realPId, 'composition', 'composes');
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

        const realAId = await createElement({
          projectId,
          id: `ai-act-${Date.now()}-${i}`,
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

        // Composition: process → activity (MERGE-safe via createConnection)
        await createConnection(projectId, parentProcId, realAId, 'composition', 'composes');
        counts.connections++;

        // Track the real id for flow connections so reused activities
        // are correctly wired into the sequential chain.
        if (!activityIdsByProcess.has(parentProcId)) activityIdsByProcess.set(parentProcId, []);
        activityIdsByProcess.get(parentProcId)!.push(realAId);
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

/**
 * Create-or-reuse an architecture element.
 *
 * REQ-SIM-004 Stage 5: returns the final element id — which may be the
 * caller-proposed `el.id` (newly created) or the id of an existing
 * element when similarity ≥ 0.85 with a same-type match is found.
 *
 * The reuse policy here mirrors activities/processes (Stages 3+4):
 * SAME-only auto-reuse, no pending-confirm, type-filter == el.type
 * so we never reuse a stakeholder as a capability.
 *
 * Callers that need the returned id for parent-child linking
 * (capabilities → processes → activities) must use the returned value
 * rather than the proposed `el.id`.
 */
async function createElement(el: ElementInsert): Promise<string> {
  // SAME-tier similarity check — same-type only.
  let topMatch: { elementId: string; type: string; score: number } | null = null;
  try {
    const sim = await findSimilarElements(String(el.projectId), {
      text: `${el.name} — ${el.description}`,
      topK: 3,
      scoreThreshold: REUSE_SAME_THRESHOLD,
    });
    const firstMatch = sim.results.find((r) => r.type === el.type);
    if (firstMatch) topMatch = firstMatch;
  } catch (e) {
    log.warn(
      { err: (e as Error).message, projectId: el.projectId, name: el.name, type: el.type },
      '[similarity] findSimilar failed in createElement, falling back to CREATE',
    );
  }

  if (topMatch) {
    log.debug(
      { projectId: el.projectId, proposedId: el.id, reusedId: topMatch.elementId, score: topMatch.score, type: el.type },
      '[similarity] reused element in createElement (Stage 5)',
    );
    return topMatch.elementId;
  }

  // Status follows ArchiMate semantics: stakeholders/principles/drivers etc.
  // exist today (`current`); goals/outcomes/work_packages are aspirations
  // (`target`). Capabilities/processes/components default to `current` because
  // the source document typically describes the as-is architecture.
  const status = defaultStatusForType(el.type as ElementType);
  // Maturity mirrors status: target = nascent (2), current = established (3).
  const maturityLevel = status === 'target' ? 2 : 3;
  await runCypher(
    `CREATE (e:ArchitectureElement {
      id: $id, projectId: $projectId, type: $type, name: $name,
      description: $description, layer: $layer, togafDomain: $togafDomain,
      maturityLevel: $maturityLevel, riskLevel: 'low', status: $status,
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
      status,
      maturityLevel,
      posX: el.posX,
      posY: el.posY,
      posZ: el.posZ,
      metadataJson: JSON.stringify(el.metadata),
    },
  );

  // REQ-SIM-002: index the new element so all 7 callers of this helper
  // (Gen-C hierarchy) populate the similarity store.
  upsertEmbedding(String(el.projectId), {
    id: el.id,
    name: el.name,
    description: el.description,
    type: el.type,
    layer: el.layer,
    projectId: String(el.projectId),
  }).catch((e) =>
    log.warn(
      { err: (e as Error).message, projectId: el.projectId, elementId: el.id },
      '[similarity] upsert hook failed (ai-gen hierarchy)',
    ),
  );

  return el.id;
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
  // MERGE (not CREATE) — Stage 5 of REQ-SIM-004 introduces helper-level
  // reuse so the same target node can be re-linked under multiple parents
  // across generator runs. With CREATE that would emit duplicate edges.
  await runCypher(
    `MATCH (a:ArchitectureElement {id: $sourceId, projectId: $projectId}),
           (b:ArchitectureElement {id: $targetId, projectId: $projectId})
     MERGE (a)-[r:CONNECTS_TO {sourceElementId: $sourceId, targetElementId: $targetId, type: $type}]->(b)
     ON CREATE SET r.id = $connId, r.label = $label, r.createdAt = timestamp()
     RETURN r`,
    { sourceId, targetId, projectId, connId: uuid(), type, label },
  );
}

export default router;
