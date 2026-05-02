import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    // Neo4j 5+ relationship-property uniqueness syntax
    try {
      await s.run(
        `CREATE CONSTRAINT connects_to_id_unique IF NOT EXISTS
         FOR ()-[r:CONNECTS_TO]-() REQUIRE r.id IS UNIQUE`,
      );
      console.log('UNIQUE constraint on CONNECTS_TO.id created (or already exists).');
    } catch (e) {
      console.log('Constraint creation failed:', (e as Error).message);
      console.log('(this Neo4j edition/version may not support relationship uniqueness — fallback: app-side enforcement)');
    }

    const list = await s.run(`SHOW CONSTRAINTS WHERE name = 'connects_to_id_unique'`);
    if (list.records.length > 0) {
      console.log('Constraint is active.');
    } else {
      console.log('Constraint not visible in SHOW CONSTRAINTS — may have been silently rejected.');
    }
  } finally { await s.close(); await driver.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
