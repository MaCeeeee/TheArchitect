import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { assessAcceptanceRisk } from '../services/oracle.service';
import { generateAlternatives } from '../services/scenario-generator.service';
import { OracleAssessment } from '../models/OracleAssessment';
import { Project } from '../models/Project';
import { generateReport } from '../services/report.service';

const router = Router();

function buildReportFilename(projectName: string, assessmentId: string, format: string): string {
  const safe = (projectName || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shortId = assessmentId.slice(-8);
  return `TA-ORA_${safe}_${date}_${shortId}.${format}`;
}

// ─── Validation ───

const CustomStakeholderSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(200),
  stakeholderType: z.string().min(1).max(50),
  weight: z.enum(['voting', 'advisory']),
  riskThreshold: z.enum(['low', 'medium', 'high']),
  priorities: z.array(z.string().max(50)).min(1).max(5),
  visibleLayers: z.array(z.string()).min(1),
  context: z.string().max(500).optional(),
});

const OracleProposalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(3000),
  affectedElementIds: z.array(z.string()).min(1),
  changeType: z.enum(['retire', 'migrate', 'consolidate', 'introduce', 'modify']),
  estimatedCost: z.number().min(0).optional(),
  estimatedDuration: z.number().min(1).max(120).optional(),
  targetScenarioId: z.string().optional(),
  customStakeholders: z.array(CustomStakeholderSchema).max(5).optional(),
});

// ─── POST /:projectId/oracle/assess ───

router.post(
  '/:projectId/oracle/assess',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);

      // Validate input
      const parsed = OracleProposalSchema.parse(req.body);

      // Build user context for audit trail (EU AI Act Art. 12)
      const user = (req as any).user;
      const userContext = {
        userId: String(user._id),
        userName: String(user.name || ''),
        userEmail: String(user.email || ''),
        authMethod: ((req as any).authMethod || 'jwt') as 'api_key' | 'jwt' | 'oauth',
        apiKeyPrefix: (req as any).apiKeyPrefix,
      };

      // Run assessment
      const verdict = await assessAcceptanceRisk(projectId, parsed, userContext);

      // Persist to MongoDB
      const saved = await OracleAssessment.create({
        projectId,
        userId: (req as any).user._id,
        proposal: parsed,
        verdict,
      });

      res.json({ success: true, data: verdict, assessmentId: String(saved._id) });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: err.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }

      if (err instanceof Error && err.message === 'NO_AI_KEY') {
        res.status(503).json({
          success: false,
          error: 'No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.',
        });
        return;
      }

      console.error('[Oracle] Assessment error:', err);
      res.status(500).json({ success: false, error: 'Oracle assessment failed' });
    }
  },
);

// ─── GET /:projectId/oracle/history ───

router.get(
  '/:projectId/oracle/history',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);

      const assessments = await OracleAssessment.find({ projectId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      res.json({
        success: true,
        data: assessments.map((a) => ({
          id: a._id,
          proposal: a.proposal,
          verdict: a.verdict,
          generatedAlternatives: a.generatedAlternatives || null,
          userId: a.userId,
          createdAt: a.createdAt,
        })),
      });
    } catch (err) {
      console.error('[Oracle] History error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch oracle history' });
    }
  },
);

// ─── GET /:projectId/oracle/:assessmentId/report/pdf ───

router.get(
  '/:projectId/oracle/:assessmentId/report/pdf',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const assessmentId = String(req.params.assessmentId);

      const project = await Project.findById(projectId).select('name').lean();
      const filename = buildReportFilename(project?.name || 'Project', assessmentId, 'pdf');

      const doc = await generateReport(projectId, 'oracle', { assessmentId });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      doc.pipe(res);
    } catch (err: any) {
      console.error('[Oracle] PDF report error:', err);
      res.status(err.message?.includes('not found') ? 404 : 500)
        .json({ success: false, error: err.message || 'PDF generation failed' });
    }
  },
);

// ─── GET /:projectId/oracle/:assessmentId/report/json ───

