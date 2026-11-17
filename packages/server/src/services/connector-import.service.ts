/**
 * Connector Import — idempotent write path for connector syncs (THE-739).
 *
 * Connectors hand out a fresh random element id on every fetch, so writing their
 * result with CREATE (createTemporaryGraph) added one duplicate per sync run.
 * This service upserts instead, scoped to (projectId, source, connectorConfigId):
 *
 * 1. match by `externalId` — the stable key in the source system (e.g. GitHub repo id)
 * 2. else adopt an existing node without externalId of the same name + type,
 *    oldest first, each node at most once (legacy nodes + connectors without a key)
 * 3. else create
 *
 * `sourceRef` is batch-level (the connector's baseUrl), so it is provenance, not a key.
 */

import { v4 as uuid } from 'uuid';
import { runCypher, runCypherTransaction } from '../config/neo4j';
import type { ParsedElement, ParsedConnection } from './upload.service';

export interface ConnectorImportOrigin {
  source: string;               // connector type, e.g. 'github'
  connectorConfigId: string;
  sourceRef?: string;
}

export interface ExistingConnectorElement {
  id: string;
  externalId: string | null;
  name: string;
  type: string;
  createdAt: string | null;
}

export interface UpsertPlan {
  creates: Array<{ id: string; el: ParsedElement }>;
  updates: Array<{ id: string; el: ParsedElement }>;
  /** incoming (per-fetch) element id → id of the node it was written to */
  idMap: Map<string, string>;
}

export interface ConnectorImportResult {
  elementsCreated: number;
  elementsUpdated: number;
  connectionsSynced: number;
}

const legacyKey = (name: string, type: string) => `${name}\u0000${type}`;

export function planConnectorUpsert(incoming: ParsedElement[], existing: ExistingConnectorElement[]): UpsertPlan {
  const byCreated = [...existing].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  const byExternalId = new Map<string, ExistingConnectorElement>();
  const legacyPool = new Map<string, ExistingConnectorElement[]>();
  for (const node of byCreated) {
    if (node.externalId != null) {
      if (!byExternalId.has(node.externalId)) byExternalId.set(node.externalId, node);
    } else {
      const key = legacyKey(node.name, node.type);
      legacyPool.set(key, [...(legacyPool.get(key) ?? []), node]);
    }
  }

  const used = new Set<string>();
  const plan: UpsertPlan = { creates: [], updates: [], idMap: new Map() };

  for (const el of incoming) {
    let target = el.externalId != null ? byExternalId.get(el.externalId) : undefined;
    if (target && used.has(target.id)) target = undefined;
    if (!target) target = legacyPool.get(legacyKey(el.name, el.type))?.find((n) => !used.has(n.id));

    if (target) {
      used.add(target.id);
      plan.updates.push({ id: target.id, el });
      plan.idMap.set(el.id, target.id);
    } else {
      plan.creates.push({ id: el.id, el });
      plan.idMap.set(el.id, el.id);
    }
  }
  return plan;
}

