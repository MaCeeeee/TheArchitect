import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

// Types are extended via src/types/express.d.ts

const JWT_SECRET = process.env.JWT_SECRET || 'thearchitect-dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'thearchitect-dev-refresh-secret-change-in-production';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];

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
