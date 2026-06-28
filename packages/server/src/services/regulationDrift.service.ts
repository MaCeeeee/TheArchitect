/**
 * Regulation Drift Detection (THE-368, der aus THE-306 vertagte Teil).
 *
 * Vergleicht den auf jedem ComplianceMapping gespeicherten `regulationVersionHash`
 * (Stand zum Mapping-Zeitpunkt) mit dem AKTUELLEN Hash im Korpus (über den
 * Corpus-Client). Weicht er ab → `regulationVersionMismatch=true`: der Gesetzestext
 * hat sich seit dem Mapping geändert, das Mapping sollte geprüft / re-gemappt werden.
 *
 * Additiv — verändert keine bestehenden Reads. Default = DRY-RUN; `--apply` schreibt.
 */
import { ComplianceMapping } from '../models/ComplianceMapping';
import { getCurrentVersionHashes, isCorpusConfigured } from './corpusClient.service';

export interface DriftReport {
  applied: boolean;
  total: number; // mappings with a corpus reference
  mismatched: number; // corpus hash differs from stored hash
  inSync: number; // corpus hash == stored hash
  unknownInCorpus: number; // regulationKey not (yet) in the corpus → cannot decide
}

/**
 * Testbarer Kern. Liest referenzierte Mappings, holt aktuelle Korpus-Hashes,
 * setzt `regulationVersionMismatch` nur bei `apply`.
 */
export async function detectMappingDrift({ apply }: { apply: boolean }): Promise<DriftReport> {
  if (!isCorpusConfigured()) {
    throw new Error('corpus not configured — set CORPUS_MONGODB_URI');
  }

  const mappings = await ComplianceMapping.find({
    regulationKey: { $exists: true },
    regulationVersionHash: { $exists: true },
  }).select('_id regulationKey regulationVersionHash regulationVersionMismatch');

  const report: DriftReport = {
    applied: apply,
    total: mappings.length,
    mismatched: 0,
    inSync: 0,
    unknownInCorpus: 0,
  };

  if (mappings.length === 0) return report;

  const corpusHashes = await getCurrentVersionHashes(
    mappings.map(m => m.regulationKey as string),
  );

  const ops: Array<{
    updateOne: {
      filter: { _id: unknown };
      update: { $set: { regulationVersionMismatch: boolean } };
    };
  }> = [];

  for (const m of mappings) {
    const corpusHash = corpusHashes.get(m.regulationKey as string);
    if (corpusHash === undefined) {
      report.unknownInCorpus += 1;
      continue;
    }
    const mismatch = corpusHash !== m.regulationVersionHash;
    if (mismatch) report.mismatched += 1;
    else report.inSync += 1;

    if (m.regulationVersionMismatch !== mismatch) {
      ops.push({
        updateOne: {
          filter: { _id: m._id },
          update: { $set: { regulationVersionMismatch: mismatch } },
        },
      });
    }
  }

  if (apply && ops.length > 0) {
    await ComplianceMapping.bulkWrite(ops, { ordered: false });
  }

  return report;
}
