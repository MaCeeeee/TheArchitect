import mongoose from 'mongoose';
import { Router, Request, Response } from 'express';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { SimulationRun } from '../models/SimulationRun';
import { MiroFishEngine } from '../services/mirofish/engine';
import { getDefaultPersonas, getAllPresetPersonas, PRESET_PERSONAS } from '../services/mirofish/personas';
import { CustomPersona, toAgentPersona } from '../models/CustomPersona';
import type { SimulationStreamEvent } from '@thearchitect/shared/src/types/simulation.types';

const router = Router();

// Running engines (for cancellation)
const activeEngines = new Map<string, MiroFishEngine>();

// Real-time event streams (for SSE piping)
const activeEventStreams = new Map<string, EventEmitter>();

// ─── Validation ───

const CreateSimulationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  scenarioType: z.enum([
    'cloud_migration', 'mna_integration', 'technology_refresh',
    'cost_optimization', 'org_restructure', 'custom',
  ]),
  scenarioDescription: z.string().min(10).max(5000),
  maxRounds: z.number().int().min(1).max(10).default(5),
  targetElementIds: z.array(z.string()).default([]),
  agents: z.array(z.object({
    id: z.string(),
    name: z.string(),
    stakeholderType: z.enum(['c_level', 'business_unit', 'it_ops', 'data_team', 'external']),
    visibleLayers: z.array(z.string()),
    visibleDomains: z.array(z.string()),
    maxGraphDepth: z.number().int().min(1).max(10).default(5),
    budgetConstraint: z.number().optional(),
    riskThreshold: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    expectedCapacity: z.number().int().min(1).max(20).default(5),
    roundToMonthFactor: z.number().min(0.5).max(6).optional(),
    priorities: z.array(z.string()),
    systemPromptSuffix: z.string().default(''),
  })).optional(),
});

// ─── POST / — Create and start simulation ───

router.post(
  '/:projectId/simulations',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const parsed = CreateSimulationSchema.parse(req.body);

      const agents = parsed.agents || getDefaultPersonas();

      const config = {
        agents: agents as any,
        maxRounds: parsed.maxRounds,
        targetElementIds: parsed.targetElementIds,
        scenarioDescription: parsed.scenarioDescription,
        scenarioType: parsed.scenarioType,
        name: parsed.name,
      };

      const run = await SimulationRun.create({
        projectId,
        createdBy: (req as any).user._id,
        name: parsed.name || `${parsed.scenarioType} simulation`,
        status: 'running',
        scenarioType: parsed.scenarioType,
        config,
        rounds: [],
        totalTokensUsed: 0,
        totalDurationMs: 0,
      });

      // Start simulation in background
      const engine = new MiroFishEngine();
      const runId = run._id.toString();
      activeEngines.set(runId, engine);

      // Create EventEmitter for real-time SSE piping
      const emitter = new EventEmitter();
      emitter.setMaxListeners(20);
      activeEventStreams.set(runId, emitter);

      const startTime = Date.now();

      engine
        .runSimulation(projectId, config, async (event) => {
          // Pipe ALL events to connected SSE clients in real-time
          emitter.emit('event', event);

          // Persist rounds incrementally to MongoDB
          if (event.type === 'round_end') {
            await SimulationRun.findByIdAndUpdate(run._id, {
              $set: {
                rounds: engine.getRounds(),
                totalTokensUsed: engine.getTotalTokensUsed(),
              },
            });
          }
        })
        .then(async (result) => {
          await SimulationRun.findByIdAndUpdate(run._id, {
            status: 'completed',
            result,
            rounds: engine.getRounds(),
            totalTokensUsed: engine.getTotalTokensUsed(),
            totalDurationMs: Date.now() - startTime,
          });
          activeEngines.delete(runId);
          activeEventStreams.delete(runId);
        })
        .catch(async (err) => {
          console.error('[MiroFish] Simulation failed:', err.message);
          emitter.emit('event', { type: 'error', message: err.message });
          await SimulationRun.findByIdAndUpdate(run._id, {
            status: 'failed',
            result: { error: err.message },
            totalDurationMs: Date.now() - startTime,
          });
          activeEngines.delete(runId);
          activeEventStreams.delete(runId);
        });

      res.status(201).json({
        id: run._id,
        status: 'running',
        streamUrl: `/api/projects/${projectId}/simulations/${run._id}/stream`,
      });
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: 'Invalid simulation config', details: err.errors });
      }
      console.error('[MiroFish] Create error:', err.message);
      res.status(500).json({ error: 'Failed to create simulation' });
    }
  },
);

// ─── GET / — List simulation runs ───

