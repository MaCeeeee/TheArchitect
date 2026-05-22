/**
 * UC-ICM-002 D4 — Performance Live-Benchmark
 *
 * Misst `mapRegulationsBatch` gegen echtes Anthropic Haiku 4.5 bei
 * unterschiedlichen Concurrency-Werten und vergleicht mit dem 90s-Target
 * aus REQ-ICM-002.3 AC-2.
 *
 * Scope: 20 BSH-ähnliche Regulations × 5 Architecture-Elements
 *  (klein gewählt, damit der Budget-Aufwand vertretbar bleibt
 *   — projezierte Werte für 50 × 10 werden hochgerechnet).
 *
 * Run: cd packages/server && npx tsx scripts/verify-uc-icm-002-perf.ts
 * Cost: 3 runs × 20 calls × ~$0.001 = ~$0.06 total
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });
if (!process.env.ANTHROPIC_API_KEY) {
  dotenvConfig({
    path: '/Users/mac_macee/javis/packages/server/.env',
    override: true,
    quiet: true,
  });
}

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Anthropic from '@anthropic-ai/sdk';
import { ComplianceMapping } from '../src/models/ComplianceMapping';
import {
  mapRegulationsBatch,
  type CandidateElement,
} from '../src/services/complianceMapping.service';
import type { IRegulation } from '../src/models/Regulation';

// ─── Fixtures ───────────────────────────────────────────────────

const ELEMENTS: CandidateElement[] = [
  {
    id: 'cap-lieferantenmanagement',
    name: 'Lieferantenmanagement',
    type: 'capability',
    layer: 'business',
    description: 'Strategische Steuerung der Tier-1- und Tier-2-Zulieferer.',
  },
  {
    id: 'cap-datenverarbeitung-b2c',
    name: 'Datenverarbeitung B2C',
    type: 'capability',
    layer: 'business',
    description: 'Verarbeitung personenbezogener Kundendaten.',
  },
  {
    id: 'app-sap-erp',
    name: 'ERP-System SAP',
    type: 'application',
    layer: 'application',
    description: 'SAP S/4HANA für Finanzen, Material, Vertrieb.',
  },
  {
    id: 'app-hr-plattform',
    name: 'HR-Plattform',
    type: 'application',
    layer: 'application',
    description: 'Workday HR mit Personal- und Gesundheitsdaten.',
  },
  {
    id: 'data-personalakte',
    name: 'Mitarbeiter-Personalakte',
    type: 'data_object',
    layer: 'data',
    description: 'Personalakte mit Gesundheits- und Vertragsdaten.',
  },
];

const REG_FIXTURES: Array<{ source: string; paragraphNumber: string; title: string; fullText: string; lang: 'de' | 'en' }> = [
  // 20 BSH-relevante Paragraphen (NIS2 + LkSG + DSGVO)
  { source: 'nis2', paragraphNumber: 'Art. 21(2)(a)', title: 'Risikoanalyse', fullText: 'Konzepte für Risikoanalyse und Sicherheit der Informationssysteme sind verpflichtend einzurichten.', lang: 'de' },
  { source: 'nis2', paragraphNumber: 'Art. 21(2)(b)', title: 'Bewältigung von Sicherheitsvorfällen', fullText: 'Verfahren zur Bewältigung von Sicherheitsvorfällen müssen etabliert sein.', lang: 'de' },
  { source: 'nis2', paragraphNumber: 'Art. 21(2)(c)', title: 'Business Continuity', fullText: 'Aufrechterhaltung des Betriebs einschließlich Backup-Management und Wiederherstellung nach Notfällen.', lang: 'de' },
  { source: 'nis2', paragraphNumber: 'Art. 21(2)(d)', title: 'Sicherheit der Lieferkette', fullText: 'Sicherheit der Lieferkette einschließlich sicherheitsbezogener Aspekte der Beziehungen zwischen Einrichtungen und ihren Anbietern.', lang: 'de' },
  { source: 'nis2', paragraphNumber: 'Art. 21(2)(e)', title: 'Sicherheit bei Erwerb', fullText: 'Sicherheit bei der Beschaffung, Entwicklung und Wartung von Netz- und Informationssystemen.', lang: 'de' },
  { source: 'nis2', paragraphNumber: 'Art. 21(2)(f)', title: 'Wirksamkeit', fullText: 'Konzepte und Verfahren zur Bewertung der Wirksamkeit von Risikomanagementmaßnahmen.', lang: 'de' },
  { source: 'nis2', paragraphNumber: 'Art. 21(2)(g)', title: 'Cyberhygiene', fullText: 'Grundlegende Verfahren im Bereich der Cyberhygiene und Schulungen im Bereich der Cybersicherheit.', lang: 'de' },
  { source: 'lksg', paragraphNumber: '§ 3', title: 'Sorgfaltspflichten', fullText: 'Unternehmen sind verpflichtet, in ihren Lieferketten menschenrechtliche und umweltbezogene Sorgfaltspflichten zu beachten und ein Risikomanagement einzurichten.', lang: 'de' },
  { source: 'lksg', paragraphNumber: '§ 4', title: 'Risikomanagement', fullText: 'Die Sorgfaltspflichten umfassen die Einrichtung eines angemessenen und wirksamen Risikomanagementsystems.', lang: 'de' },
  { source: 'lksg', paragraphNumber: '§ 5', title: 'Risikoanalyse', fullText: 'Das Unternehmen hat einmal im Jahr sowie anlassbezogen eine Risikoanalyse durchzuführen.', lang: 'de' },
  { source: 'lksg', paragraphNumber: '§ 6', title: 'Präventionsmaßnahmen', fullText: 'Angemessene Präventionsmaßnahmen gegenüber unmittelbaren Zulieferern sind insbesondere die Berücksichtigung menschenrechtlicher und umweltbezogener Erwartungen.', lang: 'de' },
  { source: 'lksg', paragraphNumber: '§ 7', title: 'Abhilfemaßnahmen', fullText: 'Unverzüglich Abhilfemaßnahmen zu ergreifen, wenn die Verletzung menschenrechtlicher Pflichten festgestellt wird.', lang: 'de' },
  { source: 'lksg', paragraphNumber: '§ 8', title: 'Beschwerdeverfahren', fullText: 'Einrichtung eines unternehmensinternen Beschwerdeverfahrens für Personen, die menschenrechtliche Risiken hinweisen.', lang: 'de' },
  { source: 'dsgvo', paragraphNumber: 'Art. 5', title: 'Grundsätze', fullText: 'Personenbezogene Daten müssen rechtmäßig, nach Treu und Glauben und auf transparente Weise verarbeitet werden.', lang: 'de' },
  { source: 'dsgvo', paragraphNumber: 'Art. 6', title: 'Rechtmäßigkeit', fullText: 'Die Verarbeitung ist nur rechtmäßig, wenn eine der genannten Bedingungen erfüllt ist, z.B. Einwilligung oder vertragliche Notwendigkeit.', lang: 'de' },
  { source: 'dsgvo', paragraphNumber: 'Art. 9', title: 'Besondere Kategorien', fullText: 'Die Verarbeitung von Gesundheitsdaten, biometrischen Daten und Daten zu religiösen Überzeugungen ist grundsätzlich untersagt.', lang: 'de' },
  { source: 'dsgvo', paragraphNumber: 'Art. 25', title: 'Privacy by Design', fullText: 'Geeignete technische und organisatorische Maßnahmen zum Datenschutz durch Technikgestaltung müssen umgesetzt werden.', lang: 'de' },
  { source: 'dsgvo', paragraphNumber: 'Art. 30', title: 'Verzeichnis Verarbeitungstätigkeiten', fullText: 'Jeder Verantwortliche führt ein Verzeichnis aller Verarbeitungstätigkeiten, die seiner Zuständigkeit unterliegen.', lang: 'de' },
  { source: 'dsgvo', paragraphNumber: 'Art. 32', title: 'Sicherheit', fullText: 'Geeignete technische und organisatorische Maßnahmen, um ein dem Risiko angemessenes Schutzniveau zu gewährleisten, einschließlich Pseudonymisierung und Verschlüsselung.', lang: 'de' },
  { source: 'dsgvo', paragraphNumber: 'Art. 35', title: 'Datenschutz-Folgenabschätzung', fullText: 'Bei hohem Risiko für die Rechte und Freiheiten natürlicher Personen ist eine Datenschutz-Folgenabschätzung durchzuführen.', lang: 'de' },
];

async function seedRegulations(projectId: string): Promise<IRegulation[]> {
  const docs = REG_FIXTURES.map((r, i) => ({
    _id: new mongoose.Types.ObjectId(),
    projectId: new mongoose.Types.ObjectId(projectId),
    source: r.source,
    paragraphNumber: r.paragraphNumber,
    title: r.title,
    fullText: r.fullText + ' '.repeat(Math.max(0, 60 - r.fullText.length)),
    sourceUrl: `https://example.org/reg/${i}`,
    language: r.lang,
    jurisdiction: 'EU',
    effectiveFrom: new Date('2024-01-01'),
  }));
  // Return as IRegulation-compatible objects (we won't persist Regulations here —
  // just build mongoose-shaped objects for the batch service)
  return docs as unknown as IRegulation[];
}

async function runBenchmark(
  regulations: IRegulation[],
  candidates: CandidateElement[],
  projectId: string,
  concurrency: number,
  anthropicClient: Anthropic,
): Promise<{ durationMs: number; mapped: number; errors: number }> {
  // Wipe persisted mappings to keep each iteration's persistence-cost fair
  await ComplianceMapping.deleteMany({ projectId: new mongoose.Types.ObjectId(projectId) });
  const result = await mapRegulationsBatch({
    regulations,
    candidateElements: candidates,
    projectId,
    concurrency,
    anthropicClient,
  });
  return { durationMs: result.durationMs, mapped: result.totalMapped, errors: result.errors.length };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — aborting.');
    process.exit(1);
  }

  // In-memory Mongo so we don't trash real DB
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await ComplianceMapping.ensureIndexes();

  const projectId = new mongoose.Types.ObjectId().toString();
  const regulations = await seedRegulations(projectId);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`▶ UC-ICM-002 D4 Performance Benchmark`);
  console.log(`▶ Model: ${process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'}`);
  console.log(`▶ Regulations: ${regulations.length}`);
  console.log(`▶ Elements per regulation: ${ELEMENTS.length}`);
  console.log(`▶ Total Anthropic calls per run: ${regulations.length}`);
  console.log('');

  const runs: Array<{ label: string; concurrency: number; ms: number; mapped: number; errors: number; rpm: number }> = [];

  // Test 3 concurrency levels: 1 (baseline serial), 5 (default), 10 (max)
  for (const c of [1, 5, 10]) {
    process.stdout.write(`  • concurrency=${String(c).padStart(2)} ... `);
    try {
      const r = await runBenchmark(regulations, ELEMENTS, projectId, c, client);
      const rpm = (regulations.length / (r.durationMs / 1000)) * 60;
      runs.push({ label: `c=${c}`, concurrency: c, ms: r.durationMs, mapped: r.mapped, errors: r.errors, rpm });
      console.log(`${(r.durationMs / 1000).toFixed(1)}s | ${r.mapped} mapped | ${r.errors} errors | ${rpm.toFixed(0)} RPM`);
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`);
    }
  }

  console.log('\n' + '━'.repeat(72));
  console.log('Results Summary');
  console.log('━'.repeat(72));
  console.log('Concurrency  |  Duration  |  Mapped  |  Errors  |  Anthropic RPM');
  console.log('-'.repeat(72));
  for (const r of runs) {
    console.log(
      `${String(r.concurrency).padStart(11)}  |  ${(r.ms / 1000).toFixed(1).padStart(7)}s  |  ${String(r.mapped).padStart(6)}  |  ${String(r.errors).padStart(6)}  |  ${r.rpm.toFixed(0).padStart(13)}`,
    );
  }

  // Project to 50 × 10 (THE-280 AC-2 target)
  console.log('\n' + '─'.repeat(72));
  console.log('Projection for AC-2 target: 50 regulations × 10 elements');
  console.log('─'.repeat(72));
  for (const r of runs) {
    const projected50x = (r.ms * 50) / regulations.length;
    const target90s = projected50x < 90_000 ? '✅ PASS' : '❌ FAIL';
    console.log(
      `  concurrency=${String(r.concurrency).padStart(2)} → ${(projected50x / 1000).toFixed(1).padStart(5)}s for 50 regs   ${target90s}  (target: < 90s)`,
    );
  }

  // Speedup analysis
  if (runs.length >= 2) {
    const serial = runs.find(r => r.concurrency === 1);
    const c5 = runs.find(r => r.concurrency === 5);
    const c10 = runs.find(r => r.concurrency === 10);
    console.log('\n' + '─'.repeat(72));
    console.log('Speedup vs. serial (c=1)');
    console.log('─'.repeat(72));
    if (serial && c5) {
      console.log(`  c=5  speedup: ${(serial.ms / c5.ms).toFixed(2)}× (ideal ~5×)`);
    }
    if (serial && c10) {
      console.log(`  c=10 speedup: ${(serial.ms / c10.ms).toFixed(2)}× (ideal ~10×)`);
    }
  }

  await mongoose.disconnect();
  await mongoServer.stop();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
