/**
 * THE-767 — workspace integrity report and repair.
 *
 *   npx ts-node --transpile-only scripts/workspace-integrity.ts [--project <id>]                    # dry-run (default)
 *   npx ts-node --transpile-only scripts/workspace-integrity.ts --align [--project <id>]            # THE-769
 *   npx ts-node --transpile-only scripts/workspace-integrity.ts --delete-orphans [--project <id>]   # THE-771
 *
 * --align: normalises ObjectId workspace _ids to their hex string, then rewrites legacy element
 * workspaceIds (unambiguous matches only). Ambiguous matches are reported, never written.
 * Elements of deleted projects are only counted (THE-656). Conflicts, cross-project ids and orphan
 * groups with certified elements are reported, never written.
 * Prod: dry-run is read-only; --align and --delete-orphans need the user's explicit approval.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import neo4j from 'neo4j-driver';
import {
  loadElementGroups, loadWorkspaceDocs, planWorkspaceIntegrity, normalizeWorkspaceIds, applyAlign, deleteOrphans, parseIntegrityArgs,
} from '../src/services/workspace-integrity.service';

let parsed: ReturnType<typeof parseIntegrityArgs>;
try { parsed = parseIntegrityArgs(process.argv.slice(2)); } catch (e) { console.error(`ERROR: ${(e as Error).message}`); process.exit(2); }
const { align: ALIGN, deleteOrphans: DELETE_ORPHANS, projectId: projectArg } = parsed;
const MODE = ALIGN && DELETE_ORPHANS ? 'APPLY align+delete-orphans' : ALIGN ? 'APPLY align' : DELETE_ORPHANS ? 'APPLY delete-orphans' : 'DRY-RUN';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;
  const live = new Set((await db.collection('projects').find({}, { projection: { _id: 1 } }).toArray()).map((p) => String(p._id)));
  const wsColl = db.collection('workspaces');
  const driver = neo4j.driver(process.env.NEO4J_URI as string,
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD as string));
  const s = driver.session({ defaultAccessMode: ALIGN || DELETE_ORPHANS ? neo4j.session.WRITE : neo4j.session.READ });
  try {
    // All workspaces are loaded so cross-project ids are detected even with --project; normalisation is scoped below.
    const docs = await loadWorkspaceDocs(wsColl);
    const plan = planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: projectArg ? [projectArg] : null }), docs, live);
    if (projectArg) {
      const inScope = new Set(docs.filter((w) => w.projectId === projectArg).map((w) => w._id));
      plan.normalize = plan.normalize.filter((id) => inScope.has(id));
    }
    const sum = (xs: { n: number }[]) => xs.reduce((t, x) => t + x.n, 0);
    console.log(`${MODE} — ${process.env.NEO4J_URI}${projectArg ? ` — project ${projectArg}` : ''}`);
    if (ALIGN && DELETE_ORPHANS) console.log('NOTE orphan deletion uses the plan computed BEFORE alignment.');
    console.log(`ok: ${plan.ok} | dead-project elements (THE-656, untouched): ${plan.deadProject}`);
    for (const id of plan.normalize) console.log(`NORMALIZE workspace _id ObjectId(${id}) → "${id}"`);
    for (const a of plan.align) console.log(`ALIGN   ${a.projectId} ${a.from} → ${a.to}  n=${a.n} certified=${a.certified}`);
    for (const a of plan.ambiguous) console.log(`AMBIG   ${a.projectId} ${a.workspaceId}  n=${a.n} candidates=${a.candidates.join(',')}`);
    for (const o of plan.orphans) console.log(`ORPHAN  ${o.projectId} ${o.workspaceId}  n=${o.n} certified=${o.certified}`);
    for (const c of plan.crossProject) console.log(`CROSS   ${c.projectId} ${c.workspaceId}  n=${c.n} certified=${c.certified} workspace belongs to project ${c.workspaceProjectId} (report only)`);
    for (const o of plan.orphans.filter((x) => x.certified > 0)) console.log(`SKIPPED-CERTIFIED ${o.projectId} ${o.workspaceId}  certified=${o.certified} (will not be deleted)`);
    console.log(`SUMMARY normalize ${plan.normalize.length} · align ${plan.align.length} group(s)/${sum(plan.align)} el · ambiguous ${plan.ambiguous.length} · orphans ${plan.orphans.length} group(s)/${sum(plan.orphans)} el · cross-project ${plan.crossProject.length} group(s)/${sum(plan.crossProject)} el`);
    if (ALIGN) {
      const nr = await normalizeWorkspaceIds(wsColl, plan.normalize);
      console.log(`normalized: ${nr.normalized} workspace(s)`);
      for (const c of nr.conflicts) console.log(`CONFLICT workspace ${c}: string-_id doc differs from legacy ObjectId doc — nothing changed`);
      console.log(`aligned: ${await applyAlign(s, plan.align)} element(s)`);
    }
    if (DELETE_ORPHANS) {
      const r = await deleteOrphans(s, plan.orphans);
      console.log(`deleted orphans: ${r.removed} element(s)`);
      for (const id of r.skippedCertified) console.log(`SKIPPED-CERTIFIED ${id} — not deleted`);
    }
  } finally {
    await s.close(); await driver.close(); await mongoose.disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
