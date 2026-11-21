/**
 * UC-METH-002 (REQ .2/.4) — reads the ladder report: does the model check ask for groups now, and
 * what does the action field say after a group was made. Pure.
 */
import { LADDER_FACT_GROUPS_WITH_MEMBERS, LADDER_GROUPS_RUNG, type LadderReport, type SkippedMember } from '@thearchitect/shared';
import { LADDER_TEXT } from '../copilot/ladderText';
import { GROUP_MODE_TEXT } from './groupModeText';

export interface LadderGuidance {
  rung: number;
  /** Same text as the headline of the ladder panel. */
  headline: string;
  /** Same "Next step:" wording as the open row of the ladder panel. */
  next: string;
}

export interface GroupFeedback {
  lines: string[];
  offerAnother: boolean;
}

const forProject = (report: LadderReport | null, projectId: string | undefined): LadderReport | null =>
  report && projectId && report.projectId === projectId ? report : null;

const groupsRung = (report: LadderReport) => report.rungs.find((r) => r.index === LADDER_GROUPS_RUNG);

/** Groups with members as the ladder counts them; null when the step was not analysed. */
export function groupsWithMembers(report: LadderReport): number | null {
  return groupsRung(report)?.facts.find((f) => f.label === LADDER_FACT_GROUPS_WITH_MEMBERS)?.value ?? null;
}

export function ladderGuidance(report: LadderReport | null, projectId: string | undefined, elementCount: number): LadderGuidance | null {
  const own = forProject(report, projectId);
  if (!own || elementCount < 2) return null;
  const open = own.rungs.find((r) => r.status === 'open');
  if (!open || open.index !== LADDER_GROUPS_RUNG || groupsWithMembers(own) === null) return null;
  return {
    rung: LADDER_GROUPS_RUNG,
    headline: LADDER_TEXT.headline(own.highestRung ?? 0),
    next: LADDER_TEXT.nextStep(GROUP_MODE_TEXT.nextStepShort),
  };
}

export function groupFeedback(report: LadderReport | null, projectId: string, skipped: SkippedMember[]): GroupFeedback {
  const own = forProject(report, projectId);
  const skippedLines = skipped.length === 0 ? [] : [...skipped.map((s) => GROUP_MODE_TEXT.notAMember(s.name)), GROUP_MODE_TEXT.notAMemberReason];
  if (!own) return { lines: [GROUP_MODE_TEXT.groupMade, ...skippedLines], offerAnother: true };
  if (groupsRung(own)?.status === 'reached') return { lines: [GROUP_MODE_TEXT.completed, ...skippedLines], offerAnother: false };
  return { lines: [GROUP_MODE_TEXT.youHave(groupsWithMembers(own) ?? 0), ...skippedLines], offerAnother: true };
}
