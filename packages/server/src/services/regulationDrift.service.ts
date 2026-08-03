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
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Evidence } from '../models/Evidence';
import { resetAttestedForStale } from './evidence.service';
import { getCurrentVersionHashes, isCorpusConfigured } from './corpusClient.service';

export interface DriftReport {
  applied: boolean;
  total: number; // mappings with a corpus reference
  mismatched: number; // corpus hash differs from stored hash
  inSync: number; // corpus hash == stored hash
  unknownInCorpus: number; // regulationKey not (yet) in the corpus → cannot decide
  // THE-558: Evidenz-Alterung im selben Lauf — gleiche Hash-Quelle, gleiche Regel.
  evidenceStaled: number; // Nachweise, deren Textstand nicht mehr der aktuelle ist
  attestedReset: number; // attestierte Tore, die mangels frischer Evidenz zurückfielen
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
    evidenceStaled: 0,
    attestedReset: 0,
  };

  // (kein Early-Return mehr: der Evidenz-Pass unten läuft auch ohne Mappings)

  const corpusHashes = mappings.length
    ? await getCurrentVersionHashes(mappings.map(m => m.regulationKey as string))
    : new Map<string, string>();

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

  // ── THE-558: Evidenz-Alterung ────────────────────────────────────────────
  // Gleiche Quelle, gleiche Regel wie oben: weicht der aktuelle Korpus-Hash
  // vom gespeicherten ab, ist der Nachweis stale. Er wird MARKIERT, nie
  // gelöscht — und ein attestiertes Tor ohne verbleibende frische Evidenz
  // fällt mit sichtbarem Grund zurück (resetAttestedForStale).
  const evidences = await Evidence.find({
    stale: { $ne: true },
    regulationKey: { $exists: true },
    regulationVersionHash: { $exists: true },
  }).select('_id requirementId regulationKey regulationVersionHash');

  if (evidences.length > 0) {
    const evidenceHashes = await getCurrentVersionHashes(
      [...new Set(evidences.map(e => e.regulationKey as string))],
    );
    const staleIds: unknown[] = [];
    const affectedRequirements = new Set<string>();
    for (const e of evidences) {
      const current = evidenceHashes.get(e.regulationKey as string);
      if (current === undefined) continue; // nicht entscheidbar — nicht raten
      if (current !== e.regulationVersionHash) {
        staleIds.push(e._id);
        affectedRequirements.add(String(e.requirementId));
      }
    }
    report.evidenceStaled = staleIds.length;

    if (apply && staleIds.length > 0) {
      // updateMany läuft bewusst am WORM-pre('save') vorbei: die Alterungs-
      // Markierung ist keine inhaltliche Änderung (Kommentar am Modell).
      await Evidence.updateMany({ _id: { $in: staleIds } }, { $set: { stale: true } });

      for (const reqId of affectedRequirements) {
        const freshLeft = await Evidence.countDocuments({ requirementId: reqId, stale: { $ne: true } });
        if (freshLeft > 0) continue;
        const doc = await ComplianceRequirement.findById(reqId).select('gates');
        if (!doc?.gates || doc.gates.attested.state !== 'yes') continue;
        await ComplianceRequirement.updateOne(
          { _id: reqId },
          { $set: { gates: resetAttestedForStale(doc.gates) } },
        );
        report.attestedReset += 1;
      }
    }
  }

  return report;
}
