/**
 * Backfill-Migration — Trust-Spine (UC-PROV-001 / THE-326, REQ-PROV-001.4).
 *
 * Setzt `provenance` auf Bestands-Atome, die es noch nicht haben:
 *  - Elemente ohne provenance → 'user' (Altdaten gelten als vom Menschen modelliert).
 *  - Connections ohne provenance → aus vorhandenem `source` abgeleitet (deriveProvenance),
 *    sonst 'user'. Bestehende `source`/`confidence` werden NIE angefasst (nur provenance).
 *
 * Idempotent: alle Writes sind durch `WHERE … provenance IS NULL` gescopet → mehrfach
 * ausführbar ohne Effekt. Default = DRY-RUN (schreibt nichts). `--apply` zum Schreiben.
 *
 * Mac (Dev):  npx ts-node src/scripts/backfill-provenance.ts            (dry-run)
 *             npx ts-node src/scripts/backfill-provenance.ts --apply
 * VPS (Prod): docker compose exec server node dist/scripts/backfill-provenance.js [--apply]
 */
import dotenv from 'dotenv';
import { runCypher, connectNeo4j, getNeo4jDriver } from '../config/neo4j';
import { deriveProvenance } from '../services/provenance.helper';

const toNum = (v: unknown): number =>
  typeof (v as { toNumber?: () => number })?.toNumber === 'function'
    ? (v as { toNumber: () => number }).toNumber()
    : Number(v ?? 0);

export interface BackfillReport {
  applied: boolean;
  elements: { nullProvenance: number; updated: number };
  connections: {
    bySource: Array<{ source: string | null; provenance: string; count: number }>;
    total: number;
    updated: number;
  };
}

/**
 * Testbarer Kern. Liest fehlende Provenance, plant Ableitung, schreibt nur bei `apply`.
 */
export async function runBackfill({ apply }: { apply: boolean }): Promise<BackfillReport> {
  // ── Elemente ───────────────────────────────────────────────
  const elRows = await runCypher(
    `MATCH (e:ArchitectureElement) WHERE e.provenance IS NULL RETURN count(e) AS cnt`,
  );
  const elNull = toNum(elRows[0]?.get('cnt'));
  if (apply && elNull > 0) {
    await runCypher(
      `MATCH (e:ArchitectureElement) WHERE e.provenance IS NULL SET e.provenance = 'user'`,
    );
  }

  // ── Connections (gruppiert nach source → deriveProvenance) ──
  const connRows = await runCypher(
    `MATCH ()-[r:CONNECTS_TO]->() WHERE r.provenance IS NULL
     RETURN r.source AS source, count(r) AS cnt`,
  );
  const bySource = connRows.map((row) => {
    const source = (row.get('source') ?? null) as string | null;
    return { source, provenance: deriveProvenance(source), count: toNum(row.get('cnt')) };
  });

  let connUpdated = 0;
  if (apply) {
    for (const grp of bySource) {
      if (grp.count === 0) continue;
      const where =
        grp.source === null
          ? 'r.provenance IS NULL AND r.source IS NULL'
          : 'r.provenance IS NULL AND r.source = $source';
      await runCypher(
        `MATCH ()-[r:CONNECTS_TO]->() WHERE ${where} SET r.provenance = $provenance`,
        grp.source === null
          ? { provenance: grp.provenance }
          : { source: grp.source, provenance: grp.provenance },
      );
      connUpdated += grp.count;
    }
  }

  const total = bySource.reduce((s, g) => s + g.count, 0);
  return {
    applied: apply,
    elements: { nullProvenance: elNull, updated: apply ? elNull : 0 },
    connections: { bySource, total, updated: connUpdated },
  };
}

async function main(): Promise<void> {
  dotenv.config();
  const apply = process.argv.includes('--apply');
  // eslint-disable-next-line no-console
  console.log(`[backfill-provenance] mode=${apply ? 'APPLY ⚠️' : 'DRY-RUN'} · NEO4J_URI=${process.env.NEO4J_URI}`);
  await connectNeo4j();
  try {
    const report = await runBackfill({ apply });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    if (!apply) {
      // eslint-disable-next-line no-console
      console.log('\nDRY-RUN — nichts geschrieben. Mit --apply schreiben.');
    }
  } finally {
    await getNeo4jDriver().close();
  }
}

// Nur ausführen, wenn direkt aufgerufen (nicht beim Import im Test).
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[backfill-provenance] failed:', err);
      process.exit(1);
    });
}
