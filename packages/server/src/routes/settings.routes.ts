import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { User } from '../models/User';
import { ApiKey } from '../models/ApiKey';
import { Connection, encryptCredentials, decryptCredentials } from '../models/Connection';
import { Project } from '../models/Project';
import { getAllConnectorTypes, getConnector } from '../services/connectors';
import type { ConnectorConfig, ConnectorType, AuthMethod } from '../services/connectors/base.connector';
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

// ─── Connector Types (non-project-scoped) ───

router.get('/connector-types', async (_req: Request, res: Response) => {
  res.json({ success: true, data: getAllConnectorTypes() });
});

// ─── Connections (user-global credential vault) ───

router.get('/connections', async (req: Request, res: Response) => {
  const conns = await Connection.find({ userId: req.user!._id }).sort({ createdAt: -1 });
  res.json({
    success: true,
    data: conns.map((c) => ({
      id: c._id,
      name: c.name,
      type: c.type,
      baseUrl: c.baseUrl,
      authMethod: c.authMethod,
      hasCredentials: !!c.credentials,
      lastTestedAt: c.lastTestedAt,
      lastTestResult: c.lastTestResult,
      createdAt: c.createdAt,
    })),
  });
});

router.post('/connections', async (req: Request, res: Response) => {
  try {
    const { name, type, baseUrl, authMethod, credentials } = req.body;
    if (!name || !type || !baseUrl) {
      return res.status(400).json({ success: false, error: 'name, type, and baseUrl are required' });
    }

    const encrypted = credentials ? encryptCredentials(credentials) : '';
    const conn = await Connection.create({
      userId: req.user!._id,
      name, type, baseUrl,
      authMethod: authMethod || 'personal_token',
      credentials: encrypted,
    });

    await createAuditEntry({
      userId: String(req.user!._id),
      action: 'settings.connection.create',
      entityType: 'connection',
      entityId: String(conn._id),
      after: { name, type, baseUrl },
      ip: (typeof req.ip === 'string' ? req.ip : '') || '',
      userAgent: req.get('user-agent') || '',
    });

    res.status(201).json({
      success: true,
      data: { id: conn._id, name: conn.name, type: conn.type, baseUrl: conn.baseUrl, authMethod: conn.authMethod, hasCredentials: !!encrypted, createdAt: conn.createdAt },
    });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'A connection with this name already exists' });
    }
    res.status(500).json({ success: false, error: err.message || 'Failed to create connection' });
  }
});

router.put('/connections/:connectionId', async (req: Request, res: Response) => {
  const conn = await Connection.findOne({ _id: req.params.connectionId, userId: req.user!._id });
  if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

  const { name, baseUrl, authMethod, credentials } = req.body;
  if (name !== undefined) conn.name = name;
  if (baseUrl !== undefined) conn.baseUrl = baseUrl;
  if (authMethod !== undefined) conn.authMethod = authMethod;
  if (credentials) conn.credentials = encryptCredentials(credentials);

  await conn.save();
  res.json({
    success: true,
    data: { id: conn._id, name: conn.name, type: conn.type, baseUrl: conn.baseUrl, authMethod: conn.authMethod, hasCredentials: !!conn.credentials, createdAt: conn.createdAt },
  });
});

router.delete('/connections/:connectionId', async (req: Request, res: Response) => {
  const conn = await Connection.findOne({ _id: req.params.connectionId, userId: req.user!._id });
  if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

  // Check if any project references this connection
  const usedBy = await Project.find({ 'integrations.connectionId': conn._id }).select('name');
  if (usedBy.length > 0) {
    return res.status(409).json({
      success: false,
      error: `Connection is used by: ${usedBy.map(p => p.name).join(', ')}. Remove integrations first.`,
    });
  }

  await Connection.findByIdAndDelete(conn._id);

  await createAuditEntry({
    userId: String(req.user!._id),
    action: 'settings.connection.delete',
    entityType: 'connection',
    entityId: String(conn._id),
    ip: (typeof req.ip === 'string' ? req.ip : '') || '',
    userAgent: req.get('user-agent') || '',
  });

  res.json({ success: true });
});

router.post('/connections/:connectionId/test', async (req: Request, res: Response) => {
  const conn = await Connection.findOne({ _id: req.params.connectionId, userId: req.user!._id });
  if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

  const connector = getConnector(conn.type as ConnectorType);
  if (!connector) return res.status(400).json({ success: false, error: 'Unknown connector type' });

  const config: ConnectorConfig = {
    type: conn.type as ConnectorType,
    name: conn.name,
    baseUrl: conn.baseUrl,
    authMethod: conn.authMethod as AuthMethod,
    credentials: decryptCredentials(conn.credentials),
    projectId: '',
    mappingRules: [],
    syncIntervalMinutes: 0,
    filters: {},
    enabled: true,
  };

  const result = await connector.testConnection(config);

  conn.lastTestedAt = new Date();
  conn.lastTestResult = result;
  await conn.save();

  res.json({ success: true, data: result });
});

