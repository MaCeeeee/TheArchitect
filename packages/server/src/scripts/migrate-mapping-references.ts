/**
 * Backfill-Migration — Corpus-Referenz auf ComplianceMappings (THE-306 / ADR-0001).
 *
 * Setzt `regulationKey` + `regulationVersionHash` auf Bestands-Mappings, die noch
 * keine Korpus-Referenz haben. Werte werden aus der referenzierten `Regulation`
 * abgeleitet:
 *   - regulationKey       = buildRegulationKey(source, paragraphNumber)   (shared)
 *   - regulationVersionHash = computeVersionHash(fullText)                (sha256)
 *
 * Idempotent: scoped auf `regulationKey: { $exists: false }` → mehrfach ausführbar.
 * Default = DRY-RUN (schreibt nichts). `--apply` zum Schreiben.
 *
 * Mac (Dev):  npx ts-node src/scripts/migrate-mapping-references.ts            (dry-run)
 *             npx ts-node src/scripts/migrate-mapping-references.ts --apply
 * VPS (Prod): docker compose exec server node dist/scripts/migrate-mapping-references.js --apply
 */
import mongoose from 'mongoose';
import { buildRegulationKey } from '@thearchitect/shared';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { Regulation } from '../models/Regulation';
import { computeVersionHash } from '../utils/regulationVersion';

export interface MigrationReport {
  applied: boolean;
  total: number; // mappings missing a corpus reference
  updated: number;
  skippedNoRegulation: number; // referenced Regulation not found → cannot derive
}

/**
 * Testbarer Kern. Liest Mappings ohne Korpus-Referenz, leitet Key+Hash aus der
 * referenzierten Regulation ab, schreibt nur bei `apply`.
 */
export async function runMappingReferenceMigration({
  apply,
}: {
  apply: boolean;
}): Promise<MigrationReport> {
  const missing = await ComplianceMapping.find({
    regulationKey: { $exists: false },
  }).select('_id regulationId');

  const report: MigrationReport = {
    applied: apply,
    total: missing.length,
    updated: 0,
    skippedNoRegulation: 0,
  };

  // Cache regulations by id so the same paragraph isn't re-read for every mapping.
  const regCache = new Map<string, { key: string; hash: string } | null>();

  const ops: Array<{
    updateOne: {
      filter: { _id: mongoose.Types.ObjectId };
      update: { $set: { regulationKey: string; regulationVersionHash: string } };
    };
  }> = [];

  for (const m of missing) {
    const regId = m.regulationId?.toString();
    if (!regId) {
      report.skippedNoRegulation += 1;
      continue;
    }

    let derived = regCache.get(regId);
    if (derived === undefined) {
      const reg = await Regulation.findById(regId).select('source paragraphNumber fullText');
      derived = reg
        ? {
            key: buildRegulationKey(reg.source, reg.paragraphNumber),
            hash: computeVersionHash(reg.fullText),
          }
        : null;
      regCache.set(regId, derived);
    }

    if (!derived) {
      report.skippedNoRegulation += 1;
      continue;
    }

    report.updated += 1;
    ops.push({
      updateOne: {
        filter: { _id: m._id as mongoose.Types.ObjectId },
        update: { $set: { regulationKey: derived.key, regulationVersionHash: derived.hash } },
      },
    });
  }

  if (apply && ops.length > 0) {
    await ComplianceMapping.bulkWrite(ops, { ordered: false });
  }

  return report;
}

async function main(): Promise<void> {
  const dotenv = await import('dotenv');
  dotenv.config();
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[migrate-mapping-references] MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  try {
    const report = await runMappingReferenceMigration({ apply });
    console.log(
      `[migrate-mapping-references] ${apply ? 'APPLIED' : 'DRY-RUN'} — ` +
        `total=${report.total} updated=${report.updated} skippedNoRegulation=${report.skippedNoRegulation}`,
    );
    if (!apply && report.total > 0) {
      console.log('[migrate-mapping-references] re-run with --apply to write.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[migrate-mapping-references] failed:', err);
    process.exit(1);
  });
}
