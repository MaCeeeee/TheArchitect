import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    // Find duplicate (sourceId, targetId, type) triples
    const dupes = await s.run(
      `MATCH (a:ArchitectureElement)-[r:CONNECTS_TO]->(b:ArchitectureElement)
       WITH a.id AS srcId, b.id AS tgtId, r.type AS type, a.name AS srcName, b.name AS tgtName,
            collect(r) AS rels, count(r) AS cnt
       WHERE cnt > 1
       RETURN srcName, tgtName, type, cnt, [r IN rels | {id: r.id, source: r.source, conf: r.confidence}] AS rels
       ORDER BY cnt DESC LIMIT 30`,
    );
    console.log(`Found ${dupes.records.length} (source,target,type) triples with duplicates:`);
    for (const rec of dupes.records) {
      const cnt = rec.get('cnt').toNumber();
      console.log(`\n  ${cnt}× "${rec.get('srcName')}" --${rec.get('type')}--> "${rec.get('tgtName')}"`);
      for (const r of rec.get('rels')) {
        console.log(`     id=${r.id} source=${r.source ?? 'none'} conf=${r.conf ?? 'n/a'}`);
      }
    }
    // Aggregate counts
    const totalEdges = await s.run(`MATCH ()-[r:CONNECTS_TO]->() RETURN count(r) AS n`);
    const distinctTriples = await s.run(
      `MATCH (a)-[r:CONNECTS_TO]->(b)
       WITH a.id AS srcId, b.id AS tgtId, r.type AS type
       RETURN count(DISTINCT srcId + '|' + tgtId + '|' + type) AS n`,
    );
    console.log(`\nTotal edges: ${totalEdges.records[0].get('n').toNumber()}`);
    console.log(`Distinct (src,tgt,type) triples: ${distinctTriples.records[0].get('n').toNumber()}`);
    console.log(`Duplicate edges (excess over distinct): ${totalEdges.records[0].get('n').toNumber() - distinctTriples.records[0].get('n').toNumber()}`);
  } finally {
    await s.close();
    await driver.close();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
