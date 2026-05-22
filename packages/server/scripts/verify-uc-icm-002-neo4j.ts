/**
 * UC-ICM-002 Neo4j-Roundtrip Verification — Stufe D
 *
 * Seedet 5 ArchiMate-Elements (BSH-Demo) in Neo4j unter einem Test-projectId,
 * ruft `loadProjectCandidateElements()` auf und prüft:
 *   1. Alle 5 Elements kommen zurück
 *   2. Type-Normalisierung greift (business_capability → capability,
 *      application_component → application, process → business_process)
 *   3. Layer + Description durchgereicht
 *   4. Tenant-Isolation: andere projectIds nicht sichtbar
 *   5. Plus 1 Element ohne `id`/`name` wird gedroppt (Robustheit)
 *
 * Cleanup: löscht seine Elements am Ende — non-destructive für andere Projects.
 *
 * Run: cd packages/server && npx tsx scripts/verify-uc-icm-002-neo4j.ts
 */
import { config as dotenvConfig } from 'dotenv';
import path from 'path';
dotenvConfig({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });
if (!process.env.NEO4J_URI) {
  dotenvConfig({
    path: '/Users/mac_macee/javis/packages/server/.env',
    override: true,
    quiet: true,
  });
}

import { connectNeo4j, runCypher, getNeo4jDriver } from '../src/config/neo4j';
import { loadProjectCandidateElements } from '../src/services/complianceElements.service';

const TEST_PROJECT_ID = '507f1f77bcf86cd700000d42'; // canary ObjectId — must not collide
const OTHER_PROJECT_ID = '507f1f77bcf86cd700000d99';

// Seed: BSH-style elements, deliberately using ArchiMate-3.2 variant types
// to exercise the normalizer.
const SEED_ELEMENTS = [
  {
    id: 'cap-lieferantenmanagement',
    name: 'Lieferantenmanagement',
    type: 'business_capability', // → must normalize to 'capability'
    layer: 'strategy',
    description: 'Strategische Fähigkeit zur Steuerung der Lieferantenbeziehungen.',
  },
  {
    id: 'app-sap-erp',
    name: 'ERP-System SAP',
    type: 'application_component', // → 'application'
    layer: 'application',
    description: 'SAP S/4HANA für Finance, Material, Vertrieb.',
  },
  {
    id: 'proc-onboarding',
    name: 'Lieferanten-Onboarding',
    type: 'process', // → 'business_process'
    layer: 'business',
    description: 'Prozess für die Erstaufnahme neuer Zulieferer.',
  },
  {
    id: 'data-personalakte',
    name: 'Mitarbeiter-Personalakte',
    type: 'data_object', // → 'data_object'
    layer: 'data',
    description: 'Digitale Personalakte mit Stamm- und Gesundheitsdaten.',
  },
  {
    id: 'cap-customer-svc',
    name: 'Customer Service',
    type: 'Capability', // → mixed-case, must normalize to 'capability'
    layer: 'strategy',
    description: 'After-Sales-Service Capability.',
  },
];

// Robustness probe: malformed element with no id, should be silently dropped
const MALFORMED_ELEMENT = {
  id: '',
  name: '',
  type: 'capability',
  layer: 'strategy',
  description: 'should-not-appear',
};

// Tenant-isolation canary
const OTHER_PROJECT_ELEMENT = {
  id: 'other-project-leak-canary',
  name: 'LEAK CANARY',
  type: 'capability',
  layer: 'strategy',
  description: 'this must not appear in TEST_PROJECT_ID results',
};

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

async function seed(): Promise<void> {
  // Wipe leftovers from previous failed runs
  await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId}) DETACH DELETE e`,
    { projectId: TEST_PROJECT_ID },
  );
  await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId}) DETACH DELETE e`,
    { projectId: OTHER_PROJECT_ID },
  );

  for (const el of [...SEED_ELEMENTS, MALFORMED_ELEMENT]) {
    await runCypher(
      `CREATE (e:ArchitectureElement {
         projectId: $projectId,
         id: $id, name: $name, type: $type,
         layer: $layer, description: $description
       })`,
      { projectId: TEST_PROJECT_ID, ...el },
    );
  }

  await runCypher(
    `CREATE (e:ArchitectureElement {
       projectId: $projectId,
       id: $id, name: $name, type: $type,
       layer: $layer, description: $description
     })`,
    { projectId: OTHER_PROJECT_ID, ...OTHER_PROJECT_ELEMENT },
  );
}

