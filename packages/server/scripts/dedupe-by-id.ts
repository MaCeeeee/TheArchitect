import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    // Find IDs that are shared across multiple edges (any src/tgt)
    const sharedIds = await s.run(
      `MATCH ()-[r:CONNECTS_TO]->()
       WHERE r.id IS NOT NULL
       WITH r.id AS id, count(r) AS cnt, collect(r) AS rels
       WHERE cnt > 1
       RETURN id, cnt LIMIT 20`,
    );
    console.log(`IDs reused across multiple edges: ${sharedIds.records.length} (showing top 20)`);
    for (const rec of sharedIds.records) {
      console.log(`  id=${rec.get('id')} cnt=${rec.get('cnt').toNumber()}`);
    }

    // Strategy: edges that share an ID but link different node-pairs are
    // genuine bugs (same id, different relationships). Re-assign fresh UUIDs to
    // all but the first edge per id-collision so the UNIQUE constraint can hold.
    const fix = await s.run(
      `MATCH (a)-[r:CONNECTS_TO]->(b)
       WHERE r.id IS NOT NULL
       WITH r.id AS id, collect(r) AS rels
       WHERE size(rels) > 1
       UNWIND rels[1..] AS r
       SET r.id = randomUUID()
       RETURN count(r) AS reassigned`,
    );
    console.log(`\nReassigned ${fix.records[0].get('reassigned').toNumber()} edges to fresh UUIDs`);

    // Also: edges with NULL id should get one (for the constraint to hold).
    const fixNull = await s.run(
      `MATCH ()-[r:CONNECTS_TO]->() WHERE r.id IS NULL SET r.id = randomUUID() RETURN count(r) AS n`,
    );
    console.log(`Set fresh UUIDs on ${fixNull.records[0].get('n').toNumber()} previously-null IDs`);
  } finally { await s.close(); await driver.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