router.get(
  '/:projectId/simulations',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);

      const runs = await SimulationRun.find({ projectId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name status scenarioType result.outcome result.fatigue.rating rounds createdAt')
        .lean();

      const total = await SimulationRun.countDocuments({ projectId });

      const summaries = runs.map((run: any) => ({
        id: run._id,
        name: run.name,
        status: run.status,
        scenarioType: run.scenarioType,
        outcome: run.result?.outcome,
        fatigueRating: run.result?.fatigue?.rating,
        totalRounds: run.rounds?.length || 0,
        createdAt: run.createdAt,
      }));

      res.json({ runs: summaries, total, page, limit });
    } catch (err: any) {
      console.error('[MiroFish] List error:', err.message);
      res.status(500).json({ error: 'Failed to list simulations' });
    }
  },
);

// ─── GET /personas — List preset + custom personas ───
// IMPORTANT: Must be before /:runId routes to avoid "personas" matching as runId

router.get(
  '/:projectId/simulations/personas',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user._id;
      const projectId = req.params.projectId;

      const presets = getAllPresetPersonas();

      const customDocs = await CustomPersona.find({
        $or: [
          { userId, scope: 'user' },
          { projectId, scope: 'project' },
        ],
      }).lean();

      const custom = customDocs.map(toAgentPersona);

      res.json({
        presets,
        custom,
        all: [...presets, ...custom],
      });
    } catch (err: any) {
      console.error('[MiroFish] Personas error:', err.message);
      res.status(500).json({ error: 'Failed to list personas' });
    }
  },
);

// ─── Custom Persona Validation ───

const CustomPersonaSchema = z.object({
  basedOnPresetId: z.string(),
  scope: z.enum(['project', 'user']),
  name: z.string().min(1).max(100),
  stakeholderType: z.enum(['c_level', 'business_unit', 'it_ops', 'data_team', 'external']),
  visibleLayers: z.array(z.string()).min(1),
  visibleDomains: z.array(z.string()).min(1),
  maxGraphDepth: z.number().int().min(1).max(10).default(5),
  budgetConstraint: z.number().optional(),
  riskThreshold: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  expectedCapacity: z.number().int().min(1).max(20),
  roundToMonthFactor: z.number().min(0.5).max(6).optional(),
  priorities: z.array(z.string()).min(1),
  systemPromptSuffix: z.string().default(''),
  description: z.string().max(500).optional(),
});

// ─── POST /custom-personas — Create custom persona ───

router.post(
  '/:projectId/simulations/custom-personas',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const parsed = CustomPersonaSchema.parse(req.body);

      if (!PRESET_PERSONAS[parsed.basedOnPresetId]) {
        return res.status(400).json({ error: `Unknown preset: ${parsed.basedOnPresetId}` });
      }

      const doc = await CustomPersona.create({
        ...parsed,
        projectId: parsed.scope === 'project' ? req.params.projectId : undefined,
        userId: (req as any).user._id,
      });

      res.status(201).json(toAgentPersona(doc));
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: 'Invalid persona data', details: err.errors });
      }
      console.error('[MiroFish] Create persona error:', err.message);
      res.status(500).json({ error: 'Failed to create custom persona' });
    }
  },
);

// ─── GET /custom-personas — List custom personas ───

router.get(
  '/:projectId/simulations/custom-personas',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user._id;
      const projectId = req.params.projectId;

      const docs = await CustomPersona.find({
        $or: [
          { userId, scope: 'user' },
          { projectId, scope: 'project' },
        ],
      })
        .sort({ createdAt: -1 })
        .lean();

      res.json({ personas: docs.map(toAgentPersona), raw: docs });
    } catch (err: any) {
      console.error('[MiroFish] List personas error:', err.message);
      res.status(500).json({ error: 'Failed to list custom personas' });
    }
  },
);

// ─── PATCH /custom-personas/:personaId — Update custom persona ───

router.patch(
  '/:projectId/simulations/custom-personas/:personaId',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const userId = String((req as any).user._id);
      const projectId = String(req.params.projectId);

      // Scope-aware query: only find personas the user owns (user-scoped) or that belong to this project (project-scoped)
      const doc = await CustomPersona.findOne({
        _id: req.params.personaId,
        $or: [
          { scope: 'user', userId },
          { scope: 'project', projectId },
        ],
      });
      if (!doc) {
        return res.status(404).json({ error: 'Custom persona not found' });
      }

      const updates = CustomPersonaSchema.partial().parse(req.body);
      // Prevent scope/ownership escalation
      delete (updates as any).scope;
      delete (updates as any).basedOnPresetId;
      Object.assign(doc, updates);
      await doc.save();

      res.json(toAgentPersona(doc));
    } catch (err: any) {
      if (err.name === 'ZodError') {
        return res.status(400).json({ error: 'Invalid persona data', details: err.errors });
      }
      console.error('[MiroFish] Update persona error:', err.message);
      res.status(500).json({ error: 'Failed to update custom persona' });
    }
  },
);

