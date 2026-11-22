// UC-METH-002 — a chosen element that the server did not make a member of the group.

/** is_a_group: the element is itself a group; composition_not_valid: ArchiMate does not allow it. */
export type GroupSkipReason = 'is_a_group' | 'composition_not_valid';

export interface SkippedMember {
  id: string;
  name: string;
  type: string;
  reason: GroupSkipReason;
}
