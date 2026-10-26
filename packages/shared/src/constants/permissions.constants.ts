import type { UserRole } from '../types/user.types';

export const PERMISSIONS = {
  // Project
  PROJECT_CREATE: 'project:create',
  PROJECT_READ: 'project:read',
  PROJECT_UPDATE: 'project:update',
  PROJECT_DELETE: 'project:delete',
  PROJECT_MANAGE_COLLABORATORS: 'project:manage_collaborators',

  // Elements
  ELEMENT_CREATE: 'element:create',
  ELEMENT_READ: 'element:read',
  ELEMENT_UPDATE: 'element:update',
  ELEMENT_DELETE: 'element:delete',

  // Connections
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_READ: 'connection:read',
  CONNECTION_UPDATE: 'connection:update',
  CONNECTION_DELETE: 'connection:delete',

  // Analytics
  ANALYTICS_VIEW: 'analytics:view',
  ANALYTICS_SIMULATE: 'analytics:simulate',

  // Governance
  GOVERNANCE_VIEW: 'governance:view',
  GOVERNANCE_APPROVE: 'governance:approve',
  GOVERNANCE_MANAGE_POLICIES: 'governance:manage_policies',

  // Admin
  ADMIN_MANAGE_USERS: 'admin:manage_users',
  ADMIN_VIEW_AUDIT: 'admin:view_audit',
  ADMIN_SYSTEM_CONFIG: 'admin:system_config',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Plattform-Admins: implizit Zugriff auf JEDES Projekt und auf
 * plattformweite Admin-Flächen (Nutzerverzeichnis, Audit-Log, Ops-Register).
 *
 * Nur chief_architect. Jede Selbstregistrierung wird enterprise_architect —
 * stünde diese Rolle hier, könnte jeder aus dem Internet alle Mandanten lesen
 * und löschen (Security-Audit C1). Projektzugriff kommt sonst ausschließlich
 * über Eigentum oder Mitgliedschaft.
 */
export const PLATFORM_ADMIN_ROLES: readonly UserRole[] = ['chief_architect'];

export function isPlatformAdmin(role: string | undefined | null): boolean {
  return !!role && (PLATFORM_ADMIN_ROLES as readonly string[]).includes(role);
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  chief_architect: Object.values(PERMISSIONS),

  // Alles innerhalb eigener Projekte inkl. Policy-Verwaltung — aber KEINE
  // plattformweiten Admin-Rechte: das ist die Rolle jeder Selbstregistrierung
  // (Security-Audit C1). (18 permissions)
  enterprise_architect: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.PROJECT_MANAGE_COLLABORATORS,
    PERMISSIONS.ELEMENT_CREATE,
    PERMISSIONS.ELEMENT_READ,
    PERMISSIONS.ELEMENT_UPDATE,
    PERMISSIONS.ELEMENT_DELETE,
    PERMISSIONS.CONNECTION_CREATE,
    PERMISSIONS.CONNECTION_READ,
    PERMISSIONS.CONNECTION_UPDATE,
    PERMISSIONS.CONNECTION_DELETE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_SIMULATE,
    PERMISSIONS.GOVERNANCE_VIEW,
    PERMISSIONS.GOVERNANCE_APPROVE,
    PERMISSIONS.GOVERNANCE_MANAGE_POLICIES,
  ],

  // Peer architect roles: full CRUD + analytics + governance approve (15 permissions)
  solution_architect: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.PROJECT_MANAGE_COLLABORATORS,
    PERMISSIONS.ELEMENT_CREATE,
    PERMISSIONS.ELEMENT_READ,
    PERMISSIONS.ELEMENT_UPDATE,
    PERMISSIONS.ELEMENT_DELETE,
    PERMISSIONS.CONNECTION_CREATE,
    PERMISSIONS.CONNECTION_READ,
    PERMISSIONS.CONNECTION_UPDATE,
    PERMISSIONS.CONNECTION_DELETE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_SIMULATE,
    PERMISSIONS.GOVERNANCE_VIEW,
    PERMISSIONS.GOVERNANCE_APPROVE,
  ],

  data_architect: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.PROJECT_MANAGE_COLLABORATORS,
    PERMISSIONS.ELEMENT_CREATE,
    PERMISSIONS.ELEMENT_READ,
    PERMISSIONS.ELEMENT_UPDATE,
    PERMISSIONS.ELEMENT_DELETE,
    PERMISSIONS.CONNECTION_CREATE,
    PERMISSIONS.CONNECTION_READ,
    PERMISSIONS.CONNECTION_UPDATE,
    PERMISSIONS.CONNECTION_DELETE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_SIMULATE,
    PERMISSIONS.GOVERNANCE_VIEW,
    PERMISSIONS.GOVERNANCE_APPROVE,
  ],

  business_architect: [
    PERMISSIONS.PROJECT_CREATE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_UPDATE,
    PERMISSIONS.PROJECT_DELETE,
    PERMISSIONS.PROJECT_MANAGE_COLLABORATORS,
    PERMISSIONS.ELEMENT_CREATE,
    PERMISSIONS.ELEMENT_READ,
    PERMISSIONS.ELEMENT_UPDATE,
    PERMISSIONS.ELEMENT_DELETE,
    PERMISSIONS.CONNECTION_CREATE,
    PERMISSIONS.CONNECTION_READ,
    PERMISSIONS.CONNECTION_UPDATE,
    PERMISSIONS.CONNECTION_DELETE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_SIMULATE,
    PERMISSIONS.GOVERNANCE_VIEW,
    PERMISSIONS.GOVERNANCE_APPROVE,
  ],

  // Read-only + simulate (6 permissions)
  analyst: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.ELEMENT_READ,
    PERMISSIONS.CONNECTION_READ,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ANALYTICS_SIMULATE,
    PERMISSIONS.GOVERNANCE_VIEW,
  ],

  // Strictly read-only (5 permissions)
  viewer: [
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.ELEMENT_READ,
    PERMISSIONS.CONNECTION_READ,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.GOVERNANCE_VIEW,
  ],
};
