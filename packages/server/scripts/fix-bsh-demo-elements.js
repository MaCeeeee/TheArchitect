/**
 * UC-ICM-003 T0 Hotfix — fix layer + positioning der 5 BSH-Demo-Elements
 *
 * Bug im seed-bsh-demo-uc-icm-003.js:
 *  - layer 'data' → korrekt: 'information' (intern), UI-Label = "Data"
 *  - posY-Skala: 16,12,8,4,0,-4,-8,-12 (in togaf.constants.ts ARCHITECTURE_LAYERS)
 *    statt 80,0,-80 (random Werte)
 *
 * Run:
 *   docker cp fix-bsh-demo-elements.js thearchitect-app:/app/fix.js
 *   docker exec -w /app thearchitect-app node /app/fix.js
 */
const neo4j = require('neo4j-driver');

const PROJECT_ID = '6a115592d31e8700abb535b9';

// Korrekte Layer-Y aus ARCHITECTURE_LAYERS:
//   motivation=16, strategy=12, business=8, information=4 (=Data),
//   application=0, technology=-4, physical=-8, implementation_migration=-12
const FIXES = [
  { id: 'cap-lieferantenmanagement', layer: 'business',     togafDomain: 'business',     posX: -8, posY: 8, posZ: 0 },
  { id: 'cap-datenverarbeitung-b2c', layer: 'business',     togafDomain: 'business',     posX:  8, posY: 8, posZ: 0 },
  { id: 'data-personalakte',         layer: 'information',  togafDomain: 'data',         posX:  0, posY: 4, posZ: 0 },
  { id: 'app-sap-erp',               layer: 'application',  togafDomain: 'application',  posX: -4, posY: 0, posZ: 0 },
  { id: 'app-hr-plattform',          layer: 'application',  togafDomain: 'application',  posX:  4, posY: 0, posZ: 0 },
];

async function main() {
  console.log(`▶ UC-ICM-003 T0 Hotfix — fix elements layer + posY`);
  console.log(`▶ Project: ${PROJECT_ID}\n`);

  const drv = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  );
  const sess = drv.session();

  try {
    // Show current state
    const before = await sess.run(
      'MATCH (e:ArchitectureElement {projectId: $projectId}) RETURN e.id, e.layer, e.posY ORDER BY e.id',
      { projectId: PROJECT_ID },
    );
    console.log('Before:');
    for (const rec of before.records) {
      console.log(`  ${rec.get('e.id').padEnd(32)} layer=${(rec.get('e.layer') || '-').padEnd(14)} posY=${rec.get('e.posY')}`);
    }

    // Apply fixes
    console.log('\nApplying fixes...');
    for (const f of FIXES) {
      const res = await sess.run(
        `MATCH (e:ArchitectureElement {projectId: $projectId, id: $id})
         SET e.layer = $layer, e.togafDomain = $togafDomain,
             e.posX = $posX, e.posY = $posY, e.posZ = $posZ
         RETURN e.id`,
        { projectId: PROJECT_ID, ...f },
      );
      const ok = res.records.length > 0;
      console.log(`  ${ok ? '✅' : '❌'} ${f.id.padEnd(32)} layer=${f.layer.padEnd(14)} posY=${f.posY}`);
    }

    // Show after-state
    console.log('\nAfter:');
    const after = await sess.run(
      'MATCH (e:ArchitectureElement {projectId: $projectId}) RETURN e.id, e.layer, e.togafDomain, e.posX, e.posY, e.posZ ORDER BY e.id',
      { projectId: PROJECT_ID },
    );
    for (const rec of after.records) {
      const o = rec.toObject();
      console.log(`  ${o['e.id'].padEnd(32)} layer=${o['e.layer'].padEnd(14)} domain=${o['e.togafDomain'].padEnd(14)} pos=(${o['e.posX']}, ${o['e.posY']}, ${o['e.posZ']})`);
    }
  } finally {
    await sess.close();
    await drv.close();
  }
  console.log('\n✅ Hotfix complete. Refresh the browser to see the 5 elements on their layers.');
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
