import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';

const router = Router();

router.use(authenticate);
router.use(requireRole('chief_architect', 'enterprise_architect'));

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
router.put('/users/:uid/role', requireRole('chief_architect'), async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    const validRoles = ['chief_architect', 'enterprise_architect', 'data_architect', 'business_architect', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
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

// Get audit logs
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const { action, entityType, userId, limit = '100', offset = '0' } = req.query;

    const filter: Record<string, unknown> = {};
    if (action) filter.action = String(action);
    if (entityType) filter.entityType = String(entityType);
    if (userId) filter.userId = String(userId);

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(parseInt(offset as string))
      .limit(Math.min(parseInt(limit as string), 500))
      .populate('userId', 'name email')
      .lean();

    const total = await AuditLog.countDocuments(filter);

    res.json({ data: logs, total, limit: parseInt(limit as string), offset: parseInt(offset as string) });
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

export default router;
