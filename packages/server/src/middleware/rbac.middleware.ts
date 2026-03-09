import { Request, Response, NextFunction } from 'express';
import { ROLE_PERMISSIONS, Permission } from '@thearchitect/shared';

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = user.role as keyof typeof ROLE_PERMISSIONS;
    const rolePerms = ROLE_PERMISSIONS[userRole] || [];

    const allPerms = new Set([...rolePerms, ...(user.permissions || [])]);

    const missing = permissions.filter((p) => !allPerms.has(p));
    if (missing.length > 0) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permissions,
        missing,
      });
    }

    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        error: 'Insufficient role',
        required: roles,
        current: user.role,
      });
    }

    next();
  };
}