// ─── DELETE /custom-personas/:personaId — Delete custom persona ───

router.delete(
  '/:projectId/simulations/custom-personas/:personaId',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const userId = String((req as any).user._id);
      const projectId = String(req.params.projectId);

      // Scope-aware query: only find personas the user owns (user-scoped) or that belong to this project (project-scoped)
      const doc = await CustomPersona.findOne({
        _id: req.params.personaId,
        $or: [
          { scope: 'user', userId },
          { scope: 'project', projectId },
        ],
      });
      if (!doc) {
        return res.status(404).json({ error: 'Custom persona not found' });
      }

      await doc.deleteOne();
      res.json({ deleted: true });
    } catch (err: any) {
      console.error('[MiroFish] Delete persona error:', err.message);
      res.status(500).json({ error: 'Failed to delete custom persona' });
    }
  },
);

// ─── GET /:runId — Get simulation details ───

router.get(
  '/:projectId/simulations/:runId',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const run = await SimulationRun.findOne({
        _id: req.params.runId,
        projectId: req.params.projectId,
      }).lean();

      if (!run) {
        return res.status(404).json({ error: 'Simulation run not found' });
      }

      res.json(run);
    } catch (err: any) {
      console.error('[MiroFish] Get error:', err.message);
      res.status(500).json({ error: 'Failed to get simulation' });
    }
  },
);

// ─── GET /:runId/stream — SSE stream for active simulation ───

router.get(
  '/:projectId/simulations/:runId/stream',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const run = await SimulationRun.findOne({
        _id: req.params.runId,
        projectId: req.params.projectId,
      });

      if (!run) {
        return res.status(404).json({ error: 'Simulation run not found' });
      }

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
        // Already finished — send result immediately
        if (run.result) {
          res.write(`data: ${JSON.stringify({ type: 'complete', result: run.result })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      // For running simulations, subscribe to real-time EventEmitter
      const runId = run._id.toString();
      const emitter = activeEventStreams.get(runId);

      if (!emitter) {
        // Emitter gone — simulation may have completed between checks
        const current = await SimulationRun.findById(runId).lean() as any;
        if (current?.result) {
          res.write(`data: ${JSON.stringify({ type: 'complete', result: current.result })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      // Catch-up: send already-completed rounds from MongoDB
      if (run.rounds && run.rounds.length > 0) {
        for (const round of run.rounds) {
          // Reconstruct agent_turn_complete events from stored rounds
          for (const turn of (round as any).agentTurns || []) {
            res.write(`data: ${JSON.stringify({
              type: 'agent_turn_complete',
              agentId: turn.agentPersonaId,
              agentName: turn.agentName,
              round: (round as any).roundNumber,
              reasoning: turn.reasoning,
              position: turn.position,
              validatedActions: turn.validatedActions,
              rejectedCount: turn.rejectedActions?.length || 0,
            })}\n\n`);
          }
        }
      }

      // Subscribe to live events
      const handler = (event: SimulationStreamEvent) => {
        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);

          if (event.type === 'complete' || event.type === 'error') {
            res.write('data: [DONE]\n\n');
            res.end();
            emitter.off('event', handler);
          }
        } catch {
          emitter.off('event', handler);
        }
      };

      emitter.on('event', handler);

      req.on('close', () => {
        emitter.off('event', handler);
      });
    } catch (err: any) {
      console.error('[MiroFish] Stream error:', err.message);
      res.status(500).json({ error: 'Failed to stream simulation' });
    }
  },
);

// ─── POST /:runId/cancel — Cancel running simulation ───

router.post(
  '/:projectId/simulations/:runId/cancel',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const runId = String(req.params.runId);
      const engine = activeEngines.get(runId);
      if (engine) {
        engine.cancel();
        activeEngines.delete(runId);
      }
      const emitter = activeEventStreams.get(runId);
      if (emitter) {
        emitter.emit('event', { type: 'error', message: 'Simulation cancelled' });
        activeEventStreams.delete(runId);
      }

      await SimulationRun.findByIdAndUpdate(runId, { status: 'cancelled' });
      res.json({ status: 'cancelled' });
    } catch (err: any) {
      console.error('[MiroFish] Cancel error:', err.message);
      res.status(500).json({ error: 'Failed to cancel simulation' });
    }
  },
);

// ─── DELETE /:runId — Delete simulation run ───

router.delete(
  '/:projectId/simulations/:runId',
  authenticate,
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const result = await SimulationRun.findOneAndDelete({
        _id: String(req.params.runId),
        projectId: String(req.params.projectId),
      });

      if (!result) {
        return res.status(404).json({ error: 'Simulation run not found' });
      }

      res.json({ deleted: true });
    } catch (err: any) {
      console.error('[MiroFish] Delete error:', err.message);
      res.status(500).json({ error: 'Failed to delete simulation' });
    }
  },
);

export default router;
