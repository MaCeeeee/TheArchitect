import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    // Real key is `posY` not `y`
    const dist = await s.run(
      `MATCH (e:ArchitectureElement)
       WHERE e.posY IS NOT NULL
       RETURN e.layer AS layer, count(e) AS n,
              min(e.posY) AS minY, max(e.posY) AS maxY, avg(e.posY) AS avgY
       ORDER BY n DESC LIMIT 15`,
    );
    console.log('--- posY range per layer (all projects combined) ---');
    for (const r of dist.records) {
      console.log(`  ${(r.get('layer') ?? 'NULL').padEnd(28)} n=${r.get('n').toNumber().toString().padStart(4)} y=[${r.get('minY')}..${r.get('maxY')}] avg=${r.get('avgY')?.toFixed?.(2) ?? 'n/a'}`);
    }

    // Outliers (expected layer y from togaf.constants:
    // motivation=16 strategy=12 business=8 information=4 application=0
    // technology=-4 physical=-8 implementation_migration=-12)
    const outliers = await s.run(
      `MATCH (e:ArchitectureElement)
       WHERE e.posY IS NOT NULL AND (e.posY < -14 OR e.posY > 18)
       RETURN e.id AS id, e.name AS name, e.type AS type, e.layer AS layer, e.posY AS y, e.projectId AS proj
       ORDER BY e.posY LIMIT 30`,
    );
    console.log(`\n--- Y-outliers (posY < -14 OR posY > 18) ---`);
    for (const r of outliers.records) {
      console.log(`  y=${String(r.get('y')).padStart(8)}  layer=${(r.get('layer')??'').padEnd(15)} type=${(r.get('type')??'').padEnd(20)} ${r.get('name')}  [proj ${String(r.get('proj')).slice(0,8)}]`);
    }

    // Per-layer outliers (element on layer X but posY != layerY)
    const mismatch = await s.run(
      `MATCH (e:ArchitectureElement) WHERE e.posY IS NOT NULL
       WITH e,
         CASE e.layer
           WHEN 'motivation' THEN 16
           WHEN 'strategy' THEN 12
           WHEN 'business' THEN 8
           WHEN 'information' THEN 4
           WHEN 'data' THEN 4
           WHEN 'application' THEN 0
           WHEN 'technology' THEN -4
           WHEN 'physical' THEN -8
           WHEN 'implementation_migration' THEN -12
           ELSE NULL END AS expected
       WHERE expected IS NOT NULL AND abs(e.posY - expected) > 2
       RETURN e.layer AS layer, e.posY AS y, expected, count(*) AS n
       ORDER BY n DESC LIMIT 20`,
    );
    console.log(`\n--- Layer/posY mismatch (|posY - expectedY| > 2) ---`);
    for (const r of mismatch.records) {
      console.log(`  ${(r.get('layer')??'').padEnd(25)} y=${r.get('y')}  expected=${r.get('expected')}  count=${r.get('n').toNumber()}`);
    }
  } finally { await s.close(); await driver.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
