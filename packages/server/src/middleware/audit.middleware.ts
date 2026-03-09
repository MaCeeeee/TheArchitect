import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/AuditLog';

interface AuditOptions {
  action: string;
  entityType: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  getEntityId?: (req: Request) => string;
  getBefore?: (req: Request) => Record<string, unknown>;
  getAfter?: (req: Request, resBody: unknown) => Record<string, unknown>;
}

export function audit(options: AuditOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const logEntry = {
          userId: req.user._id,
          projectId: req.params.id || req.params.projectId,
          action: options.action,
          entityType: options.entityType,
          entityId: options.getEntityId?.(req) || req.params.eid || req.params.cid || '',
          before: options.getBefore?.(req) || {},
          after: options.getAfter?.(req, body) || {},
          ip: req.ip || req.socket.remoteAddress || '',
          userAgent: req.get('user-agent') || '',
          riskLevel: options.riskLevel || 'low',
        };

        AuditLog.create(logEntry).catch((err) => {
          console.error('[Audit] Failed to create log entry:', err.message);
        });
      }

      return originalJson(body);
    } as typeof res.json;

    next();
  };
}

export async function createAuditEntry(params: {
  userId: string;
  projectId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  riskLevel?: string;
}) {
  try {
    await AuditLog.create({
      ...params,
      riskLevel: params.riskLevel || 'low',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[Audit] Failed to create log entry:', err);
  }
}
