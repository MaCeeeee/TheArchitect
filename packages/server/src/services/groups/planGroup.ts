/**
 * UC-METH-002 (REQ .1) — plans a group: which of the chosen elements become members, which are
 * skipped and why, and where the group element goes. Pure; the route reads the rows, the writer
 * writes the plan.
 *
 * A member is valid when it is not itself a group and ArchiMate allows a composition from the group
 * type to its type (getValidRelationships — the same rule the connection picker uses).
 * Position: mean x and z of the valid members (a mean over elements, not over groups — see the rule
 * "metrics over groups" in THE-798), y on the plane of the group's layer. If that point is closer
 * than GROUP_CLEARANCE to a member (members in a row on the same plane), it moves along z in steps
 * of GROUP_STEP until it is clear: the group is never drawn inside a member.
 * Legacy type names (business_process, …) are mapped through LEGACY_TYPE_MAP before the rule check.
 */
import { getValidRelationships, LAYER_Y, LEGACY_TYPE_MAP, type ElementType } from '@thearchitect/shared';
import { clampPosition3D } from '../../utils/position';

export const GROUP_TYPES = ['grouping', 'location'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];
export const MIN_GROUP_MEMBERS = 2;
export const MAX_GROUP_MEMBERS = 200;
/** Minimum distance between the group and any member (scene units). */
export const GROUP_CLEARANCE = 2;
const GROUP_STEP = 3;
const MAX_STEPS = 20;

const PLACEMENT: Record<GroupType, { layer: 'business' | 'technology'; togafDomain: 'business' | 'technology' }> = {
  grouping: { layer: 'business', togafDomain: 'business' },
  location: { layer: 'technology', togafDomain: 'technology' },
};

export interface MemberRow {
  id: string;
  name: string;
  type: string;
  posX: number | null;
  posY: number | null;
  posZ: number | null;
}

export type SkipReason = 'is_a_group' | 'composition_not_valid';

export interface SkippedMember {
  id: string;
  name: string;
  type: string;
  reason: SkipReason;
}

export interface GroupPlan {
  layer: 'business' | 'technology';
  togafDomain: 'business' | 'technology';
  position: { x: number; y: number; z: number };
  members: MemberRow[];
  skipped: SkippedMember[];
}

const isGroupType = (type: string): boolean => (GROUP_TYPES as readonly string[]).includes(type);
const mean = (values: number[]): number => (values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length);

export function planGroup(type: GroupType, rows: readonly MemberRow[]): GroupPlan {
  const members: MemberRow[] = [];
  const skipped: SkippedMember[] = [];
  for (const row of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    const skip = (reason: SkipReason) => skipped.push({ id: row.id, name: row.name, type: row.type, reason });
    const archimateType = (LEGACY_TYPE_MAP[row.type] ?? row.type) as ElementType;
    if (isGroupType(archimateType)) skip('is_a_group');
    else if (!getValidRelationships(type as ElementType, archimateType).includes('composition')) skip('composition_not_valid');
    else members.push(row);
  }
  const { layer, togafDomain } = PLACEMENT[type];
  const start = { x: mean(members.map((m) => m.posX ?? 0)), y: LAYER_Y[layer], z: mean(members.map((m) => m.posZ ?? 0)) };
  const tooClose = (p: { x: number; y: number; z: number }) =>
    members.some((m) => Math.hypot(p.x - (m.posX ?? 0), p.y - (m.posY ?? 0), p.z - (m.posZ ?? 0)) < GROUP_CLEARANCE);
  // Clamp first, then test: clamping must never pull the group back onto a member.
  // Candidates alternate +z / -z so a cluster at the scene boundary still gets a free spot.
  let position = clampPosition3D(start);
  for (let step = 1; step <= MAX_STEPS && tooClose(position); step++) {
    const up = clampPosition3D({ ...start, z: start.z + step * GROUP_STEP });
    const down = clampPosition3D({ ...start, z: start.z - step * GROUP_STEP });
    position = !tooClose(up) ? up : !tooClose(down) ? down : position;
    if (!tooClose(position)) break;
  }
  return { layer, togafDomain, position, members, skipped };
}
