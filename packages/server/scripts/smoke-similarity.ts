/**
 * Manual end-to-end smoke-test for elementSimilarity.service.
 * Hits real local Sidecar (:8001) + real local Qdrant (:6333).
 *
 * Run from packages/server:
 *   EMBEDDING_SIDECAR_URL=http://localhost:8001 QDRANT_URL=http://localhost:6333 \
 *     npx tsx /tmp/smoke-similarity.ts
 */
import 'dotenv/config';
import {
  upsertEmbedding,
  findSimilarElements,
  similarityHealthCheck,
  deleteEmbedding,
} from '../src/services/elementSimilarity.service';

const WS = 'smoketest';

async function main() {
  console.log('=== health ===');
  console.log(await similarityHealthCheck());

  console.log('\n=== seed 5 elements ===');
  const seed = [
    { id: 's1', name: 'Emissions-Record', description: 'Monthly Scope 1/2/3 GHG measurements per facility', type: 'data_object', layer: 'information', projectId: 'p1' },
    { id: 's2', name: 'Greenhouse Gas Accounting', description: 'Process for computing total emissions', type: 'business_process', layer: 'business', projectId: 'p1' },
    { id: 's3', name: 'SAP S/4HANA', description: 'ERP core', type: 'application_component', layer: 'application', projectId: 'p1' },
    { id: 's4', name: 'Audit-Log Entry', description: 'Compliance audit trail event', type: 'data_object', layer: 'information', projectId: 'p1' },
    { id: 's5', name: 'Customer-Master', description: 'Customer record with PII', type: 'data_object', layer: 'information', projectId: 'p1' },
  ];
  for (const el of seed) {
    await upsertEmbedding(WS, el);
    console.log('  upserted', el.id);
  }

  // Use low threshold so we see all results in the smoke-test
  console.log('\n=== query "GHG-Daten für CO2-Reporting" (DE → expect EN Emissions-Record + GHG-Accounting) ===');
  const r1 = await findSimilarElements(WS, {
    text: 'GHG-Daten für CO2-Reporting',
    topK: 5,
    scoreThreshold: 0.05,
  });
  console.log('  confidence:', r1.confidence, 'topGap:', r1.topGap.toFixed(4));
  for (const r of r1.results) {
    console.log(`  ${r.score.toFixed(4)} [${r.tier.padEnd(7)}] ${r.name}`);
  }

  console.log('\n=== query "Coffee mug ordering" (negative — expect low confidence) ===');
  const r2 = await findSimilarElements(WS, {
    text: 'Coffee mug ordering system',
    scoreThreshold: 0.0,
  });
  console.log('  confidence:', r2.confidence, 'topGap:', r2.topGap.toFixed(4));
  for (const r of r2.results) {
    console.log(`  ${r.score.toFixed(4)} [${r.tier.padEnd(7)}] ${r.name}`);
  }

  console.log('\n=== self-query: findSimilar for s1 (expect s2 GHG-Accounting near top, s1 excluded) ===');
  const r3 = await findSimilarElements(WS, {
    elementId: 's1',
    topK: 3,
    scoreThreshold: 0.0,
  });
  console.log('  confidence:', r3.confidence);
  for (const r of r3.results) {
    console.log(`  ${r.score.toFixed(4)} [${r.tier.padEnd(7)}] ${r.name}`);
  }
  if (r3.results.find((r) => r.elementId === 's1')) {
    console.error('  ✗ FAIL: self was not excluded');
    process.exit(1);
  } else {
    console.log('  ✓ self excluded');
  }

  console.log('\n=== cleanup ===');
  for (const el of seed) {
    await deleteEmbedding(WS, el.id);
  }
  console.log('  done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
