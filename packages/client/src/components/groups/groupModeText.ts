/**
 * UC-METH-002 — every text of the group mode and the guided step, in ASD-STE100.
 * Checked with scripts/ste100-check.py (0 findings, 21.11.2026) and by groupModeText.test.ts.
 * "click" is not an approved verb: the texts use "select" and "push".
 */
export const GROUP_MODE_TEXT = {
  start: 'Make a group',
  nextStepShort: 'Make a minimum of two groups.',
  selectHint: 'Select the elements of the group.',
  selectedCount: (count: number) => (count === 1 ? '1 element selected.' : `${count} elements selected.`),
  selectOneMore: 'Select one more element.',
  makeTheGroup: (count: number) => `Make the group (${count})`,
  nameHint: 'Write a name for the group.',
  nameField: 'Name of the group',
  create: 'Make the group',
  cancel: 'Cancel',
  close: 'Close',
  youHave: (count: number) => (count === 1 ? 'You have 1 group. Make one more group.' : `You have ${count} groups. Make one more group.`),
  completed: 'You completed step 2.',
  /** Hint on the action field label that opens the ladder panel on this step (classic view). */
  showStep: 'Show this step in the model check.',
  groupMade: 'The software made the group.',
  notAMember: (name: string) => `${name} is not a member of the group.`,
  notAMemberReason: 'A Grouping element cannot have this type of element as a member.',
  didNotMake: 'The software did not make the group.',
  mustBeInModel: 'Each element must be in this model.',
  modelChanged: 'The model changed.',
  doAgain: 'Do the procedure again.',
};
