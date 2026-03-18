import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { generateReport, ReportType } from '../services/report.service';

const router = Router();

const VALID_TYPES: ReportType[] = ['executive', 'simulation', 'inventory'];

// GET /api/projects/:projectId/reports/:type
router.get(
  '/:projectId/reports/:type',
  authenticate,
  requireProjectAccess('viewer'),
  async (req: Request, res: Response) => {
    try {
      const projectId = req.params.projectId as string;
      const type = req.params.type as string;
      const runId = req.query.runId as string | undefined;

      if (!VALID_TYPES.includes(type as ReportType)) {
        return res.status(400).json({ error: `Invalid report type. Must be one of: ${VALID_TYPES.join(', ')}` });
      }

      if (type === 'simulation' && !runId) {
        return res.status(400).json({ error: 'runId query parameter is required for simulation reports' });
      }

      const doc = await generateReport(projectId, type as ReportType, {
        runId: runId || undefined,
      });

      const date = new Date().toISOString().split('T')[0];
      const filename = `TheArchitect-${type}-${date}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      doc.pipe(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      console.error('[Report] Generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  }
);

export default router;