export async function importConnectorResult(
  projectId: string,
  parsed: { elements: ParsedElement[]; connections: ParsedConnection[] },
  origin: ConnectorImportOrigin,
): Promise<ConnectorImportResult> {
  const { source, connectorConfigId } = origin;
  const now = new Date().toISOString();

  const records = await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId, source: $source, connectorConfigId: $connectorConfigId})
     RETURN e.id AS id, e.externalId AS externalId, e.name AS name, e.type AS type, e.createdAt AS createdAt`,
    { projectId, source, connectorConfigId },
  );
  const existing: ExistingConnectorElement[] = records.map((r) => ({
    id: r.get('id'),
    externalId: r.get('externalId') ?? null,
    name: r.get('name'),
    type: r.get('type'),
    createdAt: r.get('createdAt') ?? null,
  }));

  const plan = planConnectorUpsert(parsed.elements, existing);

  // Only defined fields → `SET e += $origin` never writes nulls.
  const originFor = (el: ParsedElement, created: boolean): Record<string, unknown> => {
    const o: Record<string, unknown> = { connectorConfigId, lastSyncedAt: now };
    if (origin.sourceRef != null) o.sourceRef = origin.sourceRef;
    if (el.externalId != null) o.externalId = el.externalId;
    if (created) o.importedAt = now;
    return o;
  };
  const fields = (el: ParsedElement) => ({
    name: el.name, type: el.type, layer: el.layer, description: el.description,
    status: el.status, riskLevel: el.riskLevel, maturityLevel: el.maturityLevel,
  });

  const operations: Array<{ query: string; params: Record<string, unknown> }> = [];

  for (const { id, el } of plan.creates) {
    operations.push({
      query: `CREATE (e:ArchitectureElement {
        id: $id, projectId: $projectId, name: $name, type: $type,
        layer: $layer, description: $description, status: $status,
        riskLevel: $riskLevel, maturityLevel: $maturityLevel,
        provenance: 'import', source: $source,
        createdAt: $now, updatedAt: $now
      })
      SET e += $origin`,
      params: { id, projectId, ...fields(el), source, now, origin: originFor(el, true) },
    });
  }

  // A notary certified what they saw — changed content goes back to the queue.
  for (const { id, el } of plan.updates) {
    operations.push({
      query: `MATCH (e:ArchitectureElement {id: $id, projectId: $projectId})
      WITH e, (e.name <> $name OR e.type <> $type OR e.layer <> $layer
               OR coalesce(e.description, '') <> $description OR e.status <> $status
               OR e.riskLevel <> $riskLevel OR e.maturityLevel <> $maturityLevel) AS changed
      SET e.name = $name, e.type = $type, e.layer = $layer, e.description = $description,
          e.status = $status, e.riskLevel = $riskLevel, e.maturityLevel = $maturityLevel,
          e.updatedAt = $now
      SET e += $origin
      FOREACH (_ IN CASE WHEN changed THEN [1] ELSE [] END |
        SET e.certifiedBy = null, e.certifiedAt = null)`,
      params: { id, projectId, ...fields(el), now, origin: originFor(el, false) },
    });
  }

  // Connections reference the per-fetch ids (or names) — resolve to the written nodes.
  const nameToId = new Map(parsed.elements.map((e) => [e.name.toLowerCase(), e.id]));
  const resolve = (ref: string) => plan.idMap.get(ref) ?? plan.idMap.get(nameToId.get(ref.toLowerCase()) ?? '');

  let connectionsSynced = 0;
  for (const conn of parsed.connections) {
    const sourceId = resolve(conn.sourceId);
    const targetId = resolve(conn.targetId);
    if (!sourceId || !targetId) continue;
    connectionsSynced++;
    operations.push({
      query: `MATCH (s:ArchitectureElement {id: $sourceId, projectId: $projectId})
              MATCH (t:ArchitectureElement {id: $targetId, projectId: $projectId})
              MERGE (s)-[r:CONNECTS_TO {type: $type, projectId: $projectId}]->(t)
              ON CREATE SET r.id = $connId, r.label = $label, r.createdAt = $now,
                            r.provenance = 'import', r.source = $source, r += $origin`,
      params: {
        sourceId, targetId, projectId, type: conn.type, label: conn.label || '',
        connId: conn.id || `conn-${uuid().slice(0, 8)}`, now, source,
        origin: { connectorConfigId, importedAt: now, ...(origin.sourceRef != null ? { sourceRef: origin.sourceRef } : {}) },
      },
    });
  }

  const BATCH_SIZE = 100;
  for (let i = 0; i < operations.length; i += BATCH_SIZE) {
    await runCypherTransaction(operations.slice(i, i + BATCH_SIZE));
  }

  return { elementsCreated: plan.creates.length, elementsUpdated: plan.updates.length, connectionsSynced };
}
