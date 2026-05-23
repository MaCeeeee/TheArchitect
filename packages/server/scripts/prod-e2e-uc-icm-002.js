/**
 * UC-ICM-002 D5 Production-E2E
 *
 * Läuft IM Production-App-Container und ruft den deployed Service
 * mapRegulationsBatch() direkt auf — gegen die 16 echten Production-
 * Regulations aus MongoDB + 5 inline definierte BSH-Demo-Elements.
 *
 * Umgeht Auth-Middleware (wir sind im Container, nicht über HTTP).
 *
 * Run on VPS:
 *   docker cp packages/server/scripts/prod-e2e-uc-icm-002.js \
 *     thearchitect-app:/tmp/prod-e2e.js
 *   docker exec thearchitect-app node /tmp/prod-e2e.js
 */
const mongoose = require('mongoose');

// ─── 5 BSH-Demo-Elements (inline, kein Neo4j-seed nötig) ─────
const BSH_ELEMENTS = [
  {
    id: 'cap-lieferantenmanagement',
    name: 'Lieferantenmanagement',
    type: 'capability',
    layer: 'business',
    description: 'Strategische Steuerung der Tier-1- und Tier-2-Zulieferer inkl. Onboarding, Bewertung, Risikoanalyse und Audit.',
  },
  {
    id: 'cap-datenverarbeitung-b2c',
    name: 'Datenverarbeitung B2C',
    type: 'capability',
    layer: 'business',
    description: 'Verarbeitung personenbezogener Daten von Endkunden im Rahmen des Hausgeräte-Vertriebs und After-Sales.',
  },
  {
    id: 'app-sap-erp',
    name: 'ERP-System SAP',
    type: 'application',
    layer: 'application',
    description: 'Zentrales SAP S/4HANA für Finanzen, Material, Produktion, Vertrieb. ~3000 User.',
  },
  {
    id: 'app-hr-plattform',
    name: 'HR-Plattform',
    type: 'application',
    layer: 'application',
    description: 'Workday HR mit Stammdaten, Gehaltsabrechnung, Performance-Reviews. Enthält Gesundheitsdaten + Sozialversicherung.',
  },
  {
    id: 'data-personalakte',
    name: 'Mitarbeiter-Personalakte',
    type: 'data_object',
    layer: 'data',
    description: 'Digitale Personalakte mit Stamm-, Vertrags-, Gesundheits- und Performance-Daten.',
  },
];

async function main() {
  console.log('▶ UC-ICM-002 D5 Production-E2E');
  console.log('▶ Container:', require('os').hostname());
  console.log('▶ Model:', process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001');
  console.log('▶ Elements:', BSH_ELEMENTS.length);

  // Mongoose connect
  await mongoose.connect(process.env.MONGODB_URI);

  // Load Regulation model (registered globally)
  const Regulation = require('/app/packages/server/dist/models/Regulation').Regulation;
  const ComplianceMapping = require('/app/packages/server/dist/models/ComplianceMapping').ComplianceMapping;

  // Load all 16 regulations
  const regulations = await Regulation.find({}).select('-embedding');
  console.log('▶ Regulations loaded:', regulations.length);

  if (regulations.length === 0) {
    console.error('No regulations found — aborting.');
    process.exit(1);
  }

  // Use the projectId from the first regulation as the canonical project
  const projectId = regulations[0].projectId.toString();
  console.log('▶ Using projectId:', projectId);

  // Wipe any previous run for clean comparison (optional)
  const wipeResult = await ComplianceMapping.deleteMany({
    projectId: regulations[0].projectId,
  });
  console.log('▶ Wiped previous mappings:', wipeResult.deletedCount);

  // Call the deployed service
  const { mapRegulationsBatch } = require('/app/packages/server/dist/services/complianceMapping.service');

  console.log('\n▶ Running mapRegulationsBatch() with concurrency=5 ...');
  const t0 = Date.now();
  const result = await mapRegulationsBatch({
    regulations,
    candidateElements: BSH_ELEMENTS,
    projectId,
    concurrency: 5,
  });
  const wallMs = Date.now() - t0;

  console.log('\n' + '━'.repeat(72));
  console.log('Result');
  console.log('━'.repeat(72));
  console.log('totalRegulations:', result.totalRegulations);
  console.log('totalMapped:     ', result.totalMapped);
  console.log('errors:          ', result.errors.length);
  console.log('serviceDurationMs:', result.durationMs);
  console.log('wallDurationMs:  ', wallMs);
  console.log('avg per reg:     ', Math.round(result.durationMs / result.totalRegulations) + 'ms');

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of result.errors.slice(0, 5)) {
      console.log('  - reg ' + e.regulationId.slice(0, 8) + ': ' + e.error.slice(0, 80));
    }
  }

  // Per-element mapping distribution
  const mappings = await ComplianceMapping.find({ projectId: regulations[0].projectId })
    .sort({ confidence: -1 })
    .lean();
  console.log('\nPer-element distribution:');
  const byElement = {};
  for (const m of mappings) {
    if (!byElement[m.elementId]) byElement[m.elementId] = [];
    byElement[m.elementId].push(m);
  }
  for (const el of BSH_ELEMENTS) {
    const ms = byElement[el.id] || [];
    const high = ms.filter(m => m.confidence >= 0.9).length;
    const med  = ms.filter(m => m.confidence >= 0.7 && m.confidence < 0.9).length;
    const low  = ms.filter(m => m.confidence < 0.7).length;
    console.log('  ' + el.id.padEnd(30) + ' total=' + String(ms.length).padStart(2) +
      '  high(≥0.9)=' + high + '  med(0.7-0.9)=' + med + '  low(<0.7)=' + low);
  }

  console.log('\nTop-5 highest-confidence mappings:');
  for (const m of mappings.slice(0, 5)) {
    const reg = regulations.find(r => r._id.toString() === m.regulationId.toString());
    const regLabel = reg ? `${reg.source} ${reg.paragraphNumber}` : '(?)';
    console.log('  [' + m.confidence.toFixed(2) + '] ' + regLabel.padEnd(20) + ' → ' + m.elementId);
    console.log('         ' + m.reasoning.slice(0, 100));
  }

  console.log('\n✅ D5 Production-E2E complete.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
