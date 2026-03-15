import { Request, Response, NextFunction } from 'express';
import { Project } from '../models/Project';

const PROJECT_ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  editor: 3,
  reviewer: 2,
  viewer: 1,
};

// System roles that get implicit full access to all projects
const SYSTEM_ADMIN_ROLES = ['chief_architect'];

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

    // System admins get implicit access
    if (SYSTEM_ADMIN_ROLES.includes(user.role)) {
      return next();
    }

    try {
      const project = await Project.findById(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const userId = user._id.toString();

      // Check if user is owner
      if (project.ownerId.toString() === userId) {
        (req as any).project = project;
        (req as any).projectRole = 'owner';
        return next();
      }

      // Check if user is collaborator
      const collaborator = project.collaborators.find(
        (c) => c.userId.toString() === userId
      );

      if (!collaborator) {
        return res.status(403).json({ error: 'Access denied — not a project member' });
      }

      const userProjectRole = collaborator.role || 'viewer';

      // Check minimum role level if specified
      if (minProjectRole) {
        const requiredLevel = PROJECT_ROLE_HIERARCHY[minProjectRole] || 0;
        const userLevel = PROJECT_ROLE_HIERARCHY[userProjectRole] || 0;
        if (userLevel < requiredLevel) {
          return res.status(403).json({
            error: 'Insufficient project role',
            required: minProjectRole,
            current: userProjectRole,
          });
        }
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
