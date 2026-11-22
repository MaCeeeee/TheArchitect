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
  vision:  ['goto:model'],
  model:   ['open:model-classic'],
  explore: ['open:matrix'],
  plan:    ['open:analyze'],
  govern:  ['open:approvals'],
  track:   ['open:audit'],
};

export function getStationActions(
  station: StationKey,
  phases: PhaseInfo[],
  ctx: CommandContext,
  lead: string[] = [],
): Command[] {
  const registry = buildCommandRegistry(ctx);
  const phase = STATIONS.find((s) => s.key === station)!.phase;
  const nextAction = phases.find((p) => p.phase === phase)?.nextAction ?? null;

  const out: Command[] = [];
  const pushFromRegistry = (id: string) => {
    const cmd = registry[id];
    if (!cmd) return;
    if (cmd.available && !cmd.available(ctx)) return;
    out.push(cmd);
  };

  // Lead commands (e.g. the guided "Make a group", UC-METH-002) come before the phase next step.
  for (const id of lead) pushFromRegistry(id);

  if (nextAction) {
    const route = resolveActionRoute(nextAction.route, ctx.projectId);
    out.push({ id: 'primary', group: 'Next', label: nextAction.label, target: route, run: (c) => c.navigate(route) });
  }

  for (const id of STATION_SECONDARY[station]) pushFromRegistry(id);

  // Dedup by the declared target (or the id for commands that do not navigate). Never by running
  // a command: a command may have an effect (UC-METH-002). Keep the first occurrence; cap at MAX_ACTIONS.
  const seen = new Set<string>();
  const deduped: Command[] = [];
  for (const cmd of out) {
    const key = cmd.target ?? cmd.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(cmd);
    if (deduped.length >= MAX_ACTIONS) break;
  }
  return deduped;
}
