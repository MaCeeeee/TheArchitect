import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    // Show how y is stored on elements (raw key inventory)
    const sample = await s.run(
      `MATCH (e:ArchitectureElement) RETURN e LIMIT 1`,
    );
    if (sample.records.length > 0) {
      const node = sample.records[0].get('e');
      console.log('First element keys:', Object.keys(node.properties));
      console.log('Sample y-related props:',
        node.properties.y, node.properties.position3D, node.properties.positionY);
    }

    // Y outliers (assumes plain `y` property)
    const outliers = await s.run(
      `MATCH (e:ArchitectureElement)
       WHERE e.y IS NOT NULL AND (e.y < -12 OR e.y > 16)
       RETURN e.id AS id, e.name AS name, e.type AS type, e.layer AS layer, e.y AS y
       ORDER BY e.y LIMIT 20`,
    );
    console.log(`\n--- Y outliers (y < -12 OR y > 16) ---`);
    for (const r of outliers.records) {
      console.log(`  y=${r.get('y')}  layer=${r.get('layer')?.padEnd(15)} type=${r.get('type')?.padEnd(20)} ${r.get('name')}`);
    }

    // Distribution by layer
    const dist = await s.run(
      `MATCH (e:ArchitectureElement)
       RETURN e.layer AS layer, count(e) AS n, min(e.y) AS minY, max(e.y) AS maxY, avg(e.y) AS avgY
       ORDER BY n DESC`,
    );
    console.log(`\n--- Y range per layer ---`);
    for (const r of dist.records) {
      const minY = r.get('minY');
      const maxY = r.get('maxY');
      const avgY = r.get('avgY');
      console.log(`  ${r.get('layer')?.padEnd(25)} n=${r.get('n').toNumber().toString().padStart(4)} y=[${minY}..${maxY}] avg=${avgY?.toFixed?.(2) ?? 'n/a'}`);
    }
  } finally { await s.close(); await driver.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
