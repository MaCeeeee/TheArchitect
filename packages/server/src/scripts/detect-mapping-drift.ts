/**
 * Drift-Detection-Runner (THE-368). Setzt `regulationVersionMismatch` auf
 * ComplianceMappings, deren gespeicherter `versionHash` vom aktuellen Korpus-Hash
 * abweicht. Default = DRY-RUN; `--apply` schreibt.
 *
 * Voraussetzung: CORPUS_MONGODB_URI gesetzt (Korpus erreichbar).
 *
 * Mac:  npx ts-node src/scripts/detect-mapping-drift.ts            (dry-run)
 *       npx ts-node src/scripts/detect-mapping-drift.ts --apply
 * Prod: docker compose exec server node dist/scripts/detect-mapping-drift.js --apply
 */
import mongoose from 'mongoose';
import { detectMappingDrift } from '../services/regulationDrift.service';

async function main(): Promise<void> {
  const dotenv = await import('dotenv');
  dotenv.config();
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[detect-drift] MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  try {
    const r = await detectMappingDrift({ apply });
    console.log(
      `[detect-drift] ${apply ? 'APPLIED' : 'DRY-RUN'} — total=${r.total} mismatched=${r.mismatched} ` +
        `inSync=${r.inSync} unknownInCorpus=${r.unknownInCorpus}`,
    );
    if (!apply && r.mismatched > 0) console.log('[detect-drift] re-run with --apply to flag mismatches.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[detect-drift] failed:', err);
    process.exit(1);
  });
}
