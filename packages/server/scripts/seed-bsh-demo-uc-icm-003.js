/**
 * UC-ICM-003 T0 — BSH Demo Project Seed
 *
 * Erzeugt das Setup für die BSH-Demo am 2026-06-14:
 *   1. Demo-User (demo-bsh@thearchitect.site, verified)
 *   2. BSH-Demo-Project (owner = Demo-User)
 *   3. 5 ArchiMate-Elements in Neo4j (Lieferantenmanagement, DV B2C, SAP ERP, HR, Personalakte)
 *   4. Re-Assigne die 16 Production-Regs von Test-projectId → neue projectId
 *   5. Re-Run Auto-Mapping → ~40 neue Mappings
 *   6. Cleanup alte Mappings unter Test-projectId
 *
 * Idempotenz: kann mehrfach gerunnt werden, findet existierenden User/Project
 *
 * DRY-RUN-MODUS: setze DRY_RUN=1 für read-only check
 *
 * Ausführung im Production-App-Container:
 *   docker cp seed-bsh-demo-uc-icm-003.js thearchitect-app:/app/seed-bsh-demo.js
 *   docker exec -w /app -e DRY_RUN=1 thearchitect-app node /app/seed-bsh-demo.js   # dry-run
 *   docker exec -w /app thearchitect-app node /app/seed-bsh-demo.js                  # echter run
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const neo4j = require('neo4j-driver');

const DRY_RUN = process.env.DRY_RUN === '1';
const DEMO_USER_EMAIL = 'demo-bsh@thearchitect.site';
const DEMO_USER_PASSWORD = process.env.DEMO_PW || 'BSH-Demo-2026!';
const DEMO_PROJECT_NAME = 'BSH Demo (UC-ICM-003)';
const TEST_PROJECT_ID_OLD = '507f1f77bcf86cd799439011'; // orphan test ObjectId from W1

const BSH_ELEMENTS = [
  {
    id: 'cap-lieferantenmanagement',
    name: 'Lieferantenmanagement',
    type: 'capability',
    layer: 'business',
    togafDomain: 'business',
    description: 'Strategische Steuerung der Tier-1- und Tier-2-Zulieferer inkl. Onboarding, Bewertung, Risikoanalyse und Audit.',
    posX: -200, posY: 80, posZ: 0,
  },
  {
    id: 'cap-datenverarbeitung-b2c',
    name: 'Datenverarbeitung B2C',
    type: 'capability',
    layer: 'business',
    togafDomain: 'business',
    description: 'Verarbeitung personenbezogener Daten von Endkunden im Rahmen des Hausgeräte-Vertriebs und After-Sales.',
    posX: 200, posY: 80, posZ: 0,
  },
  {
    id: 'app-sap-erp',
    name: 'ERP-System SAP',
    type: 'application',
    layer: 'application',
    togafDomain: 'application',
    description: 'Zentrales SAP S/4HANA für Finanzen, Material, Produktion, Vertrieb. ~3000 User.',
    posX: -100, posY: 0, posZ: 0,
  },
  {
    id: 'app-hr-plattform',
    name: 'HR-Plattform',
    type: 'application',
    layer: 'application',
    togafDomain: 'application',
    description: 'Workday HR mit Stammdaten, Gehaltsabrechnung, Performance-Reviews. Enthält Gesundheitsdaten + Sozialversicherung.',
    posX: 100, posY: 0, posZ: 0,
  },
  {
    id: 'data-personalakte',
    name: 'Mitarbeiter-Personalakte',
    type: 'data_object',
    layer: 'data',
    togafDomain: 'data',
    description: 'Digitale Personalakte mit Stamm-, Vertrags-, Gesundheits- und Performance-Daten.',
    posX: 0, posY: -80, posZ: 0,
  },
];

function log(emoji, msg) {
  console.log(`  ${emoji} ${msg}`);
}

async function main() {
  console.log(`▶ UC-ICM-003 T0 — BSH-Demo-Project Seed`);
  console.log(`▶ Container: ${require('os').hostname()}`);
  console.log(`▶ Mode: ${DRY_RUN ? 'DRY-RUN (read-only)' : 'WRITE'}`);
  console.log(`▶ Demo User: ${DEMO_USER_EMAIL}`);
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // ─── Step 1: Find or create Demo-User ──────────────────
  console.log('[1] User');
  const existingUser = await db.collection('users').findOne({ email: DEMO_USER_EMAIL });
  let userId;
  if (existingUser) {
    userId = existingUser._id;
    log('✓', `Demo-User exists: ${existingUser._id}`);
  } else if (DRY_RUN) {
    log('?', `Would create user ${DEMO_USER_EMAIL} (DRY-RUN, skipped)`);
    userId = new mongoose.Types.ObjectId();
  } else {
    const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);
    const userDoc = {
      email: DEMO_USER_EMAIL,
      passwordHash,
      name: 'BSH Demo User',
      bio: 'Demo-Account für UC-ICM-003 BSH-Touchpoint 2026-06-14',
      avatarUrl: '',
      role: 'enterprise_architect',
      permissions: [],
      emailVerified: true,
      mfaEnabled: false,
      oauthProviders: [],
      preferences: {
        theme: 'dark',
        language: 'de',
        timezone: 'Europe/Berlin',
        notifications: {
          emailOnApproval: false,
          emailOnMention: false,
          emailOnProjectUpdate: false,
          inAppOnApproval: true,
          inAppOnMention: true,
          inAppOnProjectUpdate: true,
        },
        accessibility: { fontSize: 'medium', reduceMotion: false, highContrast: false },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ins = await db.collection('users').insertOne(userDoc);
    userId = ins.insertedId;
    log('✅', `Created Demo-User: ${userId} (PW: ${DEMO_USER_PASSWORD})`);
  }

  // ─── Step 2: Find or create BSH-Demo-Project ───────────
  console.log('\n[2] Project');
  const existingProject = await db.collection('projects').findOne({
    name: DEMO_PROJECT_NAME,
    ownerId: userId,
  });
  let projectId;
  if (existingProject) {
    projectId = existingProject._id;
    log('✓', `BSH-Demo-Project exists: ${existingProject._id}`);
  } else if (DRY_RUN) {
    log('?', `Would create project "${DEMO_PROJECT_NAME}" (DRY-RUN, skipped)`);
    projectId = new mongoose.Types.ObjectId();
  } else {
    const projDoc = {
      name: DEMO_PROJECT_NAME,
      description: 'Industrial Compliance Mapping Demo für BSH-Touchpoint 2026-06-14. ' +
        'Enthält 5 BSH-relevante ArchiMate-Elements und 16 Regulations (NIS2, LkSG, DSGVO).',
      ownerId: userId,
      collaborators: [],
      togafPhase: 'A',
      stakeholders: [],
      settings: {},
      versions: [],
      tags: ['bsh-demo', 'uc-icm-003'],
      integrations: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ins = await db.collection('projects').insertOne(projDoc);
    projectId = ins.insertedId;
    log('✅', `Created BSH-Demo-Project: ${projectId}`);
  }

  // ─── Step 3: Seed Neo4j ArchiMate-Elements ─────────────
  console.log('\n[3] Neo4j ArchiMate-Elements');
  const drv = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
  );
  const sess = drv.session();
  try {
    const existing = await sess.run(
      'MATCH (e:ArchitectureElement {projectId: $projectId}) RETURN count(e) as c',
      { projectId: projectId.toString() },
    );
    const existingCount = existing.records[0].get('c').toNumber();
    if (existingCount > 0) {
      log('✓', `${existingCount} ArchiMate-Elements already exist for project`);
    } else if (DRY_RUN) {
      log('?', `Would seed ${BSH_ELEMENTS.length} elements (DRY-RUN, skipped)`);
    } else {
      for (const el of BSH_ELEMENTS) {
        await sess.run(
          `CREATE (e:ArchitectureElement {
             projectId: $projectId,
             id: $id, name: $name, type: $type, layer: $layer, togafDomain: $togafDomain,
             description: $description,
             posX: $posX, posY: $posY, posZ: $posZ,
             status: 'current', riskLevel: 'medium', maturityLevel: 3
           })`,
          { projectId: projectId.toString(), ...el },
        );
      }
      log('✅', `Seeded ${BSH_ELEMENTS.length} ArchiMate-Elements`);
    }
  } finally {
    await sess.close();
    await drv.close();
  }

  // ─── Step 4: Re-Assign Regulations from old → new projectId ─
  console.log('\n[4] Re-Assign Regulations');
  const oldId = new mongoose.Types.ObjectId(TEST_PROJECT_ID_OLD);
  const regsUnderOld = await db.collection('regulations').countDocuments({ projectId: oldId });
  const regsUnderNew = await db.collection('regulations').countDocuments({ projectId });
  log('•', `Regs under old projectId (${TEST_PROJECT_ID_OLD}): ${regsUnderOld}`);
  log('•', `Regs under new projectId (${projectId}): ${regsUnderNew}`);

  if (regsUnderOld > 0 && !DRY_RUN) {
    const upd = await db.collection('regulations').updateMany(
      { projectId: oldId },
      { $set: { projectId } },
    );
    log('✅', `Re-assigned ${upd.modifiedCount} regulations to new projectId`);
  } else if (regsUnderOld > 0) {
    log('?', `Would re-assign ${regsUnderOld} regs (DRY-RUN, skipped)`);
  }

  // ─── Step 5: Wipe old Mappings (those under TEST_PROJECT_ID_OLD) ─
  console.log('\n[5] Cleanup old Mappings');
  const oldMappings = await db.collection('compliancemappings').countDocuments({ projectId: oldId });
  if (oldMappings > 0 && !DRY_RUN) {
    const del = await db.collection('compliancemappings').deleteMany({ projectId: oldId });
    log('✅', `Deleted ${del.deletedCount} old mappings under test-projectId`);
  } else if (oldMappings > 0) {
    log('?', `Would delete ${oldMappings} old mappings (DRY-RUN, skipped)`);
  } else {
    log('✓', 'No old mappings to clean up');
  }

  // ─── Step 6: Re-Run Auto-Mapping ───────────────────────
  console.log('\n[6] Re-Run Auto-Mapping');
  if (DRY_RUN) {
    log('?', 'Would invoke mapRegulationsBatch (DRY-RUN, skipped)');
  } else {
    // Load via require from dist
    const { Regulation } = require('/app/packages/server/dist/models/Regulation');
    const { mapRegulationsBatch } = require('/app/packages/server/dist/services/complianceMapping.service');
    const { loadProjectCandidateElements } = require('/app/packages/server/dist/services/complianceElements.service');
    const { connectNeo4j } = require('/app/packages/server/dist/config/neo4j');

    // Init global Neo4j driver (required by loadProjectCandidateElements → runCypher)
    await connectNeo4j();

    const regulations = await Regulation.find({ projectId }).select('-embedding');
    log('•', `${regulations.length} regulations loaded`);
    const candidates = await loadProjectCandidateElements(projectId.toString());
    log('•', `${candidates.length} candidate elements loaded`);

    if (regulations.length === 0 || candidates.length === 0) {
      log('⚠', 'Missing regs or elements — skipping auto-mapping');
    } else {
      const t0 = Date.now();
      const result = await mapRegulationsBatch({
        regulations,
        candidateElements: candidates,
        projectId: projectId.toString(),
        concurrency: 5,
      });
      const ms = Date.now() - t0;
      log('✅', `mapped=${result.totalMapped}, errors=${result.errors.length}, ${ms}ms`);
    }
  }

  // ─── Final summary ─────────────────────────────────────
  console.log('\n' + '━'.repeat(72));
  console.log('Summary');
  console.log('━'.repeat(72));
  console.log(`  Demo-User email:    ${DEMO_USER_EMAIL}`);
  console.log(`  Demo-User PW:       ${DRY_RUN ? '(not set in dry-run)' : DEMO_USER_PASSWORD}`);
  console.log(`  Demo-User ID:       ${userId}`);
  console.log(`  Demo-Project ID:    ${projectId}`);
  console.log(`  Demo-Project name:  ${DEMO_PROJECT_NAME}`);

  if (!DRY_RUN) {
    const finalRegs = await db.collection('regulations').countDocuments({ projectId });
    const finalMappings = await db.collection('compliancemappings').countDocuments({ projectId });
    console.log(`  Final regs:         ${finalRegs}`);
    console.log(`  Final mappings:     ${finalMappings}`);
  }

  await mongoose.disconnect();
  console.log(`\n${DRY_RUN ? '✓ DRY-RUN COMPLETE — no writes performed' : '✅ SEED COMPLETE'}`);
  process.exit(0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