router.get(
  '/:projectId/oracle/:assessmentId/report/json',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const assessmentId = String(req.params.assessmentId);

      const assessment = await OracleAssessment.findOne({ _id: assessmentId, projectId }).lean();
      if (!assessment) {
        return res.status(404).json({ success: false, error: 'Assessment not found' });
      }

      const verdict = assessment.verdict as Record<string, unknown>;
      const audit = verdict.auditReport as Record<string, unknown> | undefined;
      const agentVerdicts = (verdict.agentVerdicts || []) as Array<Record<string, unknown>>;

      // Structured JSON for database import — EU AI Act & Jasper-compliant audit trail
      const agentReports = (audit?.agentReports || agentVerdicts) as Array<Record<string, unknown>>;

      const report = {
        _schema: 'oracle_acceptance_risk_assessment',
        _version: '2.0',
        _compliance: ['EU AI Act 2024/1689', 'EU Data Act 2023/2854'],
        _exportedAt: new Date().toISOString(),

        // ─── Assessment Metadata ───
        assessment: {
          id: String(assessment._id),
          projectId: String(assessment.projectId),
          userId: String(assessment.userId),
          createdAt: assessment.createdAt,
        },

        // ─── EU AI Act Art. 6-7: System Risk Classification ───
        systemRiskClassification: audit?.systemRiskClassification || {
          euAiActLevel: 'limited',
          justification: 'AI-assisted decision support — not classified prior to v2.0',
          humanOversightRequired: true,
          articleReference: 'EU AI Act 2024/1689, Art. 6(2), Art. 52(1)',
        },

        // ─── EU AI Act Art. 14: Human Oversight ───
        humanOversight: audit?.humanOversight || { status: 'pending_review' },

        // ─── EU AI Act Art. 12: Initiator Identity (DSGVO Art. 6(1)(c)) ───
        initiator: audit?.initiator || {
          userId: String(assessment.userId),
          note: 'Detailed initiator info not available (assessment predates v2.0)',
        },

        // ─── Jasper Principle: Context Snapshot ───
        contextSnapshot: audit?.contextSnapshot || null,

        // ─── Input: Proposal + Affected Elements (Art. 10: Input Data) ───
        proposal: {
          ...(assessment.proposal as Record<string, unknown>),
          affectedElements: audit
            ? (audit.proposal as Record<string, unknown>)?.affectedElements
            : undefined,
        },

        // ─── Output: Assessment Result ───
        result: {
          acceptanceRiskScore: verdict.acceptanceRiskScore,
          riskLevel: verdict.riskLevel,
          overallPosition: verdict.overallPosition,
          durationMs: verdict.durationMs,
        },

        // ─── Art. 13-14: Per-Agent Decision Traces ───
        stakeholderVerdicts: agentReports.map((a) => ({
          // Identity & role
          personaId: a.personaId,
          personaName: a.personaName,
          stakeholderType: a.stakeholderType,
          riskThreshold: a.riskThreshold,
          budgetConstraint: a.budgetConstraint,
          expectedCapacity: a.expectedCapacity,
          priorities: a.priorities,
          visibleLayers: a.visibleLayers,
          // Decision
          position: a.position,
          acceptanceScore: a.acceptanceScore,
          reasoning: a.reasoning,
          concerns: a.concerns,
          weight: a.weight,
          weightedRiskContribution: a.weightedRiskContribution,
          // ─── Full Decision Trace (Art. 13: Transparency) ───
          decisionTrace: {
            systemPrompt: a.systemPrompt || null,
            rawResponse: a.rawResponse || null,
            architectureContext: a.architectureContext || null,
            modelParams: a.modelParams || null,
          },
        })),

        // ─── Aggregated Analysis ───
        resistanceFactors: verdict.resistanceFactors,
        mitigationSuggestions: verdict.mitigationSuggestions,
        fatigueForecast: verdict.fatigueForecast,

        // ─── Scoring Methodology ───
        scoring: audit?.scoring || {
          method: 'weighted_stakeholder_average',
          rawScore: verdict.acceptanceRiskScore,
          roundedScore: verdict.acceptanceRiskScore,
          riskLevel: verdict.riskLevel,
          overallPosition: verdict.overallPosition,
        },

        // ─── Art. 13 Annex IV: LLM Provider & Model ───
        llm: {
          provider: audit?.provider || 'unknown',
          model: audit?.model || 'unknown',
        },
      };

      const proj = await Project.findById(projectId).select('name').lean();
      const filename = buildReportFilename(proj?.name || 'Project', assessmentId, 'json');

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(report);
    } catch (err: any) {
      console.error('[Oracle] JSON report error:', err);
      res.status(500).json({ success: false, error: err.message || 'JSON export failed' });
    }
  },
);

// ─── POST /:projectId/oracle/:assessmentId/generate-alternatives ───

const GeneratorOptionsSchema = z.object({
  maxAlternatives: z.number().min(1).max(5).optional(),
  focusStakeholders: z.array(z.string()).optional(),
  preserveChangeType: z.boolean().optional(),
  autoAssess: z.boolean().optional(),
}).optional();

router.post(
  '/:projectId/oracle/:assessmentId/generate-alternatives',
  authenticate,
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.ANALYTICS_SIMULATE),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const assessmentId = String(req.params.assessmentId);

      const assessment = await OracleAssessment.findOne({ _id: assessmentId, projectId }).lean();
      if (!assessment) {
        return res.status(404).json({ success: false, error: 'Assessment not found' });
      }

      const options = GeneratorOptionsSchema.parse(req.body) || {};

      const result = await generateAlternatives(
        projectId,
        {
          _id: String(assessment._id),
          proposal: assessment.proposal as any,
          verdict: assessment.verdict as any,
        },
        options,
      );

      // Persist generated alternatives on the assessment
      await OracleAssessment.updateOne(
        { _id: assessmentId },
        { $set: { generatedAlternatives: result.alternatives } },
      );

      res.json({ success: true, data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
        });
        return;
      }

      if (err instanceof Error && err.message === 'NO_AI_KEY') {
        res.status(503).json({
          success: false,
          error: 'No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.',
        });
        return;
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[Oracle] Generate alternatives error:', errMsg, err);
      res.status(500).json({ success: false, error: `Generation failed: ${errMsg}` });
    }
  },
);

export default router;
