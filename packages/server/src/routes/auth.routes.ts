import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User } from '../models/User';
import type { IUser } from '../models/User';
import {
  authenticate,
  generateAccessToken,
  generateRefreshToken,
} from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { createAuditEntry } from '../middleware/audit.middleware';
import { TOTP, generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { getRedis } from '../config/redis';
import {
  exchangeGoogleCode,
  exchangeGithubCode,
  exchangeMicrosoftCode,
  type OAuthProfile,
} from '../services/oauth.service';

const router = Router();

// Rate limit auth endpoints more aggressively
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, name: 'auth' });

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash, name, role: 'viewer' });

    const accessToken = generateAccessToken(user._id.toString(), user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.role);

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'user_register',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.status(201).json({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await createAuditEntry({
        userId: user._id.toString(),
        action: 'login_failed',
        entityType: 'auth',
        riskLevel: 'medium',
        ip: req.ip || '',
        userAgent: req.get('user-agent') || '',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If MFA is enabled, return a partial response requiring TOTP
    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = generateAccessToken(user._id.toString(), '__mfa_pending__');
      return res.json({
        mfaRequired: true,
        mfaToken,
        user: { id: user._id, email: user.email, name: user.name },
      });
    }

    const accessToken = generateAccessToken(user._id.toString(), user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.role);

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'login_success',
      entityType: 'auth',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// MFA verification during login
router.post('/mfa/verify', authLimiter, async (req: Request, res: Response) => {
  try {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) {
      return res.status(400).json({ error: 'MFA token and code are required' });
    }

    // Decode the pending MFA token
    let decoded: { userId: string; role: string };
    try {
      const jwt = await import('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'thearchitect-dev-secret-change-in-production';
      decoded = jwt.default.verify(mfaToken, JWT_SECRET) as { userId: string; role: string };
    } catch {
      return res.status(401).json({ error: 'Invalid or expired MFA token' });
    }

    if (decoded.role !== '__mfa_pending__') {
      return res.status(400).json({ error: 'Invalid MFA flow' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.mfaSecret) {
      return res.status(401).json({ error: 'User not found' });
    }

    const isValid = verifySync({ token: code, secret: user.mfaSecret });
    if (!isValid) {
      await createAuditEntry({
        userId: user._id.toString(),
        action: 'mfa_failed',
        entityType: 'auth',
        riskLevel: 'high',
        ip: req.ip || '',
        userAgent: req.get('user-agent') || '',
      });
      return res.status(401).json({ error: 'Invalid MFA code' });
    }

    const accessToken = generateAccessToken(user._id.toString(), user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.role);

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'mfa_success',
      entityType: 'auth',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        mfaEnabled: true,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('MFA verify error:', err);
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

// MFA setup - generate secret and QR code
router.post('/mfa/setup', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.user!._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const secret = generateSecret();
    const otpauth = generateURI({ issuer: 'TheArchitect EA', label: user.email, secret });
    const qrCode = await QRCode.toDataURL(otpauth);

    // Store secret temporarily (not enabled until confirmed)
    user.mfaSecret = secret;
    await user.save();

    res.json({ secret, qrCode, otpauth });
  } catch (err) {
    console.error('MFA setup error:', err);
    res.status(500).json({ error: 'MFA setup failed' });
  }
});

// MFA confirm - verify a code to enable MFA
router.post('/mfa/confirm', authenticate, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user!._id);
    if (!user || !user.mfaSecret) {
      return res.status(400).json({ error: 'MFA setup not initiated' });
    }

    const isValid = verifySync({ token: code, secret: user.mfaSecret });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    user.mfaEnabled = true;
    await user.save();

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'mfa_enabled',
      entityType: 'auth',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json({ mfaEnabled: true });
  } catch (err) {
    console.error('MFA confirm error:', err);
    res.status(500).json({ error: 'MFA confirmation failed' });
  }
});

// MFA disable
router.post('/mfa/disable', authenticate, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user!._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ error: 'No password set on this account. Use your identity provider settings.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    await user.save();

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'mfa_disabled',
      entityType: 'auth',
      riskLevel: 'high',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json({ mfaEnabled: false });
  } catch (err) {
    console.error('MFA disable error:', err);
    res.status(500).json({ error: 'MFA disable failed' });
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const jwt = await import('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'thearchitect-dev-secret-change-in-production';

    const decoded = jwt.default.verify(refreshToken, JWT_SECRET) as {
      userId: string;
      role: string;
      type: string;
    };

    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Verify user still exists and get current role
    const user = await User.findById(decoded.userId).select('role');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newAccessToken = generateAccessToken(user._id.toString(), user.role);
    const newRefreshToken = generateRefreshToken(user._id.toString(), user.role);

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Get current user profile
router.get('/me', authenticate, (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    mfaEnabled: user.mfaEnabled,
    preferences: user.preferences,
  });
});

// Logout (client-side token removal, audit only)
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  await createAuditEntry({
    userId: req.user!._id.toString(),
    action: 'logout',
    entityType: 'auth',
    ip: req.ip || '',
    userAgent: req.get('user-agent') || '',
  });
  res.json({ success: true });
});

// ─── OAuth SSO ───────────────────────────────────────────────────────────────

const OAUTH_STATE_TTL = 600; // 10 minutes
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

async function createOAuthState(): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const redis = getRedis();
  await redis.set(`oauth:state:${state}`, '1', 'EX', OAUTH_STATE_TTL);
  return state;
}

