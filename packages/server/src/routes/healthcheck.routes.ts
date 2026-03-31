/**
 * Health Check Routes — PUBLIC (no authentication required).
 * Provides upload + scan endpoints for the standalone AI Advisor Health Check.
 *
 * REQ-AHS-001.1: Upload-Pipeline für Architektur-Artefakte
 * REQ-AHS-001.2: Advisor-Scan ohne Authentifizierung
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import Redis from 'ioredis';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { v4 as uuid } from 'uuid';
import {
  parseArchitectureFile,
  createTemporaryGraph,
} from '../services/upload.service';
import { runAdvisorScan } from '../services/advisor.service';
import { runCypher } from '../config/neo4j';
import { HealthReport } from '../models/HealthReport';

const router = Router();

// ─── Redis for upload token storage ───

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    redis.connect().catch(() => {
      console.warn('[HealthCheck] Redis not available — using in-memory token store');
      redis = null;
    });
  }
  return redis!;
}

// In-memory fallback if Redis is unavailable
const tokenStore = new Map<string, { projectId: string; createdAt: number }>();

async function storeToken(token: string, projectId: string, ttlSeconds: number): Promise<void> {
  try {
    const r = getRedis();
    if (r) {
      await r.set(`healthcheck:${token}`, projectId, 'EX', ttlSeconds);
      return;
    }
  } catch { /* fallback */ }
  tokenStore.set(token, { projectId, createdAt: Date.now() });
}

async function resolveToken(token: string): Promise<string | null> {
  try {
    const r = getRedis();
    if (r) {
      return await r.get(`healthcheck:${token}`);
    }
  } catch { /* fallback */ }
  const entry = tokenStore.get(token);
  if (!entry) return null;
  // 24h TTL check
  if (Date.now() - entry.createdAt > 24 * 60 * 60 * 1000) {
    tokenStore.delete(token);
    return null;
  }
  return entry.projectId;
}

// ─── Multer config (10MB limit) ───

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per REQ-AHS-001.1 AC-4
});

function handleUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ─── Rate Limiting: 5 uploads and 5 scans per IP per hour ───

const isDev = process.env.NODE_ENV !== 'production';
const uploadRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: isDev ? 100 : 5, name: 'healthcheck-upload' });
const scanRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: isDev ? 100 : 5, name: 'healthcheck-scan' });

// ─── POST /api/healthcheck/upload ───

router.post('/upload', uploadRateLimit, async (req: Request, res: Response) => {
  try {
    await handleUpload(req, res);
  } catch (err: any) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'FILE_TOO_LARGE',
        message: 'File exceeds the 10MB limit.',
      });
    }
    return res.status(400).json({
      success: false,
      error: 'UPLOAD_ERROR',
      message: err.message || 'File upload failed.',
    });
  }

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'NO_FILE',
      message: 'No file provided. Send a file as multipart form-data with field name "file".',
    });
  }

  try {
    const parsed = parseArchitectureFile(req.file.buffer, req.file.originalname);

    // Guard against resource exhaustion — limit element/connection count
    const MAX_ELEMENTS = 2000;
    const MAX_CONNECTIONS = 5000;
    if (parsed.elements.length > MAX_ELEMENTS) {
      return res.status(422).json({
        success: false,
        error: 'TOO_MANY_ELEMENTS',
        message: `File contains ${parsed.elements.length} elements (max ${MAX_ELEMENTS}). Use the full import after registration.`,
      });
    }
    if (parsed.connections.length > MAX_CONNECTIONS) {
      return res.status(422).json({
        success: false,
        error: 'TOO_MANY_CONNECTIONS',
        message: `File contains ${parsed.connections.length} connections (max ${MAX_CONNECTIONS}).`,
      });
    }

    if (parsed.elements.length === 0) {
      return res.status(422).json({
        success: false,
        error: 'NO_ELEMENTS',
        message: `Could not extract any architecture elements from the file (detected format: ${parsed.format}). ` +
          'Expected architecture data — CSV/Excel with name & type columns, ArchiMate XML, LeanIX export, or JSON with {elements: [...]}.',
        warnings: parsed.warnings,
      });
    }

    const { projectId, uploadToken } = await createTemporaryGraph(parsed);

    // Store token → projectId mapping (24h TTL)
    await storeToken(uploadToken, projectId, 24 * 60 * 60);

    return res.status(201).json({
      success: true,
      data: {
        uploadToken,
        elementCount: parsed.elements.length,
        connectionCount: parsed.connections.length,
        format: parsed.format,
        warnings: parsed.warnings,
      },
    });
  } catch (err: any) {
    if (err.message?.includes('Unsupported file format')) {
      return res.status(422).json({
        success: false,
        error: 'UNSUPPORTED_FORMAT',
        message: err.message,
      });
    }
    console.error('[HealthCheck] Upload error:', err);
    return res.status(500).json({
      success: false,
      error: 'PROCESSING_ERROR',
      message: `Failed to process the uploaded file. Ensure it contains valid architecture data (CSV/Excel with name & type columns, ArchiMate XML, LeanIX export, or JSON with {elements: [...], connections: [...]}).`,
    });
  }
});

