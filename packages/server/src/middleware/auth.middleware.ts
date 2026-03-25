import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { ApiKey } from '../models/ApiKey';

// Types are extended via src/types/express.d.ts

const JWT_SECRET = process.env.JWT_SECRET || 'thearchitect-dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'thearchitect-dev-refresh-secret-change-in-production';

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
      iat: decoded.iat,
      exp: decoded.exp,
    };

    User.findById(decoded.userId)
      .select('-passwordHash -mfaSecret')
      .then((user) => {
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }
        req.user = user;
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

export function generateAccessToken(userId: string, role: string): string {
  return jwt.sign({ userId, role, type: 'access' }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(userId: string, role: string): string {
  return jwt.sign({ userId, role, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, JWT_REFRESH_SECRET) as {
    userId: string;
    role: string;
    type: string;
  };
}
