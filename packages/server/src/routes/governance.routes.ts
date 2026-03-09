import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { audit } from '../middleware/audit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { ApprovalRequest } from '../models/ApprovalRequest';
import { Policy } from '../models/Policy';
import { AuditLog } from '../models/AuditLog';
import { checkCompliance } from '../services/compliance.service';

const router = Router();

router.use(authenticate);

// ─── Approval Requests ───

// List approval requests for a project
router.get(
  '/:projectId/approvals',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const status = req.query.status as string | undefined;
      const filter: Record<string, unknown> = { projectId };
      if (status) filter.status = status;

      const requests = await ApprovalRequest.find(filter)
        .sort({ createdAt: -1 })
        .limit(50);
      res.json({ success: true, data: requests });
    } catch (err) {
      console.error('List approvals error:', err);
      res.status(500).json({ success: false, error: 'Failed to list approvals' });
    }
  }
);

// Create approval request
router.post(
  '/:projectId/approvals',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  audit({ action: 'create_approval', entityType: 'approval' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { type, title, description, entityType, entityId, changes, priority, steps, dueDate } = req.body;

      if (!type || !title || !steps || !Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({ success: false, error: 'type, title, and steps are required' });
      }

      const approval = await ApprovalRequest.create({
        projectId,
        requesterId: req.user!._id,
        requesterName: req.user!.name,
        type,
        title,
        description,
        entityType,
        entityId,
        changes,
        priority: priority || 'medium',
        steps: steps.map((s: { approverId: string; approverName: string }) => ({
          approverId: s.approverId,
          approverName: s.approverName,
          status: 'pending',
          comment: '',
        })),
        currentStep: 0,
        dueDate,
      });

      res.status(201).json({ success: true, data: approval });
    } catch (err) {
      console.error('Create approval error:', err);
      res.status(500).json({ success: false, error: 'Failed to create approval' });
    }
  }
);

// Approve or reject a step
router.put(
  '/:projectId/approvals/:approvalId/decide',
  requirePermission(PERMISSIONS.GOVERNANCE_APPROVE),
  audit({ action: 'decide_approval', entityType: 'approval' }),
  async (req: Request, res: Response) => {
    try {
      const approvalId = String(req.params.approvalId);
      const { decision, comment } = req.body;

      if (!decision || !['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ success: false, error: 'decision must be approved or rejected' });
      }

      const approval = await ApprovalRequest.findById(approvalId);
      if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });
      if (approval.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Approval is not pending' });
      }

      const step = approval.steps[approval.currentStep];
      if (!step || step.approverId.toString() !== req.user!._id.toString()) {
        return res.status(403).json({ success: false, error: 'Not authorized to decide this step' });
      }

      step.status = decision;
      step.comment = comment || '';
      step.decidedAt = new Date();

      if (decision === 'rejected') {
        approval.status = 'rejected';
      } else if (approval.currentStep >= approval.steps.length - 1) {
        approval.status = 'approved';
      } else {
        approval.currentStep++;
      }

      await approval.save();
      res.json({ success: true, data: approval });
    } catch (err) {
      console.error('Decide approval error:', err);
      res.status(500).json({ success: false, error: 'Failed to process decision' });
    }
  }
);

// Cancel approval request (requester only)
router.put(
  '/:projectId/approvals/:approvalId/cancel',
  async (req: Request, res: Response) => {
    try {
      const approvalId = String(req.params.approvalId);
      const approval = await ApprovalRequest.findById(approvalId);
      if (!approval) return res.status(404).json({ success: false, error: 'Not found' });
      if (approval.requesterId.toString() !== req.user!._id.toString()) {
        return res.status(403).json({ success: false, error: 'Only requester can cancel' });
      }
      if (approval.status !== 'pending') {
        return res.status(400).json({ success: false, error: 'Cannot cancel non-pending request' });
      }

      approval.status = 'cancelled';
      await approval.save();
      res.json({ success: true, data: approval });
    } catch (err) {
      console.error('Cancel approval error:', err);
      res.status(500).json({ success: false, error: 'Failed to cancel' });
    }
  }
);

// ─── Policies ───

// List policies for a project
router.get(
  '/:projectId/policies',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const policies = await Policy.find({ projectId }).sort({ category: 1, name: 1 });
      res.json({ success: true, data: policies });
    } catch (err) {
      console.error('List policies error:', err);
      res.status(500).json({ success: false, error: 'Failed to list policies' });
    }
  }
);

// Create policy
router.post(
  '/:projectId/policies',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  audit({ action: 'create_policy', entityType: 'policy' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { name, description, category, framework, severity, scope, rules } = req.body;

      if (!name || !category || !rules || !Array.isArray(rules)) {
        return res.status(400).json({ success: false, error: 'name, category, and rules are required' });
      }

      const policy = await Policy.create({
        projectId,
        name,
        description,
        category,
        framework: framework || 'TOGAF 10',
        severity: severity || 'warning',
        scope: scope || { domains: [], elementTypes: [], layers: [] },
        rules,
        createdBy: req.user!._id,
      });

      res.status(201).json({ success: true, data: policy });
    } catch (err) {
      console.error('Create policy error:', err);
      res.status(500).json({ success: false, error: 'Failed to create policy' });
    }
  }
);

// Update policy
router.put(
  '/:projectId/policies/:policyId',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  audit({ action: 'update_policy', entityType: 'policy' }),
  async (req: Request, res: Response) => {
    try {
      const policyId = String(req.params.policyId);
      const policy = await Policy.findByIdAndUpdate(policyId, req.body, { new: true });
      if (!policy) return res.status(404).json({ success: false, error: 'Policy not found' });
      res.json({ success: true, data: policy });
    } catch (err) {
      console.error('Update policy error:', err);
      res.status(500).json({ success: false, error: 'Failed to update policy' });
    }
  }
);

// Delete policy
router.delete(
  '/:projectId/policies/:policyId',
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  audit({ action: 'delete_policy', entityType: 'policy' }),
  async (req: Request, res: Response) => {
    try {
      const policyId = String(req.params.policyId);
      await Policy.findByIdAndDelete(policyId);
      res.json({ success: true });
    } catch (err) {
      console.error('Delete policy error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete policy' });
    }
  }
);

// ─── Compliance ───

// Run compliance check
router.get(
  '/:projectId/compliance',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const report = await checkCompliance(projectId);
      res.json({ success: true, data: report });
    } catch (err) {
      console.error('Compliance check error:', err);
      res.status(500).json({ success: false, error: 'Compliance check failed' });
    }
  }
);

// ─── Audit Trail ───

// Get project audit log
router.get(
  '/:projectId/audit-log',
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const action = req.query.action as string | undefined;

      const filter: Record<string, unknown> = { projectId };
      if (action) filter.action = action;

      const [logs, total] = await Promise.all([
        AuditLog.find(filter).sort({ timestamp: -1 }).skip(offset).limit(limit).populate('userId', 'name email'),
        AuditLog.countDocuments(filter),
      ]);

      res.json({ success: true, data: { logs, total, limit, offset } });
    } catch (err) {
      console.error('Audit log error:', err);
      res.status(500).json({ success: false, error: 'Failed to get audit log' });
    }
  }
);

export default router;
