/**
 * UC-METH-002 (REQ .1) — writes a planned group in one Neo4j write transaction: the group element,
 * then one composition from the group to each member. Both ends are scoped to the project.
 * If fewer compositions are created than planned (a member was deleted after the route read it),
 * the work throws and executeWrite rolls the whole transaction back: no group without its members.
 */
import { getNeo4jDriver } from '../../config/neo4j';
import { coerceNeo4jNumber } from '../compliance.service';
import { provenanceCypherFragment, provenanceInlineFragment } from '../provenance.helper';

export class GroupMembersChangedError extends Error {
  constructor(expected: number, created: number) {
    super(`Expected ${expected} compositions, created ${created}: a member is no longer in the project`);
    this.name = 'GroupMembersChangedError';
  }
}

export interface GroupWrite {
  projectId: string;
  groupId: string;
  name: string;
  type: 'grouping' | 'location';
  layer: string;
  togafDomain: string;
  position: { x: number; y: number; z: number };
  members: Array<{ id: string; connectionId: string }>;
  /** Output of provenanceParams(...): prov_* parameters. */
  provenance: Record<string, unknown>;
}

export async function writeGroup(w: GroupWrite): Promise<void> {
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (g:ArchitectureElement {
           id: $groupId, projectId: $projectId, type: $type, name: $name, description: '',
           layer: $layer, togafDomain: $togafDomain, maturityLevel: 1, riskLevel: 'low', status: 'current',
           posX: $posX, posY: $posY, posZ: $posZ, metadataJson: '{}',
           ${provenanceInlineFragment()},
           createdAt: datetime(), updatedAt: datetime()
         })`,
        {
          groupId: w.groupId, projectId: w.projectId, type: w.type, name: w.name,
          layer: w.layer, togafDomain: w.togafDomain,
          posX: w.position.x, posY: w.position.y, posZ: w.position.z,
          ...w.provenance,
        },
      );
      const result = await tx.run(
        `MATCH (g:ArchitectureElement {id: $groupId, projectId: $projectId})
         MATCH (t:ArchitectureElement {projectId: $projectId}) WHERE t.id IN $memberIds
         WITH g, t, [m IN $members WHERE m.id = t.id][0] AS m
         CREATE (g)-[r:CONNECTS_TO {id: m.connectionId, sourceElementId: $groupId, targetElementId: t.id, type: 'composition', label: ''}]->(t)
         SET r.createdAt = timestamp(), ${provenanceCypherFragment('r')}
         RETURN count(r) AS created`,
        { groupId: w.groupId, projectId: w.projectId, members: w.members, memberIds: w.members.map((m) => m.id), ...w.provenance },
      );
      const created = coerceNeo4jNumber(result.records[0]?.get('created'), 0);
      if (created !== w.members.length) throw new GroupMembersChangedError(w.members.length, created);
    });
  } finally {
    await session.close();
  }
}
