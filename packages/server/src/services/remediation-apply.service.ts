import { v4 as uuid } from 'uuid';
import { runCypher, runCypherTransaction, serializeNeo4jProperties } from '../config/neo4j';
import { RemediationProposal } from '../models/RemediationProposal';
import { LAYER_Y } from '@thearchitect/shared';
import type { ProposalElement, ProposalConnection } from '@thearchitect/shared';

// ─── Apply Proposal ───

export async function applyProposal(
  projectId: string,
  workspaceId: string,
  proposalId: string,
  userId: string,
  selectedTempIds?: string[],
): Promise<{ elementIds: string[]; connectionIds: string[] }> {
  // Atomically claim the proposal (concurrency guard)
  const proposal = await RemediationProposal.findOneAndUpdate(
    {
      _id: proposalId,
      projectId,
      status: { $in: ['validated', 'draft'] },
    },
    { $set: { status: 'partially_applied' } },
    { new: true },
  );

  if (!proposal) {
    throw new Error('Proposal not found, already applied, or not in a valid state for application.');
  }

  // Filter elements/connections to apply
  let elementsToApply = proposal.elements as unknown as ProposalElement[];
  let connectionsToApply = proposal.connections as unknown as ProposalConnection[];

  if (selectedTempIds && selectedTempIds.length > 0) {
    const selectedSet = new Set(selectedTempIds);
    elementsToApply = elementsToApply.filter((e) => selectedSet.has(e.tempId));
    // Only include connections where both endpoints are selected or existing
    const selectedElementTempIds = new Set(elementsToApply.map((e) => e.tempId));
    connectionsToApply = connectionsToApply.filter((c) => {
      const sourceSelected = selectedElementTempIds.has(c.sourceTempId) || c.sourceTempId.startsWith('existing:');
      const targetSelected = selectedElementTempIds.has(c.targetTempId) || c.targetTempId.startsWith('existing:');
      return sourceSelected && targetSelected;
    });
  }

  if (elementsToApply.length === 0) {
    throw new Error('No elements selected for application.');
  }

  // Build tempId → realId map
  const tempToRealId = new Map<string, string>();
  for (const el of elementsToApply) {
    tempToRealId.set(el.tempId, uuid());
  }

  // Calculate positions (offset after existing elements in each layer)
  const layerOffsets = await getLayerOffsets(projectId);
  const positions = calculatePositions(elementsToApply, layerOffsets);

  // Build Cypher operations for atomic transaction
  const operations: Array<{ query: string; params: Record<string, unknown> }> = [];

  // Create elements
  const createdElementIds: string[] = [];
  for (const el of elementsToApply) {
    const realId = tempToRealId.get(el.tempId)!;
    createdElementIds.push(realId);
    const pos = positions.get(el.tempId) || { x: 0, y: 0, z: 0 };

    operations.push({
      query: `CREATE (e:ArchitectureElement {
        id: $id, projectId: $projectId, workspaceId: $workspaceId,
        type: $type, name: $name, description: $description,
        layer: $layer, togafDomain: $togafDomain,
        maturityLevel: $maturityLevel, riskLevel: $riskLevel, status: $status,
        posX: $posX, posY: $posY, posZ: $posZ,
        metadataJson: $metadataJson,
        createdAt: datetime(), updatedAt: datetime()
      })`,
      params: {
        id: realId,
        projectId,
        workspaceId,
        type: el.type,
        name: el.name,
        description: el.description || '',
        layer: el.layer,
        togafDomain: el.togafDomain,
        maturityLevel: el.maturityLevel || 1,
        riskLevel: el.riskLevel || 'low',
        status: el.status || 'target',
        posX: pos.x,
        posY: pos.y,
        posZ: pos.z,
        metadataJson: JSON.stringify({
          sourceProposalId: proposalId,
          confidence: el.confidence,
          sectionReference: el.sectionReference,
        }),
      },
    });
  }

  // Resolve existing element names to IDs for connections
  const existingNameToId = await resolveExistingNames(projectId);

  // Create connections
  const createdConnectionIds: string[] = [];
  for (const conn of connectionsToApply) {
    const sourceId = resolveConnectionEndpoint(conn.sourceTempId, tempToRealId, existingNameToId);
    const targetId = resolveConnectionEndpoint(conn.targetTempId, tempToRealId, existingNameToId);

    if (!sourceId || !targetId) {
      console.warn(`[Remediation Apply] Skipping connection ${conn.tempId}: unresolvable endpoints`);
      continue;
    }

    const connectionId = uuid();
    createdConnectionIds.push(connectionId);

    operations.push({
      query: `MATCH (a:ArchitectureElement {id: $sourceId}), (b:ArchitectureElement {id: $targetId})
       CREATE (a)-[r:CONNECTS_TO {id: $connectionId, type: $type, label: $label}]->(b)`,
      params: {
        sourceId,
        targetId,
        connectionId,
        type: conn.type,
        label: conn.label || '',
      },
    });
  }

  // Execute atomic transaction
  await runCypherTransaction(operations);

  // Update proposal in MongoDB
  const allElementsApplied = elementsToApply.length === (proposal.elements as any[]).length;
  proposal.status = allElementsApplied ? 'applied' : 'partially_applied';
  proposal.appliedElementIds = [...(proposal.appliedElementIds || []), ...createdElementIds];
  proposal.appliedConnectionIds = [...(proposal.appliedConnectionIds || []), ...createdConnectionIds];
  proposal.appliedAt = new Date();
  proposal.appliedBy = userId as any;
  await proposal.save();

  return { elementIds: createdElementIds, connectionIds: createdConnectionIds };
}

