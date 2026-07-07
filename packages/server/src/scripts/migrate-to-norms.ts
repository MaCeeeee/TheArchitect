/**
 * Migration — Norm-Materialisierung + Requirement-Backfill (THE-390 P4 / ADR-0004).
 *
 * Was sie tut (pro Projekt):
 *   1. Materialisiert alle Normen (Upload-Standards + Korpus-Gesetze) in die
 *      `Norm`-Collection (idempotenter Upsert über {projectId, workId}).
 *   2. Backfillt `normId`/`sectionEId` auf legacy ComplianceRequirements: die
 *      referenzierte legacy `Regulation` liefert source+paragraph → normId =
 *      `corpus:<source>`, sectionEId = regulationKey. (Die 60 Prod-Mappings aus
 *      dem THE-419-Befund brauchen KEINEN eigenen Backfill — ComplianceMapping
 *      trägt bereits `regulationKey`, woraus die Facade den normId ableitet;
 *      Voraussetzung ist der gelaufene migrate-mapping-references-Backfill.)
 *
 * Idempotent: Upserts + `normId: { $exists: false }`-Scope → mehrfach ausführbar.
 * Default = DRY-RUN (schreibt nichts). `--apply` zum Schreiben.
 *
 * Mac (Dev):  npx ts-node src/scripts/migrate-to-norms.ts            (dry-run)
 *             npx ts-node src/scripts/migrate-to-norms.ts --apply
 * VPS (Prod): docker compose exec app node dist/scripts/migrate-to-norms.js --apply
 */
import mongoose from 'mongoose';
import { buildRegulationKey, deriveNormWorkId } from '@thearchitect/shared';
import { Standard } from '../models/Standard';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';
import { materializeProjectNorms } from '../services/norm.service';

export interface NormMigrationReport {
  applied: boolean;
  projects: number;
  normsMaterialized: number;
  requirementsTotal: number; // legacy requirements missing a normId
  requirementsBackfilled: number;
  requirementsSkippedNoRegulation: number;
}

/** Testbarer Kern. */
export async function runNormMigration({ apply }: { apply: boolean }): Promise<NormMigrationReport> {
  // Projekt-Menge = alles, was Standards ODER Mappings hat.
  const projectIds = new Set<string>([
    ...(await Standard.distinct('projectId')).map(String),
    ...(await ComplianceMapping.distinct('projectId')).map(String),
  ]);

  const report: NormMigrationReport = {
    applied: apply,
    projects: projectIds.size,
    normsMaterialized: 0,
    requirementsTotal: 0,
    requirementsBackfilled: 0,
    requirementsSkippedNoRegulation: 0,
  };

  // 1) Norm-Materialisierung
  for (const projectId of projectIds) {
    if (apply) {
      const { upserted } = await materializeProjectNorms(projectId);
      report.normsMaterialized += upserted;
    } else {
      // dry-run: nur zählen, nichts schreiben
      const standards = await Standard.countDocuments({ projectId });
      const sources = await ComplianceMapping.distinct('regulationKey', {
        projectId: new mongoose.Types.ObjectId(projectId),
        regulationKey: { $exists: true },
      });
      const lawSources = new Set(
        (sources as string[]).map(k => k.slice(0, Math.max(0, k.indexOf(':')))).filter(Boolean),
      );
      report.normsMaterialized += standards + lawSources.size;
    }
  }

  // 2) Requirement-Backfill (legacy → normId/sectionEId)
  const missing = await ComplianceRequirement.find({ normId: { $exists: false } });
  report.requirementsTotal = missing.length;
  for (const req of missing) {
    const reg = await Regulation.findById(req.regulationId).select('source paragraphNumber');
    if (!reg) {
      report.requirementsSkippedNoRegulation += 1;
      continue;
    }
    if (apply) {
      req.normId = deriveNormWorkId('corpus', reg.source);
      req.sectionEId = buildRegulationKey(reg.source, reg.paragraphNumber);
      await req.save();
    }
    report.requirementsBackfilled += 1;
  }

  return report;
}

// ─── CLI ───
if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    await mongoose.connect(uri);
    const report = await runNormMigration({ apply });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    if (!apply) {
      // eslint-disable-next-line no-console
      console.log('DRY-RUN — nichts geschrieben. Mit --apply ausführen.');
    }
    await mongoose.disconnect();
  })().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
