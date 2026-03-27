import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { createAuditEntry } from '../middleware/audit.middleware';

const router = Router();

router.use(authenticate);
router.use(requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS));

// List users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await User.find()
      .select('-passwordHash -mfaSecret')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(users);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Update user role
router.put('/users/:uid/role', requirePermission(PERMISSIONS.ADMIN_SYSTEM_CONFIG), async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    const validRoles = ['chief_architect', 'enterprise_architect', 'solution_architect', 'data_architect', 'business_architect', 'analyst', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Prevent removing the last chief_architect
    if (role !== 'chief_architect') {
      const target = await User.findById(req.params.uid).select('role').lean();
      if (target?.role === 'chief_architect') {
        const chiefCount = await User.countDocuments({ role: 'chief_architect' });
        if (chiefCount <= 1) {
          return res.status(400).json({
            error: 'Cannot demote the last Chief Architect. Promote another user first.',
          });
        }
      }
    }

    const user = await User.findByIdAndUpdate(req.params.uid, { role }, { new: true })
      .select('-passwordHash -mfaSecret');
    if (!user) return res.status(404).json({ error: 'User not found' });

    await createAuditEntry({
      userId: req.user!._id.toString(),
      action: 'change_user_role',
      entityType: 'user',
      entityId: String(req.params.uid),
      after: { role },
      riskLevel: 'high',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json(user);
  } catch (err) {
    console.error('Update user role error:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Build audit log filter from query params
async function buildAuditFilter(query: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { action, entityType, userId, riskLevel, startDate, endDate, userSearch } = query;
  const filter: Record<string, unknown> = {};

  if (action) filter.action = String(action);
  if (entityType) filter.entityType = String(entityType);
  if (userId) filter.userId = String(userId);
  if (riskLevel) filter.riskLevel = String(riskLevel);

  if (startDate || endDate) {
    const tsFilter: Record<string, Date> = {};
    if (startDate) tsFilter.$gte = new Date(String(startDate));
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      tsFilter.$lte = end;
    }
    filter.timestamp = tsFilter;
  }

  if (userSearch) {
    const regex = new RegExp(String(userSearch), 'i');
    const matchingUsers = await User.find(
      { $or: [{ name: regex }, { email: regex }] }
    ).select('_id').limit(50).lean();
    filter.userId = { $in: matchingUsers.map((u) => u._id) };
  }

  return filter;
}

// Get audit logs
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const { limit = '100', offset = '0' } = req.query;
    const filter = await buildAuditFilter(req.query as Record<string, unknown>);

    const parsedLimit = Math.min(parseInt(limit as string), 500);
    const parsedOffset = parseInt(offset as string);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(parsedOffset)
        .limit(parsedLimit)
        .populate('userId', 'name email')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ data: logs, total, limit: parsedLimit, offset: parsedOffset });
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

// Audit log stats (aggregated counts by risk level)
router.get('/audit-log/stats', async (_req: Request, res: Response) => {
  try {
    const results = await AuditLog.aggregate([
      { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    ]);
    const stats: Record<string, number> = { total: 0, low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of results) {
      const level = r._id || 'low';
      stats[level] = r.count;
      stats.total += r.count;
    }
    res.json(stats);
  } catch (err) {
    console.error('Audit log stats error:', err);
    res.status(500).json({ error: 'Failed to get audit log stats' });
  }
});

// Export audit logs as CSV
router.get('/audit-log/export', async (req: Request, res: Response) => {
  try {
    const filter = await buildAuditFilter(req.query as Record<string, unknown>);

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(10000)
      .populate('userId', 'name email')
      .lean();

    const header = 'Timestamp,User,Email,Action,Entity Type,Entity ID,Risk Level,IP\n';
    const rows = logs.map((log) => {
      const user = log.userId as unknown as { name?: string; email?: string } | null;
      const name = (user && typeof user === 'object' ? user.name : '') || '';
      const email = (user && typeof user === 'object' ? user.email : '') || '';
      const ts = new Date(log.timestamp).toISOString();
      const escapeCsv = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;
      return [ts, escapeCsv(name), escapeCsv(email), log.action, log.entityType, log.entityId || '', log.riskLevel || 'low', log.ip || ''].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(header + rows);
  } catch (err) {
    console.error('Export audit log error:', err);
    res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

export default router;
