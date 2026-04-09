import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';
import { PERMISSIONS } from '@thearchitect/shared';
import { ApprovalRequest } from '../models/ApprovalRequest';
import { Policy } from '../models/Policy';
import { PolicyViolation } from '../models/PolicyViolation';
import { AuditLog } from '../models/AuditLog';
import { checkCompliance } from '../services/compliance.service';
import { syncPolicyToNeo4j, syncPolicyInfluenceRelationships, removePolicyFromNeo4j } from '../services/policy-graph.service';
import { evaluateAllForPolicy } from '../services/policy-evaluation.service';
import { SEED_POLICIES } from '../data/seed-policies';

const router = Router();

router.use(authenticate);

// ─── Approval Requests ───

// List approval requests for a project
router.get(
  '/:projectId/approvals',
  requireProjectAccess('viewer'),
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
  requireProjectAccess('editor'),
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
  requireProjectAccess('reviewer'),
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
  requireProjectAccess('viewer'),
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
  requireProjectAccess('viewer'),
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
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  audit({ action: 'create_policy', entityType: 'policy' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { name, description, category, framework, severity, scope, rules, status, source, effectiveFrom, effectiveUntil } = req.body;

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
        status: status || 'active',
        source: source || 'custom',
        scope: scope || { domains: [], elementTypes: [], layers: [] },
        rules,
        effectiveFrom: effectiveFrom || undefined,
        effectiveUntil: effectiveUntil || undefined,
        createdBy: req.user!._id,
      });

      res.status(201).json({ success: true, data: policy });

      // Sync to Neo4j and evaluate against existing elements
      syncPolicyToNeo4j(policy, projectId)
        .then(() => syncPolicyInfluenceRelationships(policy, projectId))
        .then(() => {
          if (policy.status === 'active' && policy.enabled) {
            return evaluateAllForPolicy(projectId, policy._id.toString());
          }
        })
        .catch((e) => console.error('[Governance] create policy hooks error:', e));
    } catch (err) {
      console.error('Create policy error:', err);
      res.status(500).json({ success: false, error: 'Failed to create policy' });
    }
  }
);

// Update policy
router.put(
  '/:projectId/policies/:policyId',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  audit({ action: 'update_policy', entityType: 'policy' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const policyId = String(req.params.policyId);

      const policy = await Policy.findByIdAndUpdate(
        policyId,
        { ...req.body, updatedBy: req.user!._id, $inc: { version: 1 } },
        { new: true },
      );
      if (!policy) return res.status(404).json({ success: false, error: 'Policy not found' });
      res.json({ success: true, data: policy });

      // Re-sync Neo4j and re-evaluate
      syncPolicyToNeo4j(policy, projectId)
        .then(() => syncPolicyInfluenceRelationships(policy, projectId))
        .then(() => {
          if (policy.status === 'active' && policy.enabled) {
            return evaluateAllForPolicy(projectId, policyId);
          }
        })
        .catch((e) => console.error('[Governance] update policy hooks error:', e));
    } catch (err) {
      console.error('Update policy error:', err);
      res.status(500).json({ success: false, error: 'Failed to update policy' });
    }
  }
);

