import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { ApiKey } from '../models/ApiKey';
import { getRedis } from '../config/redis';
import { isSessionActive, touchSession } from '../services/session.service';

// Types are extended via src/types/express.d.ts

const isDev = process.env.NODE_ENV !== 'production';

function requireSecret(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isDev) return `dev-only-${name}-not-for-production`;
  throw new Error(`FATAL: ${name} environment variable is required in production`);
}

const JWT_SECRET = requireSecret('JWT_SECRET');
const JWT_REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET');

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // Strategy 1: X-API-Key header
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey && apiKey.startsWith('ta_')) {
    return authenticateApiKey(apiKey, req, res, next);
  }

  // Strategy 2: JWT Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

  // Check if the Bearer token is actually an API key
  if (token.startsWith('ta_')) {
    return authenticateApiKey(token, req, res, next);
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      role: string;
      type: string;
      sid?: string;
      iat: number;
      exp: number;
    };

    if (decoded.type === 'refresh') {
      return res.status(401).json({ error: 'Access token required, refresh token provided' });
    }

    req.jwtPayload = {
      userId: decoded.userId,
      role: decoded.role,
      type: decoded.type as 'access' | 'refresh',
      sid: decoded.sid,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    // THE-535: traegt das Token eine Session-Id, muss die Sitzung noch leben —
    // sonst wirkt "abmelden" erst mit Token-Ablauf. Faellt Redis aus, faellt
    // die Pruefung OFFEN aus (Begruendung in session.service.ts); Tokens ohne
    // sid (API-Key-Bruecke, Alt-Tokens von vor dem Deploy) werden nicht geprueft.
    const sessionGate: Promise<boolean> = decoded.sid
      ? isSessionActive(getRedis(), decoded.userId, decoded.sid)
      : Promise.resolve(true);
    sessionGate
      .then((active) => {
        if (!active) {
          res.status(401).json({ error: 'Session revoked', code: 'SESSION_REVOKED' });
          return null;
        }
        if (decoded.sid) void touchSession(getRedis(), decoded.userId, decoded.sid);
        return User.findById(decoded.userId).select('-passwordHash -mfaSecret');
      })
      .then((user) => {
        if (user === null) return; // Antwort ist schon raus
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }
        req.user = user;
        (req as any).authMethod = 'jwt';
        next();
      })
      .catch(() => {
        res.status(500).json({ error: 'Authentication error' });
      });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── API Key Authentication ───

function authenticateApiKey(rawKey: string, req: Request, res: Response, next: NextFunction) {
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  ApiKey.findOne({ keyHash })
    .then(async (apiKeyDoc) => {
      if (!apiKeyDoc) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Check expiration
      if (apiKeyDoc.expiresAt && apiKeyDoc.expiresAt < new Date()) {
        return res.status(401).json({ error: 'API key expired' });
      }

      // Load associated user
      const user = await User.findById(apiKeyDoc.userId).select('-passwordHash -mfaSecret');
      if (!user) {
        return res.status(401).json({ error: 'API key owner not found' });
      }

      // Set request context (compatible with JWT flow)
      req.user = user;
      (req as any).authMethod = 'api_key';
      (req as any).apiKeyPrefix = keyHash.slice(0, 8);
      req.jwtPayload = {
        userId: user._id.toString(),
        role: user.role,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Update lastUsedAt (fire-and-forget)
      ApiKey.updateOne({ _id: apiKeyDoc._id }, { lastUsedAt: new Date() }).catch(() => {});

      next();
    })
    .catch(() => {
      res.status(500).json({ error: 'API key authentication error' });
    });
}

// THE-535: Tokens tragen die Session-Id (`sid`), damit Widerruf sofort wirkt
// und die Sessions-Ansicht die aktuelle Sitzung erkennt. Optional, weil der
// MFA-Zwischen-Token bewusst KEINE Sitzung hat (sie entsteht erst nach
// vollstaendiger Anmeldung) und Alt-Tokens von vor dem Deploy keine kennen.
export function generateAccessToken(userId: string, role: string, sessionId?: string): string {
  return jwt.sign({ userId, role, type: 'access', ...(sessionId ? { sid: sessionId } : {}) }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: string, role: string, sessionId?: string): string {
  return jwt.sign({ userId, role, type: 'refresh', ...(sessionId ? { sid: sessionId } : {}) }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, JWT_REFRESH_SECRET) as {
    userId: string;
    role: string;
    type: string;
    sid?: string;
  };
}
