/**
 * THE-767 — workspace integrity report and repair.
 *
 *   npx ts-node --transpile-only scripts/workspace-integrity.ts [--project <id>]                    # dry-run (default)
 *   npx ts-node --transpile-only scripts/workspace-integrity.ts --align [--project <id>]            # THE-769
 *   npx ts-node --transpile-only scripts/workspace-integrity.ts --delete-orphans [--project <id>]   # THE-771
 *
 * --align: normalises ObjectId workspace _ids to their hex string, then rewrites legacy element
 * workspaceIds (unambiguous matches only). Ambiguous matches are reported, never written.
 * Elements of deleted projects are only counted (THE-656).
 * Prod: dry-run is read-only; --align and --delete-orphans need the user's explicit approval.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import neo4j from 'neo4j-driver';
import {
  loadElementGroups, loadWorkspaceDocs, planWorkspaceIntegrity, normalizeWorkspaceIds, applyAlign, deleteOrphans,
} from '../src/services/workspace-integrity.service';

const args = process.argv.slice(2);
const ALIGN = args.includes('--align');
const DELETE_ORPHANS = args.includes('--delete-orphans');
const projectArg = args.includes('--project') ? args[args.indexOf('--project') + 1] : null;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;
  const live = new Set((await db.collection('projects').find({}, { projection: { _id: 1 } }).toArray()).map((p) => String(p._id)));
  const wsColl = db.collection('workspaces');
  const driver = neo4j.driver(process.env.NEO4J_URI as string,
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD as string));
  const s = driver.session({ defaultAccessMode: ALIGN || DELETE_ORPHANS ? neo4j.session.WRITE : neo4j.session.READ });
  try {
    const docs = (await loadWorkspaceDocs(wsColl)).filter((w) => !projectArg || w.projectId === projectArg);
    const plan = planWorkspaceIntegrity(await loadElementGroups(s, { projectIds: projectArg ? [projectArg] : null }), docs, live);
    const sum = (xs: { n: number }[]) => xs.reduce((t, x) => t + x.n, 0);
    console.log(`${ALIGN || DELETE_ORPHANS ? 'APPLY' : 'DRY-RUN'} — ${process.env.NEO4J_URI}`);
    console.log(`ok: ${plan.ok} | dead-project elements (THE-656, untouched): ${plan.deadProject}`);
    for (const id of plan.normalize) console.log(`NORMALIZE workspace _id ObjectId(${id}) → "${id}"`);
    for (const a of plan.align) console.log(`ALIGN   ${a.projectId} ${a.from} → ${a.to}  n=${a.n} certified=${a.certified}`);
    for (const a of plan.ambiguous) console.log(`AMBIG   ${a.projectId} ${a.workspaceId}  n=${a.n} candidates=${a.candidates.join(',')}`);
    for (const o of plan.orphans) console.log(`ORPHAN  ${o.projectId} ${o.workspaceId}  n=${o.n} certified=${o.certified}`);
    console.log(`SUMMARY normalize ${plan.normalize.length} · align ${plan.align.length} group(s)/${sum(plan.align)} el · ambiguous ${plan.ambiguous.length} · orphans ${plan.orphans.length} group(s)/${sum(plan.orphans)} el`);
    if (ALIGN) {
      console.log(`normalized: ${await normalizeWorkspaceIds(wsColl, plan.normalize)} workspace(s)`);
      console.log(`aligned: ${await applyAlign(s, plan.align)} element(s)`);
    }
    if (DELETE_ORPHANS) console.log(`deleted orphans: ${await deleteOrphans(s, plan.orphans)} element(s)`);
  } finally {
    await s.close(); await driver.close(); await mongoose.disconnect();
  }
})().catch((e) => { console.error(e); process.exit(1); });
