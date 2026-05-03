import 'dotenv/config';
import neo4j from 'neo4j-driver';

const LAYER_Y: Record<string, number> = {
  motivation: 16,
  strategy: 12,
  business: 8,
  information: 4,
  data: 4,
  application: 0,
  technology: -4,
  physical: -8,
  implementation_migration: -12,
};

const HIDDEN_THRESHOLD = -50; // activities parked at -100 are kept

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    let totalFixed = 0;
    for (const [layer, expY] of Object.entries(LAYER_Y)) {
      const r = await s.run(
        `MATCH (e:ArchitectureElement {layer: $layer})
         WHERE e.posY IS NOT NULL AND e.posY > $hidden AND abs(e.posY - $expY) > 0.5
         SET e.posY = $expY
         RETURN count(e) AS n`,
        { layer, expY, hidden: HIDDEN_THRESHOLD },
      );
      const n = r.records[0].get('n').toNumber();
      if (n > 0) console.log(`  ${layer.padEnd(28)} → ${expY}: fixed ${n} elements`);
      totalFixed += n;
    }
    console.log(`\nTotal posY corrections: ${totalFixed}`);

    // Verify: any remaining mismatches above the hidden threshold?
    const remaining = await s.run(
      `MATCH (e:ArchitectureElement)
       WHERE e.posY IS NOT NULL AND e.posY > $hidden
       WITH e, CASE e.layer
         WHEN 'motivation' THEN 16 WHEN 'strategy' THEN 12 WHEN 'business' THEN 8
         WHEN 'information' THEN 4 WHEN 'data' THEN 4 WHEN 'application' THEN 0
         WHEN 'technology' THEN -4 WHEN 'physical' THEN -8 WHEN 'implementation_migration' THEN -12
         ELSE NULL END AS expY
       WHERE expY IS NOT NULL AND abs(e.posY - expY) > 0.5
       RETURN count(e) AS n`,
      { hidden: HIDDEN_THRESHOLD },
    );
    console.log(`Remaining mismatches: ${remaining.records[0].get('n').toNumber()}`);
  } finally { await s.close(); await driver.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