async function cleanup(): Promise<void> {
  await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId}) DETACH DELETE e`,
    { projectId: TEST_PROJECT_ID },
  );
  await runCypher(
    `MATCH (e:ArchitectureElement {projectId: $projectId}) DETACH DELETE e`,
    { projectId: OTHER_PROJECT_ID },
  );
}

function verify(loaded: Awaited<ReturnType<typeof loadProjectCandidateElements>>): Check[] {
  const checks: Check[] = [];

  // 1. Count: must be exactly 5 (malformed dropped)
  checks.push({
    name: 'count = 5 (malformed dropped)',
    passed: loaded.length === 5,
    detail: `got ${loaded.length} elements`,
  });

  // 2. No tenant leak
  const leak = loaded.find(e => e.id === OTHER_PROJECT_ELEMENT.id);
  checks.push({
    name: 'tenant isolation — no leak from OTHER_PROJECT_ID',
    passed: !leak,
    detail: leak ? `LEAKED: ${leak.id}` : 'clean',
  });

  // 3. Type normalization — business_capability → capability
  const cap = loaded.find(e => e.id === 'cap-lieferantenmanagement');
  checks.push({
    name: "type normalize: 'business_capability' → 'capability'",
    passed: cap?.type === 'capability',
    detail: `got '${cap?.type}'`,
  });

  // 4. Type normalization — application_component → application
  const app = loaded.find(e => e.id === 'app-sap-erp');
  checks.push({
    name: "type normalize: 'application_component' → 'application'",
    passed: app?.type === 'application',
    detail: `got '${app?.type}'`,
  });

  // 5. Type normalization — 'process' → 'business_process'
  const proc = loaded.find(e => e.id === 'proc-onboarding');
  checks.push({
    name: "type normalize: 'process' → 'business_process'",
    passed: proc?.type === 'business_process',
    detail: `got '${proc?.type}'`,
  });

  // 6. data_object stays data_object
  const data = loaded.find(e => e.id === 'data-personalakte');
  checks.push({
    name: "type passthrough: 'data_object' → 'data_object'",
    passed: data?.type === 'data_object',
    detail: `got '${data?.type}'`,
  });

  // 7. Case-insensitive — 'Capability' → 'capability'
  const csvc = loaded.find(e => e.id === 'cap-customer-svc');
  checks.push({
    name: "type normalize case-insensitive: 'Capability' → 'capability'",
    passed: csvc?.type === 'capability',
    detail: `got '${csvc?.type}'`,
  });

  // 8. Description carried through
  checks.push({
    name: 'description carried through',
    passed: !!cap?.description?.includes('Lieferantenbeziehungen'),
    detail: `cap.description = "${cap?.description?.slice(0, 60)}..."`,
  });

  // 9. Layer carried through
  checks.push({
    name: 'layer carried through',
    passed: cap?.layer === 'strategy' && app?.layer === 'application',
    detail: `cap.layer=${cap?.layer}, app.layer=${app?.layer}`,
  });

  // 10. Name carried through
  checks.push({
    name: 'name carried through',
    passed: cap?.name === 'Lieferantenmanagement',
    detail: `cap.name="${cap?.name}"`,
  });

  return checks;
}

async function main() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  console.log(`▶ UC-ICM-002 Neo4j Roundtrip — ${uri}`);
  console.log(`▶ Test projectId: ${TEST_PROJECT_ID}\n`);

  try {
    await connectNeo4j();
  } catch (err) {
    console.error('Neo4j connection failed:', (err as Error).message);
    process.exit(1);
  }

  let exitCode = 0;
  try {
    console.log('  → seeding 6 elements (5 valid + 1 malformed + 1 other-tenant) ...');
    await seed();

    console.log('  → loading via loadProjectCandidateElements() ...');
    const t0 = Date.now();
    const loaded = await loadProjectCandidateElements(TEST_PROJECT_ID);
    const ms = Date.now() - t0;
    console.log(`  → returned ${loaded.length} elements in ${ms}ms\n`);

    const checks = verify(loaded);
    let passed = 0;
    for (const c of checks) {
      const icon = c.passed ? '✅' : '❌';
      console.log(`  ${icon} ${c.name}`);
      if (!c.passed || process.env.VERBOSE) {
        console.log(`      ${c.detail}`);
      }
      if (c.passed) passed++;
    }

    console.log('\n' + '━'.repeat(60));
    console.log(`Result: ${passed}/${checks.length} checks passed (${ms}ms roundtrip)`);
    console.log('Loaded elements (normalized):');
    for (const el of loaded) {
      console.log(`  - ${el.id} | type=${el.type} | layer=${el.layer ?? '-'} | name="${el.name}"`);
    }

    if (passed !== checks.length) exitCode = 1;
  } catch (err) {
    console.error('Verification failed:', err);
    exitCode = 1;
  } finally {
    console.log('\n  → cleanup ...');
    try {
      await cleanup();
    } catch (err) {
      console.error('Cleanup failed (manual cleanup may be needed):', (err as Error).message);
    }
    await getNeo4jDriver().close();
  }
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