// ─── Rollback Proposal ───

export async function rollbackProposal(proposalId: string): Promise<void> {
  const proposal = await RemediationProposal.findById(proposalId);
  if (!proposal) {
    throw new Error('Proposal not found.');
  }

  if (!proposal.appliedElementIds?.length && !proposal.appliedConnectionIds?.length) {
    throw new Error('No applied elements to rollback.');
  }

  // Delete connections first, then elements (to avoid constraint issues)
  const operations: Array<{ query: string; params: Record<string, unknown> }> = [];

  if (proposal.appliedConnectionIds?.length) {
    for (const connId of proposal.appliedConnectionIds) {
      operations.push({
        query: `MATCH ()-[r:CONNECTS_TO {id: $connectionId}]->() DELETE r`,
        params: { connectionId: connId },
      });
    }
  }

  if (proposal.appliedElementIds?.length) {
    for (const elementId of proposal.appliedElementIds) {
      operations.push({
        query: `MATCH (e:ArchitectureElement {id: $elementId}) DETACH DELETE e`,
        params: { elementId },
      });
    }
  }

  await runCypherTransaction(operations);

  // Reset proposal state
  proposal.status = 'validated';
  proposal.appliedElementIds = [];
  proposal.appliedConnectionIds = [];
  proposal.appliedAt = undefined;
  proposal.appliedBy = undefined;
  await proposal.save();
}

// ─── Position Calculation ───

async function getLayerOffsets(projectId: string): Promise<Map<string, number>> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.layer as layer, max(e.posX) as maxX
     ORDER BY e.layer`,
    { projectId },
  );

  const offsets = new Map<string, number>();
  for (const r of records) {
    const props = serializeNeo4jProperties(r.toObject());
    const layer = String(props.layer || '');
    const maxX = Number(props.maxX) || 0;
    offsets.set(layer, maxX);
  }
  return offsets;
}

function calculatePositions(
  elements: ProposalElement[],
  layerOffsets: Map<string, number>,
): Map<string, { x: number; y: number; z: number }> {
  const positions = new Map<string, { x: number; y: number; z: number }>();
  const spacing = 3;
  const rowSize = 5;

  // Group by layer
  const byLayer: Record<string, ProposalElement[]> = {};
  for (const el of elements) {
    if (!byLayer[el.layer]) byLayer[el.layer] = [];
    byLayer[el.layer].push(el);
  }

  for (const [layer, layerElements] of Object.entries(byLayer)) {
    const startX = (layerOffsets.get(layer) || 0) + spacing;
    const y = LAYER_Y[layer] ?? 0;

    for (let i = 0; i < layerElements.length; i++) {
      const col = i % rowSize;
      const row = Math.floor(i / rowSize);
      positions.set(layerElements[i].tempId, {
        x: startX + col * spacing,
        y,
        z: row * spacing,
      });
    }
  }

  return positions;
}

// ─── Connection Resolution ───

async function resolveExistingNames(projectId: string): Promise<Map<string, string>> {
  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId})
     RETURN e.id as id, e.name as name
     LIMIT 500`,
    { projectId },
  );

  const nameToId = new Map<string, string>();
  for (const r of records) {
    const props = serializeNeo4jProperties(r.toObject());
    nameToId.set(String(props.name || ''), String(props.id || ''));
  }
  return nameToId;
}

function resolveConnectionEndpoint(
  tempId: string,
  tempToRealId: Map<string, string>,
  existingNameToId: Map<string, string>,
): string | null {
  // Proposal element reference
  const realId = tempToRealId.get(tempId);
  if (realId) return realId;

  // Existing element by name (format: "existing:ElementName")
  if (tempId.startsWith('existing:')) {
    const name = tempId.slice('existing:'.length).trim();
    return existingNameToId.get(name) || null;
  }

  // Direct ID reference
  return existingNameToId.get(tempId) || tempId;
}
