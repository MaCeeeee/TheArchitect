import 'dotenv/config';
import neo4j from 'neo4j-driver';

// Canonical ArchiMate ElementStatus. Remediate previously wrote LLM-emitted
// values like "plan"/"planned" verbatim into Neo4j; normalize them so Roadmap
// generation (which validates against the canonical 4 via Zod) can include
// these elements as targetStates.
const CANONICAL = new Set(['current', 'target', 'transitional', 'retired']);

function normalize(raw: string | null | undefined): string {
  if (!raw) return 'target';
  if (CANONICAL.has(raw)) return raw;
  const s = String(raw).toLowerCase();
  if (s === 'plan' || s === 'planned' || s === 'proposed' || s === 'new') return 'target';
  if (s === 'active' || s === 'live' || s === 'production') return 'current';
  if (s === 'transition' || s === 'migrating') return 'transitional';
  if (s === 'retire' || s === 'deprecated' || s === 'sunset') return 'retired';
  return 'target';
}

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    const distinct = await s.run(
      `MATCH (e:ArchitectureElement) RETURN DISTINCT e.status AS status, count(e) AS n ORDER BY n DESC`,
    );
    console.log('Current status distribution:');
    for (const r of distinct.records) {
      console.log(`  ${r.get('status')}: ${r.get('n').toNumber()}`);
    }

    let fixed = 0;
    const offending = await s.run(
      `MATCH (e:ArchitectureElement) WHERE NOT e.status IN ['current','target','transitional','retired']
       RETURN e.id AS id, e.name AS name, e.status AS status`,
    );
    for (const r of offending.records) {
      const id = r.get('id');
      const name = r.get('name');
      const status = r.get('status');
      const next = normalize(status);
      console.log(`  ${name} (${id}): ${status} -> ${next}`);
      await s.run(
        `MATCH (e:ArchitectureElement {id: $id}) SET e.status = $status, e.updatedAt = datetime()`,
        { id, status: next },
      );
      fixed++;
    }
    console.log(`\nNormalized ${fixed} elements.`);
  } finally {
    await s.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