// Delete policy
router.delete(
  '/:projectId/policies/:policyId',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  audit({ action: 'delete_policy', entityType: 'policy' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const policyId = String(req.params.policyId);

      // Soft-delete: archive the policy
      const policy = await Policy.findByIdAndUpdate(
        policyId,
        { status: 'archived', enabled: false, updatedBy: req.user!._id },
        { new: true },
      );
      if (!policy) return res.status(404).json({ success: false, error: 'Policy not found' });

      // Resolve all open violations for this policy
      await PolicyViolation.updateMany(
        { policyId, status: 'open' },
        { $set: { status: 'resolved', resolvedAt: new Date(), details: 'Policy archived' } },
      );

      // Remove from Neo4j graph
      removePolicyFromNeo4j(policyId).catch((e) =>
        console.error('[Governance] remove policy from Neo4j error:', e),
      );

      res.json({ success: true, data: policy });
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
  requireProjectAccess('viewer'),
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
  requireProjectAccess('viewer'),
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

// ─── Policy Violations ───

// List violations for a project
router.get(
  '/:projectId/violations',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const status = (req.query.status as string) || 'open';
      const severity = req.query.severity as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const filter: Record<string, unknown> = { projectId, status };
      if (severity) filter.severity = severity;

      const [violations, total] = await Promise.all([
        PolicyViolation.find(filter)
          .sort({ detectedAt: -1 })
          .skip(offset)
          .limit(limit)
          .populate('policyId', 'name category severity source'),
        PolicyViolation.countDocuments(filter),
      ]);

      // Enrich with policy name
      const enriched = violations.map((v) => {
        const doc = v.toObject();
        const policy = doc.policyId as unknown as { name?: string } | null;
        return {
          ...doc,
          policyId: v.policyId?._id || v.policyId,
          policyName: policy?.name || 'Unknown',
        };
      });

      res.json({ success: true, data: enriched, total, limit, offset });
    } catch (err) {
      console.error('List violations error:', err);
      res.status(500).json({ success: false, error: 'Failed to list violations' });
    }
  }
);

// Get violations for a specific element
router.get(
  '/:projectId/violations/by-element/:elementId',
  requireProjectAccess('viewer'),
  requirePermission(PERMISSIONS.GOVERNANCE_VIEW),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const elementId = String(req.params.elementId);

      const violations = await PolicyViolation.find({
        projectId,
        elementId,
        status: 'open',
      }).populate('policyId', 'name category severity source');

      const enriched = violations.map((v) => {
        const doc = v.toObject();
        const policy = doc.policyId as unknown as { name?: string } | null;
        return {
          ...doc,
          policyId: v.policyId?._id || v.policyId,
          policyName: policy?.name || 'Unknown',
        };
      });

      res.json({ success: true, data: enriched });
    } catch (err) {
      console.error('Element violations error:', err);
      res.status(500).json({ success: false, error: 'Failed to get element violations' });
    }
  }
);

// Re-evaluate all active policies against current elements
router.post(
  '/:projectId/violations/re-evaluate',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const policies = await Policy.find({
        projectId,
        enabled: true,
        status: { $in: ['active', undefined, null] },
      });

      let evaluated = 0;
      for (const policy of policies) {
        await evaluateAllForPolicy(projectId, policy._id.toString());
        evaluated++;
      }

      res.json({ success: true, data: { policiesEvaluated: evaluated } });
    } catch (err) {
      console.error('Re-evaluate violations error:', err);
      res.status(500).json({ success: false, error: 'Failed to re-evaluate policies' });
    }
  }
);

// ─── Seed Policy Templates ───

// Apply seed policy templates
router.post(
  '/:projectId/policies/seed',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.GOVERNANCE_MANAGE_POLICIES),
  audit({ action: 'seed_policies', entityType: 'policy' }),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const { templates } = req.body as { templates: string[] };

      if (!templates || !Array.isArray(templates) || templates.length === 0) {
        return res.status(400).json({ success: false, error: 'templates array is required' });
      }

      const validTemplates = ['dora', 'nis2', 'togaf'];
      const selected = templates.filter((t) => validTemplates.includes(t));

      if (selected.length === 0) {
        return res.status(400).json({ success: false, error: `Valid templates: ${validTemplates.join(', ')}` });
      }

      const seedPolicies = SEED_POLICIES.filter((sp) => selected.includes(sp.source));
      const created: string[] = [];

      for (const seed of seedPolicies) {
        // Skip if a policy with the same name already exists in this project
        const exists = await Policy.findOne({ projectId, name: seed.name });
        if (exists) continue;

        const policy = await Policy.create({
          projectId,
          name: seed.name,
          description: seed.description,
          category: seed.category,
          framework: seed.framework,
          severity: seed.severity,
          status: 'draft', // Templates start as draft
          source: seed.source,
          scope: seed.scope,
          rules: seed.rules,
          createdBy: req.user!._id,
        });

        created.push(policy.name);
      }

      res.status(201).json({
        success: true,
        data: { created: created.length, policies: created },
        message: `${created.length} seed policies created as draft`,
      });
    } catch (err) {
      console.error('Seed policies error:', err);
      res.status(500).json({ success: false, error: 'Failed to seed policies' });
    }
  }
);

export default router;
