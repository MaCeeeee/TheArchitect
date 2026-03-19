import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { Invitation } from '../models/Invitation';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit, createAuditEntry } from '../middleware/audit.middleware';
import { sendProjectInvitationEmail } from '../services/email.service';
import { PERMISSIONS } from '@thearchitect/shared';

const router = Router();

const INVITATION_EXPIRY_DAYS = 7;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Project-scoped routes (require auth + project access) ──────

// List pending invitations for a project
router.get(
  '/:id/invitations',
  authenticate,
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const invitations = await Invitation.find({
        projectId: req.params.id,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      })
        .populate('inviterUserId', 'name email')
        .sort({ createdAt: -1 });

      res.json({ data: invitations });
    } catch (err) {
      console.error('List invitations error:', err);
      res.status(500).json({ error: 'Failed to list invitations' });
    }
  }
);

// Create invitation (send email)
router.post(
  '/:id/invitations',
  authenticate,
  requirePermission(PERMISSIONS.PROJECT_MANAGE_COLLABORATORS),
  requireProjectAccess('editor'),
  audit({ action: 'create_invitation', entityType: 'invitation', riskLevel: 'medium' }),
  async (req: Request, res: Response) => {
    try {
      const { email, role = 'viewer' } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const validRoles = ['editor', 'reviewer', 'viewer'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be editor, reviewer, or viewer.' });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // Check if user is already owner or collaborator
      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        if (project.ownerId.toString() === existingUser._id.toString()) {
          return res.status(409).json({ error: 'User is the project owner' });
        }
        const isCollaborator = project.collaborators.some(
          (c) => c.userId.toString() === existingUser._id.toString()
        );
        if (isCollaborator) {
          return res.status(409).json({ error: 'User is already a collaborator' });
        }
      }

      // Check for existing pending invitation
      const existingInvite = await Invitation.findOne({
        projectId: req.params.id,
        invitedEmail: normalizedEmail,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      });
      if (existingInvite) {
        return res.status(409).json({ error: 'An invitation is already pending for this email' });
      }

      // Create invitation — store hashed token, send raw token in email
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = hashToken(rawToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

      const invitation = await Invitation.create({
        projectId: req.params.id,
        invitedEmail: normalizedEmail,
        inviterUserId: req.user!._id,
        role,
        token: hashedToken,
        expiresAt,
      });

      // Send email with raw (unhashed) token
      const inviterName = req.user!.name || req.user!.email;
      await sendProjectInvitationEmail(
        normalizedEmail,
        inviterName,
        project.name,
        role,
        rawToken,
        INVITATION_EXPIRY_DAYS
      );

      const populated = await invitation.populate('inviterUserId', 'name email');

      res.status(201).json(populated);
    } catch (err) {
      console.error('Create invitation error:', err);
      res.status(500).json({ error: 'Failed to create invitation' });
    }
  }
);

// Resend invitation email
router.post(
  '/:id/invitations/:invitationId/resend',
  authenticate,
  requirePermission(PERMISSIONS.PROJECT_MANAGE_COLLABORATORS),
  requireProjectAccess('editor'),
  async (req: Request, res: Response) => {
    try {
      const invitation = await Invitation.findOne({
        _id: req.params.invitationId,
        projectId: req.params.id,
        status: 'pending',
      });
      if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

      if (invitation.expiresAt < new Date()) {
        return res.status(410).json({ error: 'Invitation has expired' });
      }

      const project = await Project.findById(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // Generate new token on resend (old hash becomes invalid)
      const newRawToken = crypto.randomBytes(32).toString('hex');
      invitation.token = hashToken(newRawToken);
      await invitation.save();

      const inviterName = req.user!.name || req.user!.email;
      const daysLeft = Math.ceil((invitation.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      await sendProjectInvitationEmail(
        invitation.invitedEmail,
        inviterName,
        project.name,
        invitation.role,
        newRawToken,
        daysLeft
      );

      res.json({ message: 'Invitation resent' });
    } catch (err) {
      console.error('Resend invitation error:', err);
      res.status(500).json({ error: 'Failed to resend invitation' });
    }
  }
);

// Cancel invitation
router.delete(
  '/:id/invitations/:invitationId',
  authenticate,
  requirePermission(PERMISSIONS.PROJECT_MANAGE_COLLABORATORS),
  requireProjectAccess('editor'),
  audit({ action: 'cancel_invitation', entityType: 'invitation', riskLevel: 'low' }),
  async (req: Request, res: Response) => {
    try {
      const invitation = await Invitation.findOneAndUpdate(
        {
          _id: req.params.invitationId,
          projectId: req.params.id,
          status: 'pending',
        },
        { status: 'cancelled', respondedAt: new Date() },
        { new: true }
      );
      if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

      res.json({ message: 'Invitation cancelled' });
    } catch (err) {
      console.error('Cancel invitation error:', err);
      res.status(500).json({ error: 'Failed to cancel invitation' });
    }
  }
);

// ── Public invitation routes (token-based, no project access needed) ──────

// Get invitation details by token (for accept/decline page)
router.get(
  '/invitations/by-token/:token',
  async (req: Request, res: Response) => {
    try {
      const invitation = await Invitation.findOne({ token: hashToken(req.params.token as string) })
        .populate('inviterUserId', 'name email avatarUrl')
        .populate('projectId', 'name description');

      if (!invitation) return res.status(404).json({ error: 'Invitation not found' });

      if (invitation.status !== 'pending') {
        return res.status(410).json({ error: 'Invitation is no longer valid', status: invitation.status });
      }

      if (invitation.expiresAt < new Date()) {
        invitation.status = 'expired';
        await invitation.save();
        return res.status(410).json({ error: 'Invitation has expired', status: 'expired' });
      }

      res.json({
        id: invitation._id,
        projectName: (invitation.projectId as any).name,
        projectDescription: (invitation.projectId as any).description,
        inviterName: (invitation.inviterUserId as any).name,
        inviterEmail: (invitation.inviterUserId as any).email,
        inviterAvatar: (invitation.inviterUserId as any).avatarUrl,
        role: invitation.role,
        invitedEmail: invitation.invitedEmail,
        expiresAt: invitation.expiresAt,
      });
    } catch (err) {
      console.error('Get invitation error:', err);
      res.status(500).json({ error: 'Failed to get invitation' });
    }
  }
);

// Accept invitation (requires auth — user must be logged in)
router.post(
  '/invitations/by-token/:token/accept',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const invitation = await Invitation.findOne({
        token: hashToken(req.params.token as string),
        status: 'pending',
      });

      if (!invitation) return res.status(404).json({ error: 'Invitation not found or already used' });

      if (invitation.expiresAt < new Date()) {
        invitation.status = 'expired';
        await invitation.save();
        return res.status(410).json({ error: 'Invitation has expired' });
      }

      // Verify the logged-in user's email matches the invitation
      const userEmail = req.user!.email.toLowerCase().trim();
      if (userEmail !== invitation.invitedEmail) {
        return res.status(403).json({
          error: 'This invitation was sent to a different email address',
          invitedEmail: invitation.invitedEmail,
        });
      }

      // Add as collaborator
      const project = await Project.findById(invitation.projectId);
      if (!project) return res.status(404).json({ error: 'Project no longer exists' });

      // Double-check not already a collaborator
      const isCollaborator = project.collaborators.some(
        (c) => c.userId.toString() === req.user!._id.toString()
      );
      if (!isCollaborator) {
        project.collaborators.push({
          userId: req.user!._id,
          role: invitation.role,
          joinedAt: new Date(),
        });
        await project.save();
      }

      // Mark invitation as accepted
      invitation.status = 'accepted';
      invitation.respondedAt = new Date();
      await invitation.save();

      // Audit
      await createAuditEntry({
        userId: req.user!._id.toString(),
        action: 'accept_invitation',
        entityType: 'invitation',
        entityId: invitation._id.toString(),
        projectId: invitation.projectId.toString(),
        riskLevel: 'low',
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      res.json({
        message: 'Invitation accepted',
        projectId: invitation.projectId,
        role: invitation.role,
      });
    } catch (err) {
      console.error('Accept invitation error:', err);
      res.status(500).json({ error: 'Failed to accept invitation' });
    }
  }
);

// Decline invitation (requires auth)
router.post(
  '/invitations/by-token/:token/decline',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const invitation = await Invitation.findOne({
        token: hashToken(req.params.token as string),
        status: 'pending',
      });

      if (!invitation) return res.status(404).json({ error: 'Invitation not found or already used' });

      // Verify email matches
      const userEmail = req.user!.email.toLowerCase().trim();
      if (userEmail !== invitation.invitedEmail) {
        return res.status(403).json({ error: 'This invitation was sent to a different email address' });
      }

      invitation.status = 'declined';
      invitation.respondedAt = new Date();
      await invitation.save();

      await createAuditEntry({
        userId: req.user!._id.toString(),
        action: 'decline_invitation',
        entityType: 'invitation',
        entityId: invitation._id.toString(),
        projectId: invitation.projectId.toString(),
        riskLevel: 'low',
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      res.json({ message: 'Invitation declined' });
    } catch (err) {
      console.error('Decline invitation error:', err);
      res.status(500).json({ error: 'Failed to decline invitation' });
    }
  }
);

// List invitations for current user (across all projects)
router.get(
  '/invitations/mine',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const invitations = await Invitation.find({
        invitedEmail: req.user!.email.toLowerCase(),
        status: 'pending',
        expiresAt: { $gt: new Date() },
      })
        .populate('inviterUserId', 'name email avatarUrl')
        .populate('projectId', 'name description')
        .sort({ createdAt: -1 });

      const data = invitations.map((inv) => ({
        id: inv._id,
        token: inv.token,
        projectName: (inv.projectId as any)?.name || 'Deleted Project',
        projectDescription: (inv.projectId as any)?.description || '',
        inviterName: (inv.inviterUserId as any)?.name || 'Unknown',
        inviterAvatar: (inv.inviterUserId as any)?.avatarUrl || '',
        role: inv.role,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      }));

      res.json({ data });
    } catch (err) {
      console.error('List my invitations error:', err);
      res.status(500).json({ error: 'Failed to list invitations' });
    }
  }
);

export default router;
