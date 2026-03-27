import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { User } from '../models/User';
import { ApiKey } from '../models/ApiKey';
import { getRedis } from '../config/redis';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /profile
router.get('/profile', async (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    name: user.name,
    email: user.email,
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
    oauthProviders: user.oauthProviders.map((p) => ({
      provider: p.provider,
      email: p.email,
      linkedAt: p.linkedAt,
    })),
  });
});

// PUT /profile
router.put('/profile', async (req: Request, res: Response) => {
  const { name, bio, avatarUrl } = req.body;
  const user = req.user!;

  if (name !== undefined) user.name = name.trim();
  if (bio !== undefined) user.bio = bio;
  if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

  await user.save();

  await createAuditEntry({
    userId: String(user._id),
    action: 'settings.profile.update',
    entityType: 'user',
    entityId: String(user._id),
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  res.json({ name: user.name, bio: user.bio, avatarUrl: user.avatarUrl });
});

// PUT /password
router.put('/password', async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  // Reload user with passwordHash
  const user = await User.findById(req.user!._id);
  if (!user || !user.passwordHash) {
    return res.status(400).json({ error: 'Password change not available for OAuth-only accounts' });
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  await createAuditEntry({
    userId: String(user._id),
    action: 'settings.password.change',
    entityType: 'user',
    entityId: String(user._id),
    riskLevel: 'high',
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  res.json({ message: 'Password updated successfully' });
});

// DELETE /account
router.delete('/account', async (req: Request, res: Response) => {
  const { password } = req.body;

  const user = await User.findById(req.user!._id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.passwordHash) {
    if (!password) return res.status(400).json({ error: 'Password confirmation required' });
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Password is incorrect' });
  }

  await createAuditEntry({
    userId: String(user._id),
    action: 'settings.account.delete',
    entityType: 'user',
    entityId: String(user._id),
    riskLevel: 'critical',
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  await ApiKey.deleteMany({ userId: user._id });
  await User.findByIdAndDelete(user._id);

  res.json({ message: 'Account deleted' });
});

// GET /preferences
router.get('/preferences', async (req: Request, res: Response) => {
  const user = req.user!;
  res.json(user.preferences);
});

// PUT /preferences (partial merge)
router.put('/preferences', async (req: Request, res: Response) => {
  const user = req.user!;
  const updates = req.body;

  // Deep merge preferences
  const prefs = user.preferences || {};
  if (updates.theme !== undefined) prefs.theme = updates.theme;
  if (updates.language !== undefined) prefs.language = updates.language;
  if (updates.timezone !== undefined) prefs.timezone = updates.timezone;

  if (updates.notifications) {
    const n = (prefs as Record<string, unknown>).notifications as Record<string, boolean> || {};
    Object.assign(n, updates.notifications);
    (prefs as Record<string, unknown>).notifications = n;
  }

  if (updates.accessibility) {
    const a = (prefs as Record<string, unknown>).accessibility as Record<string, unknown> || {};
    Object.assign(a, updates.accessibility);
    (prefs as Record<string, unknown>).accessibility = a;
  }

  user.preferences = prefs;
  user.markModified('preferences');
  await user.save();

  res.json(user.preferences);
});

// GET /oauth-providers
router.get('/oauth-providers', async (req: Request, res: Response) => {
  const user = req.user!;
  res.json(
    user.oauthProviders.map((p) => ({
      provider: p.provider,
      email: p.email,
      linkedAt: p.linkedAt,
    }))
  );
});

// DELETE /oauth-providers/:provider
router.delete('/oauth-providers/:provider', async (req: Request, res: Response) => {
  const user = req.user!;
  const provider = req.params.provider;

  // Must keep at least one auth method
  const hasPassword = !!(await User.findById(user._id).select('passwordHash'))?.passwordHash;
  const otherProviders = user.oauthProviders.filter((p) => p.provider !== provider);

  if (!hasPassword && otherProviders.length === 0) {
    return res.status(400).json({ error: 'Cannot remove last authentication method. Set a password first.' });
  }

  user.oauthProviders = otherProviders as typeof user.oauthProviders;
  await user.save();

  await createAuditEntry({
    userId: String(user._id),
    action: 'settings.oauth.unlink',
    entityType: 'user',
    entityId: String(user._id),
    after: { provider },
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  res.json({ message: `${provider} unlinked` });
});

// GET /sessions
router.get('/sessions', async (req: Request, res: Response) => {
  const redis = getRedis();
  const userId = String(req.user!._id);
  const keys = await redis.keys(`session:${userId}:*`);
  const sessions = [];

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      try {
        const session = JSON.parse(data);
        const sessionId = key.split(':').pop();
        sessions.push({
          id: sessionId,
          device: session.device || 'Unknown',
          ip: session.ip || '',
          lastActive: session.lastActive || session.createdAt,
          current: sessionId === req.jwtPayload?.iat?.toString(),
        });
      } catch {
        // Skip invalid session data
      }
    }
  }

  res.json(sessions);
});

// DELETE /sessions/:sessionId
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  const redis = getRedis();
  const userId = String(req.user!._id);
  const key = `session:${userId}:${req.params.sessionId}`;

  const deleted = await redis.del(key);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });

  await createAuditEntry({
    userId,
    action: 'settings.session.revoke',
    entityType: 'session',
    entityId: String(req.params.sessionId),
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  res.json({ message: 'Session revoked' });
});

// GET /api-keys
router.get('/api-keys', async (req: Request, res: Response) => {
  const keys = await ApiKey.find({ userId: req.user!._id })
    .select('-keyHash')
    .sort({ createdAt: -1 });

  res.json(
    keys.map((k) => ({
      id: k._id,
      name: k.name,
      prefix: k.prefix,
      permissions: k.permissions,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
    }))
  );
});

// POST /api-keys
router.post('/api-keys', async (req: Request, res: Response) => {
  const { name, permissions, expiresInDays } = req.body;

  if (!name) return res.status(400).json({ error: 'Name is required' });

  // Generate a random API key
  const rawKey = `ta_${crypto.randomBytes(32).toString('hex')}`;
  const prefix = rawKey.slice(0, 7);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000)
    : null;

  const apiKey = await ApiKey.create({
    userId: req.user!._id,
    name,
    keyHash,
    prefix,
    permissions: permissions || [],
    expiresAt,
  });

  await createAuditEntry({
    userId: String(req.user!._id),
    action: 'settings.apikey.create',
    entityType: 'apikey',
    entityId: String(apiKey._id),
    after: { name, permissions },
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  // Return the raw key only once
  res.status(201).json({
    id: apiKey._id,
    name: apiKey.name,
    key: rawKey,
    prefix,
    permissions: apiKey.permissions,
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expiresAt,
  });
});

// DELETE /api-keys/:keyId
router.delete('/api-keys/:keyId', async (req: Request, res: Response) => {
  const key = await ApiKey.findOneAndDelete({
    _id: req.params.keyId,
    userId: req.user!._id,
  });

  if (!key) return res.status(404).json({ error: 'API key not found' });

  await createAuditEntry({
    userId: String(req.user!._id),
    action: 'settings.apikey.revoke',
    entityType: 'apikey',
    entityId: String(req.params.keyId),
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  res.json({ message: 'API key revoked' });
});

// GET /billing
router.get('/billing', async (req: Request, res: Response) => {
  const user = req.user!;
  const role = user.role;

  const planMap: Record<string, string> = {
    chief_architect: 'enterprise',
    enterprise_architect: 'professional',
    solution_architect: 'professional',
    data_architect: 'professional',
    business_architect: 'professional',
    analyst: 'free',
    viewer: 'free',
  };

  const featureMap: Record<string, string[]> = {
    enterprise: [
      'Unlimited projects',
      'All analytics modules',
      'API access',
      'Governance & compliance',
      'Priority support',
      'Custom integrations',
      'Admin panel',
    ],
    professional: [
      'Up to 20 projects',
      'All analytics modules',
      'API access',
      'Governance & compliance',
    ],
    free: [
      'Up to 3 projects',
      'Basic analytics',
      'Community support',
    ],
  };

  const plan = planMap[role] || 'free';

  res.json({
    plan,
    role,
    features: featureMap[plan] || featureMap.free,
  });
});

export default router;
