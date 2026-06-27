/**
 * seed-art30 — Art.-30-Abs.-1-Anforderungssatz in ein Projekt seeden.
 * REQ-WFCOMP-001.1 / THE-352. Idempotent (Upsert auf Unique-Keys).
 *
 * Ebene B: 1 Regulation (Verbatim, versionsgesperrt v1).
 * Ebene A: 7 ComplianceRequirements (createdBy='human', mit criticality + traceTarget).
 *
 * CLI:  npx ts-node src/scripts/seed-art30.ts <projectId>
 */
import mongoose from 'mongoose';
import { Regulation } from '../models/Regulation';
import { ComplianceRequirement } from '../models/ComplianceRequirement';
import {
  ART30_FIELDS,
  ART30_FULLTEXT,
  ART30_SOURCE_URL,
  ART30_EFFECTIVE_FROM,
  ART30_PARAGRAPH_NUMBER,
  ART30_TITLE,
} from '../data/art30.seed-data';

export interface SeedArt30Result {
  regulationId: string;
  requirementIds: string[];
}

/**
 * Seedet (idempotent) Art. 30 Abs. 1 in das gegebene Projekt.
 * Re-Run aktualisiert vorhandene Einträge statt zu duplizieren.
 */
export async function seedArt30(projectId: string): Promise<SeedArt30Result> {
  // Ebene B — Regulation (Unique: projectId + source + paragraphNumber + version)
  const reg = await Regulation.findOneAndUpdate(
    {
      projectId,
      source: 'dsgvo',
      paragraphNumber: ART30_PARAGRAPH_NUMBER,
      version: 1,
    },
    {
      $set: {
        jurisdiction: 'EU',
        title: ART30_TITLE,
        fullText: ART30_FULLTEXT,
        sourceUrl: ART30_SOURCE_URL,
        effectiveFrom: new Date(ART30_EFFECTIVE_FROM),
        language: 'de',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );
  if (!reg) throw new Error('[seed-art30] Regulation upsert returned null');

  // Ebene A — 7 ComplianceRequirements (Unique: projectId + regulationId + title)
  const requirementIds: string[] = [];
  for (const f of ART30_FIELDS) {
    const r = await ComplianceRequirement.findOneAndUpdate(
      { projectId, regulationId: reg._id, title: f.title },
      {
        $set: {
          sourceParagraph: f.sourceParagraph,
          description: f.description,
          priority: f.priority,
          createdBy: 'human',
          criticality: f.criticality,
          traceTarget: f.traceTarget,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (!r) throw new Error(`[seed-art30] Requirement upsert returned null for lit. ${f.litera}`);
    requirementIds.push(r._id.toString());
  }

  return { regulationId: reg._id.toString(), requirementIds };
}

// ─── CLI runner (nur bei direktem Aufruf, nicht beim Import im Test) ───
if (require.main === module) {
  void (async () => {
    const dotenv = await import('dotenv');
    dotenv.config();
    const projectId = process.argv[2];
    if (!projectId) {
      // eslint-disable-next-line no-console
      console.error('Usage: npx ts-node src/scripts/seed-art30.ts <projectId>');
      process.exit(1);
    }
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      // eslint-disable-next-line no-console
      console.error('[seed-art30] MONGODB_URI not set');
      process.exit(1);
    }
    await mongoose.connect(uri);
    try {
      const res = await seedArt30(projectId);
      // eslint-disable-next-line no-console
      console.log('[seed-art30] done:', JSON.stringify(res, null, 2));
    } finally {
      await mongoose.disconnect();
    }
  })()
    .then(() => process.exit(0))
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[seed-art30] failed:', err);
      process.exit(1);
    });
}
