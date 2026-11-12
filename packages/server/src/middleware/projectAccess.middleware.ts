import { Request, Response, NextFunction } from 'express';
import { isPlatformAdmin } from '@thearchitect/shared';
import { Project } from '../models/Project';

const PROJECT_ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  editor: 3,
  reviewer: 2,
  viewer: 1,
};

type ProjectMembership = {
  ownerId: { toString(): string };
  collaborators: Array<{ userId: { toString(): string }; role?: string }>;
};

/** Projektrolle des Nutzers: 'owner', die Collaborator-Rolle oder null (kein Mitglied). */
export function projectRoleOf(project: ProjectMembership, userId: string): string | null {
  if (project.ownerId.toString() === userId) return 'owner';
  const collaborator = project.collaborators.find((c) => c.userId.toString() === userId);
  return collaborator ? collaborator.role || 'viewer' : null;
}

export function hasProjectRole(role: string | null | undefined, minProjectRole: string): boolean {
  return (PROJECT_ROLE_HIERARCHY[role ?? ''] || 0) >= (PROJECT_ROLE_HIERARCHY[minProjectRole] || 0);
}

/**
 * Middleware that checks if the authenticated user has access to the project.
 * Looks for projectId in req.params.projectId or req.params.id.
 *
 * @param minProjectRole - Minimum project-level role required (optional).
 *   'viewer' < 'reviewer' < 'editor' < 'owner'
 *   If omitted, any access (owner or collaborator) is sufficient.
 */
export function requireProjectAccess(minProjectRole?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const projectId = req.params.projectId || req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID required' });
    }

    // Nur Plattform-Admins haben impliziten Zugriff (Security-Audit C1)
    if (isPlatformAdmin(user.role)) {
      return next();
    }

    try {
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const userProjectRole = projectRoleOf(project, user._id.toString());
      if (!userProjectRole) {
        return res.status(403).json({ error: 'Access denied — not a project member' });
      }

      // Owner passes every level; collaborators need the minimum role
      if (minProjectRole && !hasProjectRole(userProjectRole, minProjectRole)) {
        return res.status(403).json({
          error: 'Insufficient project role',
          required: minProjectRole,
          current: userProjectRole,
        });
      }

      (req as any).project = project;
      (req as any).projectRole = userProjectRole;
      next();
    } catch (err) {
      console.error('Project access check error:', err);
      res.status(500).json({ error: 'Failed to verify project access' });
    }
  };
}
