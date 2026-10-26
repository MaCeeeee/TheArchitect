import { Request, Response, NextFunction } from 'express';
import { ROLE_PERMISSIONS, PERMISSIONS, Permission } from '@thearchitect/shared';

// Security-Audit H12: Ein API-Key mit Scope kann nie mehr als sein Scope — und
// nie mehr als sein Besitzer (Schnittmenge, keine Vereinigung).
const READ_PERMISSIONS: ReadonlySet<string> = new Set([
  PERMISSIONS.PROJECT_READ,
  PERMISSIONS.ELEMENT_READ,
  PERMISSIONS.CONNECTION_READ,
  PERMISSIONS.ANALYTICS_VIEW,
  PERMISSIONS.GOVERNANCE_VIEW,
  PERMISSIONS.ADMIN_VIEW_AUDIT,
]);

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

export function isKnownPermission(value: unknown): value is Permission {
  return typeof value === 'string' && KNOWN_PERMISSIONS.has(value);
}

/**
 * Viele Schreib-Routen pruefen keine Einzel-Permission. Ein Key, dessen Scope
 * nur Lese-Rechte enthaelt, darf deshalb grundsaetzlich nicht schreiben.
 */
export function isReadOnlyScope(scope: readonly string[]): boolean {
  return scope.every((p) => READ_PERMISSIONS.has(p));
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = user.role as keyof typeof ROLE_PERMISSIONS;
    const rolePerms = ROLE_PERMISSIONS[userRole] || [];

    const allPerms = new Set([...rolePerms, ...(user.permissions || [])]);
    if (req.apiKeyScope) {
      const scope = new Set(req.apiKeyScope);
      for (const p of allPerms) if (!scope.has(p)) allPerms.delete(p);
    }

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

/**
 * Fuer Aktionen, die Zugangsdaten verwalten: nur aus einer interaktiven
 * Sitzung, nie per API-Key — sonst praegt sich ein Scope-Key einen
 * unbeschraenkten Nachfolger (Security-Audit H12).
 */
export function requireInteractiveAuth(req: Request, res: Response, next: NextFunction) {
  if (req.authMethod === 'api_key') {
    return res.status(403).json({ error: 'This action requires an interactive session, not an API key' });
  }
  next();
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
