// The command vocabulary of the v2 Journey (THE-492, Slice 3a). Every command is
// SAFE — it only navigates (to a v2 station, a classic route, or a v2 sheet).
// Nothing toggles classic-only UI state (that no-ops/breaks from v2). Slice 3b's
// ⌘K palette will reuse Object.values(buildCommandRegistry(ctx)).
import type { JourneyPhase } from '../../stores/journeyStore';
import { isToolbarActionVisible } from '../../utils/phaseVisibility';

export interface CommandContext {
  projectId: string;
  navigate: (to: string) => void;
  phase: JourneyPhase;
}

export interface Command {
  id: string;
  group: string;
  label: string;
  keywords?: string[]; // reserved for 3b palette fuzzy search
  run: (ctx: CommandContext) => void;
  available?: (ctx: CommandContext) => boolean;
}

/** Sentinel nextAction routes (__envision__, __connection_mode__, …) have no v2
 *  home yet → resolve to the classic project view, the safe escape hatch. */
export function resolveActionRoute(route: string, projectId: string): string {
  return route.startsWith('__') ? `/project/${projectId}` : route;
}

/** Build the keyed registry of safe commands, closed over the current context. */
export function buildCommandRegistry(ctx: CommandContext): Record<string, Command> {
  const { projectId } = ctx;
  const nav = (route: string): Command['run'] => (c) => c.navigate(route);

  const list: Command[] = [
    // Station navigation
    { id: 'goto:vision',  group: 'Go to', label: 'Go to Vision',  run: nav(`/v2/project/${projectId}/vision`) },
    { id: 'goto:model',   group: 'Go to', label: 'Go to Model',   run: nav(`/v2/project/${projectId}/model`) },
    { id: 'goto:explore', group: 'Go to', label: 'Go to Explore', run: nav(`/v2/project/${projectId}/explore`) },
    { id: 'goto:plan',    group: 'Go to', label: 'Go to Plan',    run: nav(`/v2/project/${projectId}/plan`) },
    { id: 'goto:govern',  group: 'Go to', label: 'Go to Govern',  run: nav(`/v2/project/${projectId}/govern`) },
    { id: 'goto:track',   group: 'Go to', label: 'Go to Track',   run: nav(`/v2/project/${projectId}/track`) },
    // Classic tools / v2 sheets (deep-links)
    { id: 'open:model-classic', group: 'Model',      label: 'Open in classic editor', run: nav(`/project/${projectId}`) },
    { id: 'open:matrix',        group: 'Compliance', label: 'Coverage matrix',        run: nav(`/project/${projectId}/compliance/matrix`) },
    { id: 'open:approvals',     group: 'Compliance', label: 'Policy approvals',       run: nav(`/project/${projectId}/compliance/approvals`) },
    { id: 'open:audit',         group: 'Compliance', label: 'Audit checklist',        run: nav(`/project/${projectId}/compliance/audit`) },
    {
      id: 'open:analyze', group: 'Analyze', label: 'Open Analyze',
      run: nav(`/project/${projectId}/analyze`),
      available: (c) => isToolbarActionVisible('xray', c.phase, false), // xray/scenario gate = phase ≥ 4
    },
  ];

  return Object.fromEntries(list.map((c) => [c.id, c]));
}
