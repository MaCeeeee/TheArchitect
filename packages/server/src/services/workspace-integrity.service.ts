/**
 * THE-767 — workspace integrity: classifies Neo4j element groups (projectId, workspaceId) against
 * Mongo workspaces and plans repairs.
 *
 * Legacy background: before 2ce216e (03.06.2026) the server stored a BSON ObjectId as workspace _id
 * while elements kept the client id `ws-<ms>-<rand>`. The schema declares _id as String, so such
 * workspaces cannot be found by id at all. The Mongo document does not store the client id; the only
 * link is time: createdAt within WINDOW_MS of <ms>. The heuristic is used for planning only.
 */
import { isDeepStrictEqual } from 'util';
import type { Session } from 'neo4j-driver';
import { Types } from 'mongoose';
import type { Collection, Document } from 'mongodb';

export const WINDOW_MS = 10_000;
const CLIENT_ID = /^ws-(\d{13})-/;
const HEX_ID = /^[0-9a-f]{24}$/;

export interface ElementGroup { projectId: string; workspaceId: string; n: number; certified: number }
/** `_id` as hex string; `objectIdStored` = the document's _id is a BSON ObjectId (legacy). */
export interface WorkspaceDoc { _id: string; projectId: string; createdAt?: Date | null; objectIdStored: boolean }
export interface AlignStep { projectId: string; from: string; to: string; n: number; certified: number }
export interface Ambiguous { projectId: string; workspaceId: string; n: number; candidates: string[] }
export interface Orphan { projectId: string; workspaceId: string; n: number; certified: number }
/** workspaceId is a workspace of ANOTHER project: reported only, never deleted or aligned. */
export interface CrossProject { projectId: string; workspaceId: string; n: number; certified: number; workspaceProjectId: string }
export interface IntegrityPlan {
  ok: number; normalize: string[]; align: AlignStep[]; ambiguous: Ambiguous[]; orphans: Orphan[];
  crossProject: CrossProject[]; deadProject: number;
}

export interface IntegrityArgs { align: boolean; deleteOrphans: boolean; projectId: string | null }

