/**
 * Extract architecture elements from local Neo4j into a JSON file
 * for the predictive-architecture similarity PoC.
 *
 * Output: notebooks/predictive-poc/data/elements.json
 *
 * Defaults: top 5 projects by element count, max 200 elements per project,
 * total cap 1000 — enough for a representative similarity test, small
 * enough to embed locally in <1 minute.
 *
 * Run from packages/server: npx tsx scripts/extract-elements-for-poc.ts
 */
import 'dotenv/config';
import neo4j from 'neo4j-driver';
import * as fs from 'fs';
import * as path from 'path';

const TOP_N_PROJECTS = 5;
const MAX_PER_PROJECT = 200;
const TOTAL_CAP = 1000;

const OUT_PATH = path.resolve(
  __dirname,
  '../../../notebooks/predictive-poc/data/elements.json',
);

interface ExtractedElement {
  id: string;
  name: string;
  description: string;
  type: string;
  layer: string;
  togafDomain: string;
  projectId: string;
  status: string;
  riskLevel: string;
  // connection summary (used in V2 for connection-pattern similarity, but
  // already extracted now so we don't need a second roundtrip)
  inDegree: number;
  outDegree: number;
}

async function main() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!),
  );
  const s = driver.session();
  try {
    // 1) Pick top-N projects by element count for diversity
    const projectRecs = await s.run(
      `MATCH (e:ArchitectureElement)
       RETURN e.projectId AS pid, count(e) AS c
       ORDER BY c DESC LIMIT $n`,
      { n: neo4j.int(TOP_N_PROJECTS) },
    );
    const projectIds = projectRecs.records.map((r) => r.get('pid') as string);
    console.log(`[extract] picked ${projectIds.length} projects:`);
    for (const r of projectRecs.records) {
      console.log(`  ${r.get('c').toNumber()} elements in ${r.get('pid')}`);
    }

    // 2) Pull elements per project, capped
    const elements: ExtractedElement[] = [];
    for (const pid of projectIds) {
      if (elements.length >= TOTAL_CAP) break;
      const remaining = TOTAL_CAP - elements.length;
      const limit = Math.min(MAX_PER_PROJECT, remaining);

      const r = await s.run(
        `MATCH (e:ArchitectureElement {projectId: $pid})
         OPTIONAL MATCH (e)-[outRel:CONNECTS_TO]->(:ArchitectureElement)
         OPTIONAL MATCH (:ArchitectureElement)-[inRel:CONNECTS_TO]->(e)
         WITH e, count(DISTINCT outRel) AS outD, count(DISTINCT inRel) AS inD
         RETURN e.id AS id, e.name AS name, e.description AS description,
                e.type AS type, e.layer AS layer, e.togafDomain AS togafDomain,
                e.status AS status, e.riskLevel AS riskLevel,
                inD, outD
         ORDER BY (inD + outD) DESC
         LIMIT $limit`,
        { pid, limit: neo4j.int(limit) },
      );
      for (const rec of r.records) {
        const name = (rec.get('name') as string) ?? '';
        if (!name.trim()) continue; // skip nameless entries
        elements.push({
          id: rec.get('id') as string,
          name,
          description: (rec.get('description') as string) ?? '',
          type: (rec.get('type') as string) ?? 'unknown',
          layer: (rec.get('layer') as string) ?? 'unknown',
          togafDomain: (rec.get('togafDomain') as string) ?? '',
          projectId: pid,
          status: (rec.get('status') as string) ?? '',
          riskLevel: (rec.get('riskLevel') as string) ?? '',
          inDegree: (rec.get('inD') as { toNumber(): number }).toNumber(),
          outDegree: (rec.get('outD') as { toNumber(): number }).toNumber(),
        });
      }
    }

    // 3) Write JSON
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify({ elements, extractedAt: new Date().toISOString() }, null, 2));

    console.log(`\n[extract] wrote ${elements.length} elements to ${OUT_PATH}`);
    console.log(`[extract] type distribution:`);
    const byType = new Map<string, number>();
    for (const e of elements) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
    for (const [t, c] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${c.toString().padStart(4)} ${t}`);
    }
  } finally {
    await s.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
