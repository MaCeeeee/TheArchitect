import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    const before = await s.run(`MATCH ()-[r:CONNECTS_TO]->() RETURN count(r) AS n`);
    const beforeCount = before.records[0].get('n').toNumber();
    console.log(`Before: ${beforeCount} edges`);

    // For each (src, tgt, type) triple keep one edge, delete the rest.
    // Preference order: edges with highest confidence first, else any.
    const result = await s.run(
      `MATCH (a:ArchitectureElement)-[r:CONNECTS_TO]->(b:ArchitectureElement)
       WITH a.id AS srcId, b.id AS tgtId, r.type AS type, collect(r) AS rels
       WHERE size(rels) > 1
       WITH rels, [r IN rels WHERE r.confidence IS NOT NULL] AS withConf,
            [r IN rels WHERE r.confidence IS NULL] AS noConf
       WITH (CASE WHEN size(withConf) > 0 THEN withConf ELSE noConf END) AS sorted
       UNWIND sorted[1..] AS dupe
       DELETE dupe
       RETURN count(dupe) AS deleted`,
    );
    const deleted = result.records[0].get('deleted').toNumber();
    console.log(`Deleted ${deleted} duplicate edges.`);

    const after = await s.run(`MATCH ()-[r:CONNECTS_TO]->() RETURN count(r) AS n`);
    console.log(`After: ${after.records[0].get('n').toNumber()} edges`);
  } finally { await s.close(); await driver.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
