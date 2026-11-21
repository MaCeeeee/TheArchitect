/**
 * UC-METH-002 (REQ .1) — make a group in one step: a Grouping (or Location) element and one
 * composition from it to each valid member, in one transaction.
 * Members that ArchiMate does not allow are skipped and returned with their reason.
 */
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { PERMISSIONS } from '@thearchitect/shared';
import { authenticate } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { requireProjectAccess } from '../middleware/projectAccess.middleware';
import { audit } from '../middleware/audit.middleware';
import { runCypher } from '../config/neo4j';
import { coerceNeo4jNumber } from '../services/compliance.service';
import { provenanceForActor, provenanceParams } from '../services/provenance.helper';
import { upsertEmbedding } from '../services/elementSimilarity.service';
import { evaluateElementPolicies } from '../services/policy-evaluation.service';
import { GROUP_TYPES, MAX_GROUP_MEMBERS, MIN_GROUP_MEMBERS, planGroup, type MemberRow } from '../services/groups/planGroup';
import { GroupMembersChangedError, writeGroup } from '../services/groups/groupWriter';
import { log } from '../config/logger';

const router = Router();
router.use(authenticate);

const CreateGroupSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(GROUP_TYPES).default('grouping'),
  memberIds: z.array(z.string().min(1)).min(1).max(MAX_GROUP_MEMBERS),
});

interface GroupResponseBody {
  data?: { element: { id: string; name: string; type: string }; connections: unknown[]; skipped: unknown[] };
}

router.post(
  '/:projectId/groups',
  requireProjectAccess('editor'),
  requirePermission(PERMISSIONS.ELEMENT_CREATE),
  requirePermission(PERMISSIONS.CONNECTION_CREATE),
  audit({
    action: 'create_group',
    entityType: 'element',
    getAfter: (_req: Request, body: unknown) => {
      const data = (body as GroupResponseBody | undefined)?.data;
      return data
        ? { groupId: data.element.id, name: data.element.name, type: data.element.type, members: data.connections.length, skipped: data.skipped.length }
        : {};
    },
  }),
  async (req: Request, res: Response) => {
    const parsed = CreateGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.errors });
      return;
    }
    const projectId = String(req.params.projectId);
    const { name, type } = parsed.data;
    const ids = [...new Set(parsed.data.memberIds)];
    try {
      const records = await runCypher(
        `MATCH (e:ArchitectureElement {projectId: $projectId}) WHERE e.id IN $ids
         RETURN e.id AS id, e.name AS name, e.type AS type, e.posX AS posX, e.posY AS posY, e.posZ AS posZ`,
        { projectId, ids },
      );
      const rows: MemberRow[] = records.map((r) => ({
        id: String(r.get('id')),
        name: String(r.get('name') ?? ''),
        type: String(r.get('type') ?? ''),
        posX: r.get('posX') == null ? null : coerceNeo4jNumber(r.get('posX'), 0),
        posY: r.get('posY') == null ? null : coerceNeo4jNumber(r.get('posY'), 0),
        posZ: r.get('posZ') == null ? null : coerceNeo4jNumber(r.get('posZ'), 0),
      }));
      const found = new Set(rows.map((r) => r.id));
      const unknownIds = ids.filter((id) => !found.has(id));
      if (unknownIds.length > 0) {
        res.status(400).json({ success: false, error: 'Unknown members', unknownIds });
        return;
      }

      const plan = planGroup(type, rows);
      if (plan.members.length < MIN_GROUP_MEMBERS) {
        res.status(400).json({ success: false, error: 'A group needs a minimum of 2 valid members', skipped: plan.skipped });
        return;
      }

      const groupId = uuid();
      const members = plan.members.map((m) => ({ id: m.id, connectionId: uuid() }));
      await writeGroup({
        projectId, groupId, name, type,
        layer: plan.layer, togafDomain: plan.togafDomain, position: plan.position, members,
        provenance: provenanceParams(provenanceForActor(!!(req as Request & { apiKeyPrefix?: string }).apiKeyPrefix)),
      });

      const element = {
        id: groupId, projectId, type, name, description: '',
        layer: plan.layer, togafDomain: plan.togafDomain,
        maturityLevel: 1, riskLevel: 'low', status: 'current',
        position3D: plan.position, metadata: {},
      };
      const connections = members.map((m) => ({ id: m.connectionId, sourceId: groupId, targetId: m.id, type: 'composition', label: '' }));
      res.status(201).json({ success: true, data: { element, connections, skipped: plan.skipped } });

      evaluateElementPolicies(projectId, groupId, 'create').catch((e) => log.warn({ err: (e as Error).message, projectId }, '[groups] policy hook failed'));
      upsertEmbedding(projectId, { id: groupId, name, description: '', type, layer: plan.layer, projectId }).catch((e) =>
        log.warn({ err: (e as Error).message, projectId, elementId: groupId }, '[groups] similarity hook failed'),
      );
    } catch (err) {
      if (err instanceof GroupMembersChangedError) {
        res.status(409).json({ success: false, error: 'A member is no longer in the project. Nothing was created.' });
        return;
      }
      log.error({ err: (err as Error).message, projectId }, '[groups] create failed');
      res.status(500).json({ success: false, error: 'Failed to create group' });
    }
  },
);

export default router;