// ─── POST /api/healthcheck/scan ───

router.post('/scan', scanRateLimit, async (req: Request, res: Response) => {
  const { uploadToken } = req.body;

  if (!uploadToken || typeof uploadToken !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'MISSING_TOKEN',
      message: 'Provide an "uploadToken" in the request body.',
    });
  }

  // Resolve token → projectId
  const projectId = await resolveToken(uploadToken);
  if (!projectId) {
    return res.status(404).json({
      success: false,
      error: 'TOKEN_NOT_FOUND',
      message: 'Upload token is invalid or expired.',
    });
  }

  try {
    const result = await runAdvisorScan(projectId);

    // Compute element stats for the report
    const elemRecords = await runCypher(
      `MATCH (e:ArchitectureElement {projectId: $projectId})
       RETURN e.layer as layer, e.status as status, e.type as type`,
      { projectId },
    );
    const byLayer: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    for (const r of elemRecords) {
      const layer = r.get('layer') || 'other';
      const status = r.get('status') || 'current';
      const type = r.get('type') || 'unknown';
      byLayer[layer] = (byLayer[layer] || 0) + 1;
      byStatus[status] = (byStatus[status] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
    }

    // Create a shareable report (30-day TTL)
    const reportId = uuid();
    await HealthReport.create({
      reportId,
      uploadToken,
      tempProjectId: projectId,
      healthScore: result.healthScore,
      insights: result.insights.slice(0, 10).map((ins) => ({
        category: ins.category,
        severity: ins.severity,
        title: ins.title,
        description: ins.description,
        affectedCount: ins.affectedElements?.length || 0,
      })),
      totalElements: result.totalElements,
      scanDurationMs: result.scanDurationMs,
      elementStats: { byLayer, byStatus, byType },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return res.json({
      success: true,
      data: {
        healthScore: result.healthScore,
        insights: result.insights,
        totalElements: result.totalElements,
        scanDurationMs: result.scanDurationMs,
        uploadToken,
        reportId,
      },
    });
  } catch (err) {
    console.error('[HealthCheck] Scan error:', err);
    return res.status(500).json({
      success: false,
      error: 'SCAN_ERROR',
      message: 'Health check scan failed.',
    });
  }
});

// ─── GET /api/healthcheck/status/:token — Check if upload token is valid ───

router.get('/status/:token', async (req: Request, res: Response) => {
  const projectId = await resolveToken(String(req.params.token));
  if (!projectId) {
    return res.status(404).json({ success: false, error: 'TOKEN_NOT_FOUND' });
  }
  return res.json({ success: true, data: { valid: true, uploadToken: req.params.token } });
});

// ─── GET /api/healthcheck/report/:reportId — Public report data ───

router.get('/report/:reportId', async (req: Request, res: Response) => {
  const report = await HealthReport.findOne({ reportId: String(req.params.reportId) });
  if (!report) {
    return res.status(404).json({ success: false, error: 'REPORT_NOT_FOUND', message: 'Report not found or expired.' });
  }
  return res.json({
    success: true,
    data: {
      reportId: report.reportId,
      healthScore: report.healthScore,
      insights: report.insights,
      totalElements: report.totalElements,
      scanDurationMs: report.scanDurationMs,
      elementStats: report.elementStats,
      createdAt: report.createdAt,
      expiresAt: report.expiresAt,
    },
  });
});

export default router;