async function consumeOAuthState(state: string): Promise<boolean> {
  const redis = getRedis();
  const key = `oauth:state:${state}`;
  const val = await redis.get(key);
  if (!val) return false;
  await redis.del(key);
  return true;
}

async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<IUser> {
  // 1) Returning OAuth user — matched by provider + providerId
  let user = await User.findOne({
    'oauthProviders.provider': profile.provider,
    'oauthProviders.providerId': profile.providerId,
  });
  if (user) return user;

  // 2) Existing user with same email — link the OAuth provider
  user = await User.findOne({ email: profile.email.toLowerCase() });
  if (user) {
    user.oauthProviders.push({
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      linkedAt: new Date(),
    });
    await user.save();
    return user;
  }

  // 3) New user — create without password
  user = await User.create({
    email: profile.email.toLowerCase(),
    name: profile.name,
    role: 'viewer',
    oauthProviders: [
      {
        provider: profile.provider,
        providerId: profile.providerId,
        email: profile.email,
        linkedAt: new Date(),
      },
    ],
  });
  return user;
}

function redirectWithTokens(res: Response, user: IUser, ip: string, userAgent: string) {
  const accessToken = generateAccessToken(user._id.toString(), user.role);
  const refreshToken = generateRefreshToken(user._id.toString(), user.role);

  createAuditEntry({
    userId: user._id.toString(),
    action: 'oauth_login_success',
    entityType: 'auth',
    ip,
    userAgent,
  });

  const params = new URLSearchParams({
    accessToken,
    refreshToken,
  });
  return res.redirect(`${CLIENT_URL}/auth/callback?${params.toString()}`);
}

function redirectWithError(res: Response, message: string) {
  const params = new URLSearchParams({ error: message });
  return res.redirect(`${CLIENT_URL}/login?${params.toString()}`);
}

// ── Google ────────────────────────────────────────────

router.get('/oauth/google', async (_req: Request, res: Response) => {
  try {
    const state = await createOAuthState();
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch {
    redirectWithError(res, 'Failed to initiate Google login');
  }
});

router.get('/oauth/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    return redirectWithError(res, 'Google login was cancelled');
  }

  if (!(await consumeOAuthState(state))) {
    return redirectWithError(res, 'Invalid or expired login session');
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const user = await findOrCreateOAuthUser(profile);
    return redirectWithTokens(res, user, req.ip || '', req.get('user-agent') || '');
  } catch (err) {
    console.error('[OAuth] Google callback error:', err);
    return redirectWithError(res, 'Google authentication failed');
  }
});

// ── GitHub ────────────────────────────────────────────

router.get('/oauth/github', async (_req: Request, res: Response) => {
  try {
    const state = await createOAuthState();
    const params = new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID!,
      redirect_uri: process.env.GITHUB_CALLBACK_URL!,
      scope: 'read:user user:email',
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
  } catch {
    redirectWithError(res, 'Failed to initiate GitHub login');
  }
});

router.get('/oauth/github/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    return redirectWithError(res, 'GitHub login was cancelled');
  }

  if (!(await consumeOAuthState(state))) {
    return redirectWithError(res, 'Invalid or expired login session');
  }

  try {
    const profile = await exchangeGithubCode(code);
    const user = await findOrCreateOAuthUser(profile);
    return redirectWithTokens(res, user, req.ip || '', req.get('user-agent') || '');
  } catch (err) {
    console.error('[OAuth] GitHub callback error:', err);
    return redirectWithError(res, 'GitHub authentication failed');
  }
});

// ── Microsoft Entra ID ────────────────────────────────

router.get('/oauth/microsoft', async (_req: Request, res: Response) => {
  try {
    const state = await createOAuthState();
    const tenantId = process.env.ENTRA_TENANT_ID || 'common';
    const params = new URLSearchParams({
      client_id: process.env.ENTRA_CLIENT_ID!,
      redirect_uri: process.env.ENTRA_CALLBACK_URL!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    res.redirect(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`);
  } catch {
    redirectWithError(res, 'Failed to initiate Microsoft login');
  }
});

router.get('/oauth/microsoft/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    return redirectWithError(res, 'Microsoft login was cancelled');
  }

  if (!(await consumeOAuthState(state))) {
    return redirectWithError(res, 'Invalid or expired login session');
  }

  try {
    const profile = await exchangeMicrosoftCode(code);
    const user = await findOrCreateOAuthUser(profile);
    return redirectWithTokens(res, user, req.ip || '', req.get('user-agent') || '');
  } catch (err) {
    console.error('[OAuth] Microsoft callback error:', err);
    return redirectWithError(res, 'Microsoft authentication failed');
  }
});

export default router;
