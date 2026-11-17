/**
 * THE-767 — workspace integrity: classifies Neo4j element groups (projectId, workspaceId) against
 * Mongo workspaces and plans repairs.
 *
 * Legacy background: before 2ce216e (03.06.2026) the server stored a BSON ObjectId as workspace _id
 * while elements kept the client id `ws-<ms>-<rand>`. The schema declares _id as String, so such
 * workspaces cannot be found by id at all. The Mongo document does not store the client id; the only
 * link is time: createdAt within WINDOW_MS of <ms>. The heuristic is used for planning only.
 */
export const WINDOW_MS = 10_000;
const CLIENT_ID = /^ws-(\d{13})-/;
const HEX_ID = /^[0-9a-f]{24}$/;

export interface ElementGroup { projectId: string; workspaceId: string; n: number; certified: number }
/** `_id` as hex string; `objectIdStored` = the document's _id is a BSON ObjectId (legacy). */
export interface WorkspaceDoc { _id: string; projectId: string; createdAt?: Date | null; objectIdStored: boolean }
export interface AlignStep { projectId: string; from: string; to: string; n: number; certified: number }
export interface Ambiguous { projectId: string; workspaceId: string; n: number; candidates: string[] }
export interface Orphan { projectId: string; workspaceId: string; n: number; certified: number }
export interface IntegrityPlan {
  ok: number; normalize: string[]; align: AlignStep[]; ambiguous: Ambiguous[]; orphans: Orphan[]; deadProject: number;
}

export function planWorkspaceIntegrity(groups: ElementGroup[], workspaces: WorkspaceDoc[], liveProjects: Set<string>): IntegrityPlan {
  const byProject = new Map<string, WorkspaceDoc[]>();
  for (const w of workspaces) byProject.set(w.projectId, [...(byProject.get(w.projectId) ?? []), w]);

  const plan: IntegrityPlan = {
    ok: 0,
    normalize: workspaces.filter((w) => w.objectIdStored && liveProjects.has(w.projectId)).map((w) => w._id),
    align: [], ambiguous: [], orphans: [], deadProject: 0,
  };

  for (const grp of groups) {
    if (!liveProjects.has(grp.projectId)) { plan.deadProject += grp.n; continue; }
    const own = byProject.get(grp.projectId) ?? [];
    if (own.some((w) => w._id === grp.workspaceId)) { plan.ok += grp.n; continue; }

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
