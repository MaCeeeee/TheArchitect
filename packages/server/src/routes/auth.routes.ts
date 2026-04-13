import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User';
import type { IUser } from '../models/User';
import {
  authenticate,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
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
import { isPasswordValid } from '@thearchitect/shared';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email.service';
import { migrateTemporaryGraph } from '../services/upload.service';
import { HealthReport } from '../models/HealthReport';
import { Project } from '../models/Project';

const router = Router();

// Rate limit auth endpoints more aggressively
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, name: 'auth' });

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (!isPasswordValid(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // First user on the platform becomes chief_architect automatically
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'chief_architect' : 'enterprise_architect';
    const isFirstUser = userCount === 0;

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      email, passwordHash, name, role,
      emailVerified: isFirstUser, // first user auto-verified
      emailVerificationToken: isFirstUser ? undefined : verificationToken,
      emailVerificationExpires: isFirstUser ? undefined : new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    // Send verification email (fire-and-forget)
    if (!isFirstUser) {
      sendVerificationEmail(email, verificationToken).catch((err) =>
        console.error('[Auth] Failed to send verification email:', err),
      );
    }

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
      user: { id: user._id, email: user.email, name: user.name, role: user.role, emailVerified: user.emailVerified },
      accessToken,
      refreshToken,
      emailVerificationRequired: !user.emailVerified,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── GET /api/auth/verify-email — Verify email address ───

router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).json({ error: 'Verification token required' });

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'email_verified',
      entityType: 'user',
      entityId: user._id.toString(),
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ─── POST /api/auth/resend-verification — Resend verification email ───

router.post('/resend-verification', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || user.emailVerified) {
      // Don't reveal whether user exists
      return res.json({ success: true, message: 'If the email exists and is unverified, a new link has been sent' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user.email, verificationToken);

    res.json({ success: true, message: 'If the email exists and is unverified, a new link has been sent' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// ─── POST /api/auth/adopt-healthcheck — Convert temp graph to permanent project ───

router.post('/adopt-healthcheck', authenticate, async (req: Request, res: Response) => {
  try {
    const { uploadToken } = req.body;
    if (!uploadToken || typeof uploadToken !== 'string') {
      return res.status(400).json({ error: 'uploadToken is required' });
    }

    // Find the report by uploadToken
    const report = await HealthReport.findOne({ uploadToken });
    if (!report || !report.tempProjectId) {
      return res.status(404).json({ error: 'No health check found for this token' });
    }

    if (report.permanentProjectId) {
      return res.status(409).json({ error: 'This health check has already been adopted' });
    }

    // Create a permanent project
    const userId = (req as any).user?.id || (req as any).user?._id;
    const project = await Project.create({
      name: `Imported Architecture (Health Check)`,
      description: `Architecture imported from health check on ${new Date(report.createdAt).toLocaleDateString()}. Health Score: ${report.healthScore.total}/100.`,
      owner: userId,
      collaborators: [{ user: userId, role: 'owner' }],
    });

    // Migrate graph elements from temp to permanent
    const migrated = await migrateTemporaryGraph(report.tempProjectId, project._id.toString());

    // Link report to permanent project
    report.permanentProjectId = project._id.toString();
    await report.save();

    await createAuditEntry({
      userId: userId.toString(),
      action: 'healthcheck_adopt',
      entityType: 'project',
      entityId: project._id.toString(),
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    return res.status(201).json({
      success: true,
      data: {
        projectId: project._id,
        projectName: project.name,
        migratedElements: migrated,
        healthScore: report.healthScore.total,
      },
    });
  } catch (err) {
    console.error('[Auth] Adopt healthcheck error:', err);
    return res.status(500).json({ error: 'Failed to adopt health check' });
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
        emailVerified: user.emailVerified ?? true,
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

    // Decode the pending MFA token (signed with access token secret)
    let decoded: { userId: string; role: string };
    try {
      const JWT_SECRET = process.env.JWT_SECRET || 'thearchitect-dev-secret-change-in-production';
      decoded = jwt.verify(mfaToken, JWT_SECRET) as { userId: string; role: string };
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

    const decoded = verifyRefreshToken(refreshToken);

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

// ─── Forgot / Reset Password ─────────────────────────────────────────────────

const forgotLimiter = rateLimit({ windowMs: 15 * 60_000, max: 5, name: 'forgot' });

router.post('/forgot-password', forgotLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Always return success to prevent email enumeration
    const successMsg = { message: 'If an account exists with this email, a reset link has been sent.' };

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash) {
      return res.json(successMsg);
    }

    // Generate secure token, hash it for storage
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    await sendPasswordResetEmail(user.email, rawToken);

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'password_reset_requested',
      entityType: 'auth',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json(successMsg);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (!isPasswordValid(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    await createAuditEntry({
      userId: user._id.toString(),
      action: 'password_reset_completed',
      entityType: 'auth',
      riskLevel: 'high',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
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
  // First user on the platform becomes chief_architect automatically;
  // all subsequent self-registrations get enterprise_architect (full permissions minus ADMIN_SYSTEM_CONFIG).
  // Invited collaborators receive their role via the invitation/project-collaborator flow.
  const userCount = await User.countDocuments();
  const role = userCount === 0 ? 'chief_architect' : 'enterprise_architect';
  user = await User.create({
    email: profile.email.toLowerCase(),
    name: profile.name,
    role,
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

// ── Google Identity Services (ID Token) ──────────────

if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn('[OAuth] ⚠ GOOGLE_CLIENT_ID is not set — Google OAuth will fail for all users');
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('[OAuth] ⚠ GOOGLE_CLIENT_SECRET is not set — Google auth-code flow will fail');
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/oauth/google/token', authLimiter, async (req: Request, res: Response) => {
  console.log('[OAuth] Google token request received', { flow: req.body?.flow, hasCredential: !!req.body?.credential, clientIdConfigured: !!process.env.GOOGLE_CLIENT_ID });

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('[OAuth] Google OAuth not configured — missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    return res.status(503).json({ error: 'Google login is not configured on this server. Please contact the administrator.' });
  }

  const { credential, flow } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  try {
    let profile: { provider: 'google'; providerId: string; email: string; name: string };

    if (flow === 'auth-code') {
      // Auth-code flow: exchange code for tokens, then verify ID token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: credential,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: 'postmessage',
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error('[OAuth] Google token exchange failed:', tokenRes.status, errBody);
        return res.status(401).json({ error: 'Failed to exchange authorization code' });
      }
      const tokens = await tokenRes.json() as { id_token?: string };
      if (!tokens.id_token) {
        return res.status(401).json({ error: 'No ID token received from Google' });
      }
      // Verify the ID token
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.status(400).json({ error: 'Invalid token payload' });
      }
      profile = {
        provider: 'google',
        providerId: payload.sub!,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
      };
    } else {
      // ID Token flow (One-Tap): credential is a JWT → verify with Google
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.status(400).json({ error: 'Invalid token payload' });
      }
      profile = {
        provider: 'google',
        providerId: payload.sub!,
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
      };
    }

    const user = await findOrCreateOAuthUser(profile);
    const accessToken = generateAccessToken(user._id.toString(), user.role);
    const refreshToken = generateRefreshToken(user._id.toString(), user.role);

    createAuditEntry({
      userId: user._id.toString(),
      action: 'oauth_login_success',
      entityType: 'auth',
      ip: req.ip || '',
      userAgent: req.get('user-agent') || '',
    });

    return res.json({ accessToken, refreshToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified ?? true } });
  } catch (err) {
    console.error('[OAuth] Google token verification error:', err);
    return res.status(401).json({ error: 'Google authentication failed' });
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

// ── OAuth Diagnostic (admin only) ────────────────────

router.get('/oauth/status', authenticate, async (req: Request, res: Response) => {
  const user = (req as unknown as { user: { role: string } }).user;
  if (user.role !== 'chief_architect' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const redis = getRedis();
  let redisOk = false;
  try {
    if (redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch { /* redis down */ }

  res.json({
    providers: {
      google: {
        clientIdSet: !!process.env.GOOGLE_CLIENT_ID,
        clientSecretSet: !!process.env.GOOGLE_CLIENT_SECRET,
      },
      github: {
        clientIdSet: !!process.env.GITHUB_CLIENT_ID,
        clientSecretSet: !!process.env.GITHUB_CLIENT_SECRET,
        callbackUrlSet: !!process.env.GITHUB_CALLBACK_URL,
      },
      microsoft: {
        clientIdSet: !!process.env.MICROSOFT_CLIENT_ID,
        clientSecretSet: !!process.env.MICROSOFT_CLIENT_SECRET,
        callbackUrlSet: !!process.env.MICROSOFT_CALLBACK_URL,
      },
    },
    clientUrl: process.env.CLIENT_URL || '(not set)',
    redisConnected: redisOk,
  });
});

export default router;
