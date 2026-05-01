import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD;
  if (!password) {
    console.error('NEO4J_PASSWORD not set in env');
    process.exit(1);
  }

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();

  try {
    const before = await session.run(
      `MATCH ()-[r:CONNECTS_TO]->() WHERE r.source = $src RETURN count(r) AS n`,
      { src: 'ai-heal' },
    );
    const beforeCount = before.records[0].get('n').toNumber();
    console.log(`Found ${beforeCount} ai-heal connections.`);

    if (beforeCount === 0) {
      console.log('Nothing to roll back.');
      return;
    }

    const result = await session.run(
      `MATCH ()-[r:CONNECTS_TO]->() WHERE r.source = $src DELETE r RETURN count(r) AS deleted`,
      { src: 'ai-heal' },
    );
    const deleted = result.records[0]?.get('deleted')?.toNumber?.() ?? beforeCount;
    console.log(`Deleted ${deleted} ai-heal connections.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