// ─── Connection Discovery (auto-fetch orgs, repos, projects) ───

router.get('/connections/:connectionId/orgs', async (req: Request, res: Response) => {
  const conn = await Connection.findOne({ _id: req.params.connectionId, userId: req.user!._id });
  if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

  const creds = decryptCredentials(conn.credentials);
  const token = creds.token || creds.accessToken || '';
  let baseUrl = conn.baseUrl || '';

  try {
    if (conn.type === 'github') {
      // Normalize github.com → api.github.com
      if (/github\.com/i.test(baseUrl)) baseUrl = 'https://api.github.com';
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Fetch user info + orgs in parallel
      const [userRes, orgsRes] = await Promise.all([
        fetch(`${baseUrl}/user`, { headers }),
        fetch(`${baseUrl}/user/orgs?per_page=100`, { headers }),
      ]);

      const orgs: Array<{ login: string; type: string }> = [];
      if (userRes.ok) {
        const user = await userRes.json() as Record<string, any>;
        orgs.push({ login: user.login, type: 'user' });
      }
      if (orgsRes.ok) {
        const orgList = await orgsRes.json() as Array<Record<string, any>>;
        for (const o of orgList) orgs.push({ login: o.login, type: 'organization' });
      }

      return res.json({ success: true, data: orgs });
    }

    if (conn.type === 'gitlab') {
      if (!/api\/v4/i.test(baseUrl)) baseUrl = baseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = { 'PRIVATE-TOKEN': token, Accept: 'application/json' };
      const resp = await fetch(`${baseUrl}/api/v4/groups?per_page=100&min_access_level=10`, { headers });
      if (!resp.ok) return res.json({ success: true, data: [] });
      const groups = await resp.json() as Array<Record<string, any>>;
      return res.json({ success: true, data: groups.map((g) => ({ login: g.full_path, type: 'group', id: g.id })) });
    }

    if (conn.type === 'jira') {
      const email = creds.email || '';
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/rest/api/3/project/search?maxResults=100`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });
      if (!resp.ok) return res.json({ success: true, data: [] });
      const body = await resp.json() as Record<string, any>;
      const projects = (body.values || []).map((p: any) => ({ login: p.key, type: 'project', name: p.name }));
      return res.json({ success: true, data: projects });
    }

    res.json({ success: true, data: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch organizations' });
  }
});

router.get('/connections/:connectionId/repos', async (req: Request, res: Response) => {
  const conn = await Connection.findOne({ _id: req.params.connectionId, userId: req.user!._id });
  if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

  const creds = decryptCredentials(conn.credentials);
  const token = creds.token || creds.accessToken || '';
  const org = String(req.query.org || '');
  const orgType = String(req.query.type || 'user');
  let baseUrl = conn.baseUrl || '';

  try {
    if (conn.type === 'github') {
      if (/github\.com/i.test(baseUrl)) baseUrl = 'https://api.github.com';
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const path = orgType === 'organization'
        ? `/orgs/${org}/repos?per_page=100&type=all`
        : `/users/${org}/repos?per_page=100&sort=updated`;
      const resp = await fetch(`${baseUrl}${path}`, { headers });
      if (!resp.ok) return res.json({ success: true, data: [] });
      const repos = await resp.json() as Array<Record<string, any>>;
      return res.json({
        success: true,
        data: repos.map((r) => ({
          name: r.name,
          fullName: r.full_name,
          description: r.description || '',
          language: r.language || '',
          private: r.private,
          archived: r.archived,
          updatedAt: r.pushed_at,
        })),
      });
    }

    if (conn.type === 'gitlab') {
      if (!/api\/v4/i.test(baseUrl)) baseUrl = baseUrl.replace(/\/+$/, '');
      const headers: Record<string, string> = { 'PRIVATE-TOKEN': token, Accept: 'application/json' };
      const path = org
        ? `/api/v4/groups/${encodeURIComponent(org)}/projects?per_page=100&include_subgroups=true`
        : `/api/v4/projects?membership=true&per_page=100`;
      const resp = await fetch(`${baseUrl}${path}`, { headers });
      if (!resp.ok) return res.json({ success: true, data: [] });
      const repos = await resp.json() as Array<Record<string, any>>;
      return res.json({
        success: true,
        data: repos.map((r) => ({
          name: r.name,
          fullName: r.path_with_namespace,
          description: r.description || '',
          language: '',
          private: r.visibility === 'private',
          archived: r.archived,
          updatedAt: r.last_activity_at,
        })),
      });
    }

    res.json({ success: true, data: [] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch repos' });
  }
});

export default router;