/** Strict CLI parsing: a missing --project value or an unknown flag throws — never widen the scope silently. */
export function parseIntegrityArgs(argv: string[]): IntegrityArgs {
  const out: IntegrityArgs = { align: false, deleteOrphans: false, projectId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--align') out.align = true;
    else if (a === '--delete-orphans') out.deleteOrphans = true;
    else if (a === '--project') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error('--project needs a project id');
      out.projectId = v; i += 1;
    } else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

export function planWorkspaceIntegrity(groups: ElementGroup[], workspaces: WorkspaceDoc[], liveProjects: Set<string>): IntegrityPlan {
  const byProject = new Map<string, WorkspaceDoc[]>();
  for (const w of workspaces) byProject.set(w.projectId, [...(byProject.get(w.projectId) ?? []), w]);

  const plan: IntegrityPlan = {
    ok: 0,
    normalize: workspaces.filter((w) => w.objectIdStored && liveProjects.has(w.projectId)).map((w) => w._id),
    align: [], ambiguous: [], orphans: [], crossProject: [], deadProject: 0,
  };

  for (const grp of groups) {
    if (!liveProjects.has(grp.projectId)) { plan.deadProject += grp.n; continue; }
    const own = byProject.get(grp.projectId) ?? [];
    if (own.some((w) => w._id === grp.workspaceId)) { plan.ok += grp.n; continue; }

    const foreign = workspaces.find((w) => w._id === grp.workspaceId && w.projectId !== grp.projectId);
    if (foreign) {
      plan.crossProject.push({ projectId: grp.projectId, workspaceId: grp.workspaceId, n: grp.n, certified: grp.certified, workspaceProjectId: foreign.projectId });
      continue;
    }

    const m = CLIENT_ID.exec(grp.workspaceId);
    const candidates = m
      ? own.filter((w) => HEX_ID.test(w._id) && w.createdAt && Math.abs(w.createdAt.getTime() - Number(m[1])) < WINDOW_MS)
      : [];
    if (candidates.length === 1) {
      plan.align.push({ projectId: grp.projectId, from: grp.workspaceId, to: candidates[0]._id, n: grp.n, certified: grp.certified });
    } else if (candidates.length > 1) {
      plan.ambiguous.push({ projectId: grp.projectId, workspaceId: grp.workspaceId, n: grp.n, candidates: candidates.map((w) => w._id).sort() });
    } else {
      plan.orphans.push({ projectId: grp.projectId, workspaceId: grp.workspaceId, n: grp.n, certified: grp.certified });
    }
  }
  return plan;
}

const num = (v: unknown): number =>
  typeof v === 'number' ? v : (v as { toNumber?: () => number } | null)?.toNumber?.() ?? 0;

/** Workspaces as stored, with the BSON type of their _id. Raw collection: Mongoose would cast _id to String. */
export async function loadWorkspaceDocs(coll: Collection<Document>): Promise<WorkspaceDoc[]> {
  const docs = await coll.find({}, { projection: { _id: 1, projectId: 1, createdAt: 1 } }).toArray();
  return docs.map((w) => ({
    _id: String(w._id), projectId: String(w.projectId), createdAt: (w.createdAt as Date | undefined) ?? null,
    objectIdStored: w._id instanceof Types.ObjectId,
  }));
}

/** Element groups with a workspaceId. Without projectIds, tmp-* projects (test data) are excluded. */
export async function loadElementGroups(s: Session, { projectIds = null }: { projectIds?: string[] | null } = {}): Promise<ElementGroup[]> {
  const res = await s.run(
    `MATCH (e:ArchitectureElement)
     WHERE e.workspaceId IS NOT NULL AND e.workspaceId <> ''
       AND (($projectIds IS NULL AND NOT e.projectId STARTS WITH 'tmp-') OR e.projectId IN $projectIds)
     RETURN e.projectId AS projectId, e.workspaceId AS workspaceId, count(e) AS n,
            sum(CASE WHEN e.certifiedBy IS NOT NULL THEN 1 ELSE 0 END) AS certified`,
    { projectIds },
  );
  return res.records.map((r) => ({
    projectId: String(r.get('projectId')), workspaceId: String(r.get('workspaceId')),
    n: num(r.get('n')), certified: num(r.get('certified')),
  }));
}

const sameIgnoring = (a: Document, b: Document): boolean => {
  const strip = (d: Document) => { const { _id, updatedAt, ...rest } = d; return rest; };
  return isDeepStrictEqual(strip(a), strip(b));
};

/**
 * Rewrites each ObjectId-stored workspace as the same document with _id = its hex string.
 * Insert first, then delete the old one. If a string-_id doc already exists it is compared with the
 * legacy doc (ignoring _id and updatedAt): equal → leftover of an interrupted run, legacy is deleted;
 * different → nothing is touched and the id is reported as conflict.
 */
export async function normalizeWorkspaceIds(coll: Collection<Document>, hexIds: string[]): Promise<{ normalized: number; conflicts: string[] }> {
  let normalized = 0;
  const conflicts: string[] = [];
  for (const id of hexIds) {
    const legacy = await coll.findOne({ _id: new Types.ObjectId(id) });
    if (!legacy) continue;
    const existing = await coll.findOne({ _id: id as unknown as Types.ObjectId });
    if (existing) {
      if (!sameIgnoring(legacy, existing)) { conflicts.push(id); continue; }
    } else {
      await coll.insertOne({ ...legacy, _id: id as unknown as Types.ObjectId });
    }
    await coll.deleteOne({ _id: new Types.ObjectId(id) });
    normalized += 1;
  }
  return { normalized, conflicts };
}

/** Rewrites element workspaceId from → to, one transaction per step; the old id stays as workspaceIdAlignedFrom. */
export async function applyAlign(s: Session, steps: AlignStep[]): Promise<number> {
  let moved = 0;
  for (const step of steps) {
    const res = await s.executeWrite((tx) => tx.run(
      `MATCH (e:ArchitectureElement {projectId: $projectId, workspaceId: $from})
       SET e.workspaceId = $to, e.workspaceIdAlignedFrom = $from
       RETURN count(e) AS n`,
      step,
    ));
    moved += num(res.records[0]?.get('n'));
  }
  return moved;
}

/**
 * DETACH DELETEs uncertified orphan groups. Groups with certified elements are skipped (certified
 * content is only removed via the notary); their workspace ids are returned.
 */
export async function deleteOrphans(s: Session, orphans: Orphan[]): Promise<{ removed: number; skippedCertified: string[] }> {
  let removed = 0;
  const skippedCertified: string[] = [];
  for (const o of orphans) {
    if (o.certified > 0) { skippedCertified.push(o.workspaceId); continue; }
    const res = await s.executeWrite((tx) => tx.run(
      `MATCH (e:ArchitectureElement {projectId: $projectId, workspaceId: $workspaceId})
       WHERE e.certifiedBy IS NULL
       WITH collect(e) AS els FOREACH (x IN els | DETACH DELETE x) RETURN size(els) AS n`,
      { projectId: o.projectId, workspaceId: o.workspaceId },
    ));
    removed += num(res.records[0]?.get('n'));
  }
  return { removed, skippedCertified };
}
