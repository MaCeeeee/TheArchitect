import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    const r = await s.run(
      `MATCH (e:ArchitectureElement) WHERE e.layer = 'motivation' RETURN e LIMIT 3`,
    );
    for (const rec of r.records) {
      const node = rec.get('e');
      console.log('---');
      console.log('Keys:', Object.keys(node.properties).sort().join(', '));
      console.log('Sample:', JSON.stringify(node.properties).slice(0, 400));
    }

    // Distinct property keys across all ArchitectureElement nodes
    const keys = await s.run(
      `MATCH (e:ArchitectureElement)
       UNWIND keys(e) AS k
       RETURN k, count(*) AS n ORDER BY n DESC LIMIT 30`,
    );
    console.log('\n--- All property keys on ArchitectureElement ---');
    for (const rec of keys.records) {
      console.log(`  ${rec.get('k').padEnd(25)} ${rec.get('n').toNumber()}`);
    }
  } finally { await s.close(); await driver.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
