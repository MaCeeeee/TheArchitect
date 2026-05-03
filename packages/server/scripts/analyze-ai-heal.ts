import 'dotenv/config';
import neo4j from 'neo4j-driver';

async function main() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD;
  if (!password) {
    console.error('NEO4J_PASSWORD not set');
    process.exit(1);
  }
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();

  try {
    const total = await session.run(
      `MATCH (a)-[r:CONNECTS_TO {source: 'ai-heal'}]->(b) RETURN count(r) AS n`,
    );
    const totalCount = total.records[0].get('n').toNumber();
    console.log(`\n========== AI-HEAL CONNECTION ANALYSIS ==========`);
    console.log(`Total ai-heal connections: ${totalCount}`);

    const universe = await session.run(
      `MATCH (e:ArchitectureElement) RETURN count(e) AS n`,
    );
    const universeCount = universe.records[0].get('n').toNumber();
    const allPossiblePairs = (universeCount * (universeCount - 1)) / 2;
    const pct = ((totalCount / allPossiblePairs) * 100).toFixed(2);
    console.log(`Universe: ${universeCount} elements → ${allPossiblePairs} possible pairs.`);
    console.log(`Coverage: ${pct}% of all possible pairs are connected by ai-heal.`);

    const bySourceType = await session.run(
      `MATCH (a)-[r:CONNECTS_TO {source: 'ai-heal'}]->(b)
       RETURN a.type AS sourceType, count(r) AS n
       ORDER BY n DESC`,
    );
    console.log(`\n----- by source type -----`);
    for (const rec of bySourceType.records) {
      console.log(`  ${rec.get('sourceType')?.padEnd(20) ?? 'unknown'}: ${rec.get('n').toNumber()}`);
    }

    const byPair = await session.run(
      `MATCH (a)-[r:CONNECTS_TO {source: 'ai-heal'}]->(b)
       RETURN a.type AS sourceType, b.type AS targetType, r.type AS rel, count(r) AS n
       ORDER BY n DESC`,
    );
    console.log(`\n----- by source-type → relationship → target-type -----`);
    for (const rec of byPair.records) {
      const s = rec.get('sourceType') ?? 'unknown';
      const t = rec.get('targetType') ?? 'unknown';
      const r = rec.get('rel') ?? '?';
      const n = rec.get('n').toNumber();
      console.log(`  ${s.padEnd(15)} --${r.padEnd(13)}--> ${t.padEnd(15)} : ${n}`);
    }

    const sample = await session.run(
      `MATCH (a)-[r:CONNECTS_TO {source: 'ai-heal'}]->(b)
       RETURN a.type AS sourceType, a.name AS sourceName, r.type AS rel,
              b.type AS targetType, b.name AS targetName,
              r.confidence AS confidence, r.aiReason AS reason
       ORDER BY r.confidence DESC
       LIMIT 10`,
    );
    console.log(`\n----- top 10 by confidence (sample for plausibility check) -----`);
    for (const rec of sample.records) {
      const conf = rec.get('confidence');
      const confStr = conf ? `${(conf * 100).toFixed(0)}%` : '?';
      console.log(`\n  [${confStr}] (${rec.get('sourceType')}) "${rec.get('sourceName')}"`);
      console.log(`         --${rec.get('rel')}--> (${rec.get('targetType')}) "${rec.get('targetName')}"`);
      const reason = rec.get('reason');
      if (reason) console.log(`         reason: ${reason}`);
    }

    const sampleLow = await session.run(
      `MATCH (a)-[r:CONNECTS_TO {source: 'ai-heal'}]->(b)
       RETURN a.type AS sourceType, a.name AS sourceName, r.type AS rel,
              b.type AS targetType, b.name AS targetName,
              r.confidence AS confidence, r.aiReason AS reason
       ORDER BY r.confidence ASC
       LIMIT 10`,
    );
    console.log(`\n----- bottom 10 by confidence (do these look weak?) -----`);
    for (const rec of sampleLow.records) {
      const conf = rec.get('confidence');
      const confStr = conf ? `${(conf * 100).toFixed(0)}%` : '?';
      console.log(`\n  [${confStr}] (${rec.get('sourceType')}) "${rec.get('sourceName')}"`);
      console.log(`         --${rec.get('rel')}--> (${rec.get('targetType')}) "${rec.get('targetName')}"`);
      const reason = rec.get('reason');
      if (reason) console.log(`         reason: ${reason}`);
    }

    const distribution = await session.run(
      `MATCH (a)-[r:CONNECTS_TO {source: 'ai-heal'}]->(b)
       WITH a.id AS sourceId, a.name AS name, count(r) AS outgoing
       RETURN name, outgoing
       ORDER BY outgoing DESC
       LIMIT 10`,
    );
    console.log(`\n----- top 10 source elements by outgoing ai-heal edges -----`);
    for (const rec of distribution.records) {
      console.log(`  ${rec.get('outgoing').toNumber()}× "${rec.get('name')}"`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
