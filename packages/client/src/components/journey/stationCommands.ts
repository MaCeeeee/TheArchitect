// Curated per-station action set (THE-492, Slice 3a). Folds the station-phase's
// live nextAction (primary) with a small curated set of registry commands, capped
// at ≤4 (ADR-0005). Station-scoped: actions are for the station you are ON.
import type { PhaseInfo } from '../../stores/journeyStore';
import { STATIONS, type StationKey } from './stations';
import { buildCommandRegistry, resolveActionRoute, type Command, type CommandContext } from './commands';

const MAX_ACTIONS = 4;

// Curated secondary command ids per station (primary nextAction is prepended).
// Starting point — tunable in browser review (see plan).
const STATION_SECONDARY: Record<StationKey, string[]> = {
  vision:  [],
  model:   ['open:model-classic'],
  explore: ['open:matrix'],
  plan:    ['open:analyze'],
  govern:  ['open:approvals'],
  track:   ['open:audit'],
};

/** A stable "route" for dedup: the target a command navigates to. Derived by
 *  running the command against a capturing navigate. */
function routeOf(cmd: Command, ctx: CommandContext): string {
  let captured = '';
  cmd.run({ ...ctx, navigate: (to) => (captured = to) });
  return captured;
}

export function getStationActions(
  station: StationKey,
  phases: PhaseInfo[],
  ctx: CommandContext,
): Command[] {
  const registry = buildCommandRegistry(ctx);
  const phase = STATIONS.find((s) => s.key === station)!.phase;
  const nextAction = phases.find((p) => p.phase === phase)?.nextAction ?? null;

  const out: Command[] = [];

  if (nextAction) {
    const route = resolveActionRoute(nextAction.route, ctx.projectId);
    out.push({ id: 'primary', group: 'Next', label: nextAction.label, run: (c) => c.navigate(route) });
  }

  for (const id of STATION_SECONDARY[station]) {
    const cmd = registry[id];
    if (!cmd) continue;
    if (cmd.available && !cmd.available(ctx)) continue;
    out.push(cmd);
  }

  // Dedup by resolved route, keeping first occurrence; cap at MAX_ACTIONS.
  const seen = new Set<string>();
  const deduped: Command[] = [];
  for (const cmd of out) {
    const route = routeOf(cmd, ctx);
    if (seen.has(route)) continue;
    seen.add(route);
    deduped.push(cmd);
    if (deduped.length >= MAX_ACTIONS) break;
  }
  return deduped;
}
