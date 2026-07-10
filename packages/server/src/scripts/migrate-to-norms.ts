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
import {
  buildRegulationKey,
  deriveNormWorkId,
  isJurisdiction,
  isLanguage,
} from '@thearchitect/shared';
import { Standard } from '../models/Standard';
import { ComplianceMapping } from '../models/ComplianceMapping';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import { Regulation } from '../models/Regulation';
import { listNorms, upsertNormDoc } from '../services/norm.service';

/** Eine fehlgeschlagene Norm-Materialisierung — der Lauf geht weiter (THE-417 review). */
export interface NormMigrationFailure {
  projectId: string;
  workId?: string;
  error: string;
}

export interface NormMigrationReport {
  applied: boolean;
  projects: number;
  normsMaterialized: number;
  /** Materialisierungen, die an der Ontologie-Validierung (o. ä.) scheiterten. */
  normFailures: NormMigrationFailure[];
  requirementsTotal: number; // legacy requirements missing a normId
  requirementsBackfilled: number;
  requirementsSkippedNoRegulation: number;
}

/** Werte im App-DB-Regulation-Bestand, die NICHT in der Ontologie sind (pre-THE-413 legacy docs). */
export interface OffOntologyReport {
  jurisdictions: string[];
  languages: string[];
}

/**
 * Pre-Check (THE-417 review): findet off-ontology jurisdiction/language-Werte im
 * App-DB-Regulation-Bestand, BEVOR die Materialisierung an `runValidators: true`
 * scheitert. Läuft in beiden Modi; Treffer sind Warnungen, kein Abbruch.
 */
export async function findOffOntologyValues(): Promise<OffOntologyReport> {
  const [jurisdictions, languages] = await Promise.all([
    Regulation.distinct('jurisdiction'),
    Regulation.distinct('language'),
  ]);
  return {
    jurisdictions: (jurisdictions as unknown[]).map(String).filter(v => !isJurisdiction(v)),
    languages: (languages as unknown[]).map(String).filter(v => !isLanguage(v)),
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
    normFailures: [],
    requirementsTotal: 0,
    requirementsBackfilled: 0,
    requirementsSkippedNoRegulation: 0,
  };

  // 1) Norm-Materialisierung — pro View try/catch (THE-417 review): seit
  // `upsertNormDoc` mit `runValidators: true` läuft, darf EIN off-ontology
  // Legacy-Doc nicht den ganzen Prod-Lauf abbrechen. Fehler werden gesammelt,
  // der Rest wird materialisiert; die CLI wird bei Fehlern laut (exit != 0).
  for (const projectId of projectIds) {
    if (apply) {
      try {
        const views = await listNorms(projectId);
        for (const view of views) {
          try {
            await upsertNormDoc(view);
            report.normsMaterialized += 1;
          } catch (err) {
            report.normFailures.push({
              projectId,
              workId: view.identity.workId,
              error: errorMessage(err),
            });
          }
        }
      } catch (err) {
        // listNorms selbst gescheitert (z. B. Quelle unlesbar) — Projekt überspringen.
        report.normFailures.push({ projectId, error: errorMessage(err) });
      }
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
/* eslint-disable no-console */
if (require.main === module) {
  (async () => {
    const apply = process.argv.includes('--apply');
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
    await mongoose.connect(uri);

    // Pre-Check (beide Modi): off-ontology Werte VOR dem Lauf sichtbar machen.
    const offOntology = await findOffOntologyValues();
    if (offOntology.jurisdictions.length > 0 || offOntology.languages.length > 0) {
      console.warn('WARNUNG — off-ontology Werte im App-DB-Regulation-Bestand (pre-THE-413 legacy):');
      if (offOntology.jurisdictions.length > 0) {
        console.warn(`  jurisdiction: ${offOntology.jurisdictions.join(', ')}`);
      }
      if (offOntology.languages.length > 0) {
        console.warn(`  language: ${offOntology.languages.join(', ')}`);
      }
      console.warn('  → Zeilen in norm-ontology.v1.ts ergänzen ODER Docs bereinigen; betroffene Materialisierungen schlagen sonst fehl (werden übersprungen).');
    }

    const report = await runNormMigration({ apply });
    console.log(JSON.stringify(report, null, 2));

    const failed = report.normFailures.length;
    console.log(`materialized ${report.normsMaterialized}, failed ${failed}`);
    for (const f of report.normFailures) {
      console.error(`  FAILED project=${f.projectId}${f.workId ? ` workId=${f.workId}` : ''}: ${f.error}`);
    }
    if (!apply) {
      console.log('DRY-RUN — nichts geschrieben. Mit --apply ausführen.');
    }
    await mongoose.disconnect();
    // Laut, aber resilient: der Lauf ist durch, Fehler → non-zero nur im Apply-Modus.
    if (apply && failed > 0) {
      process.exitCode = 1;
    }
  })().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
