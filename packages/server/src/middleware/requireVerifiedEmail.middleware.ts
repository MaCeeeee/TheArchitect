import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that blocks access for users who haven't verified their email.
 * Use on AI-powered endpoints to prevent abuse from unverified accounts.
 */
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // OAuth users and existing users without the field are treated as verified
  if (user.emailVerified === false) {
    return res.status(403).json({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address before using AI features',
    });
  }

  next();
}
