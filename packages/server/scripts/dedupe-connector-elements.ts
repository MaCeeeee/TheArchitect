/**
 * THE-739 — one-off cleanup of connector sync duplicates.
 *
 * Before the fix every connector sync CREATEd a new node, so one external item
 * (e.g. a GitHub repo) exists once per sync run. Per duplicate group this keeps
 * one node (see planConnectorDedupe for the choice), re-points every relationship
 * of the others to it, and deletes them.
 *
 * Dry-run by default. Idempotent: a second run finds nothing.
 *
 *   npx ts-node --transpile-only scripts/dedupe-connector-elements.ts [--project <id>] [--apply]
 *
 * Prod is a separate decision — run there only with explicit approval.
 */
import 'dotenv/config';
import neo4j, { Session } from 'neo4j-driver';
import { planConnectorDedupe, type DedupeNode } from '../src/services/connector-dedupe';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const projectArg = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;

async function loadNodes(s: Session): Promise<DedupeNode[]> {
  const res = await s.run(
    `MATCH (e:ArchitectureElement)
     WHERE NOT e.projectId STARTS WITH 'tmp-'
       AND ($projectId IS NULL OR e.projectId = $projectId)
       AND (e.connectorConfigId IS NOT NULL
            OR e.id STARTS WITH 'gh-' OR e.id STARTS WITH 'gl-' OR e.id STARTS WITH 'jira-')
     RETURN e.id AS id, e.projectId AS projectId, e.name AS name, e.type AS type,
            e.source AS source, e.connectorConfigId AS connectorConfigId, e.externalId AS externalId,
            e.createdAt AS createdAt, e.certifiedBy AS certifiedBy`,
    { projectId: projectArg },
  );
  return res.records.map((r) => r.toObject() as DedupeNode);
}

/** Relationship counts per removed node, by type — what the re-point will move. */
async function relSummary(s: Session, projectId: string, ids: string[]): Promise<Record<string, number>> {
  const res = await s.run(
    `MATCH (d:ArchitectureElement {projectId: $projectId})-[r]-()
     WHERE d.id IN $ids
     RETURN type(r) AS t, count(r) AS n`,
    { projectId, ids },
  );
  return Object.fromEntries(res.records.map((r) => [r.get('t'), r.get('n').toNumber()]));
}

async function applyGroup(s: Session, projectId: string, keepId: string, removeIds: string[]): Promise<void> {
  const tx = s.beginTransaction();
  try {
    const types = await tx.run(
      `MATCH (d:ArchitectureElement {projectId: $projectId})-[r]-()
       WHERE d.id IN $ids RETURN DISTINCT type(r) AS t`,
      { projectId, ids: removeIds },
    );
    for (const rec of types.records) {
      const t = String(rec.get('t')).replace(/`/g, '');
      // Edges inside the group (dup ↔ keep or dup ↔ dup) are artefacts — drop them.
      // Others move to the kept node unless it already has the same edge (same type
      // property, same other end); properties are copied after deleting the original
      // so a unique r.id constraint never sees two holders.
      for (const dir of ['out', 'in'] as const) {
        const pattern = dir === 'out' ? '(d)-[r:`T`]->(o)' : '(d)<-[r:`T`]-(o)';
        const keepPattern = dir === 'out' ? '(k)-[x:`T`]->(o)' : '(k)<-[x:`T`]-(o)';
        const create = dir === 'out' ? 'CREATE (k)-[n:`T`]->(o)' : 'CREATE (k)<-[n:`T`]-(o)';
        await tx.run(
          `MATCH (k:ArchitectureElement {id: $keepId, projectId: $projectId})
           MATCH ${pattern}
           WHERE d.projectId = $projectId AND d.id IN $ids
           WITH k, d, r, o, properties(r) AS p,
                (o.id = $keepId OR o.id IN $ids) AND o.projectId = $projectId AS internal
           OPTIONAL MATCH ${keepPattern} WHERE coalesce(x.type, '') = coalesce(r.type, '')
           WITH k, r, o, p, internal, count(x) > 0 AS already
           DELETE r
           WITH k, o, p WHERE NOT internal AND NOT already
           ${create}
           SET n = p`.replace(/`T`/g, `\`${t}\``),
          { keepId, projectId, ids: removeIds },
        );
      }
    }
    await tx.run(
      `MATCH (d:ArchitectureElement {projectId: $projectId}) WHERE d.id IN $ids DETACH DELETE d`,
      { projectId, ids: removeIds },
    );
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${process.env.NEO4J_URI || 'bolt://localhost:7687'}${projectArg ? ` — project ${projectArg}` : ''}`);
    const plan = planConnectorDedupe(await loadNodes(s));

    let removed = 0;
    for (const g of plan.groups) {
      const rels = await relSummary(s, g.keep.projectId, g.remove.map((n) => n.id));
      console.log(`\n${g.key}`);
      console.log(`  keep   ${g.keep.id}  (${g.keep.createdAt}${g.keep.certifiedBy ? ', certified' : ''})`);
      console.log(`  delete ${g.remove.length}: ${g.remove.map((n) => n.id).join(', ')}`);
      console.log(`  relationships to re-point: ${JSON.stringify(rels)}`);
      if (APPLY) await applyGroup(s, g.keep.projectId, g.keep.id, g.remove.map((n) => n.id));
      removed += g.remove.length;
    }
    for (const sk of plan.skipped) console.log(`\nSKIPPED ${sk.key}: ${sk.reason} [${sk.ids.join(', ')}]`);

    console.log(`\n${plan.groups.length} group(s), ${removed} node(s) ${APPLY ? 'deleted' : 'would be deleted'}, ${plan.skipped.length} skipped.`);
    if (!APPLY && plan.groups.length) console.log('Re-run with --apply to write.');
  } finally {
    await s.close();
    await driver.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
