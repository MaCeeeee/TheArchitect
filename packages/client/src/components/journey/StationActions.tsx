// The v2 command surface (THE-492, Slice 3a): the station's ≤4 executable actions,
// replacing the old navigation-only CTA. Renders nothing on an empty world (the
// JourneyShell "Generate with AI" CTA owns that state). No global hotkey (⌘K = 3b).
import { useNavigate } from 'react-router-dom';
import { useJourneyStore } from '../../stores/journeyStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { STATIONS, type StationKey } from './stations';
// Explicit .ts extension (THE-492): 'stationActions.ts' and this file
// ('StationActions.tsx') differ only in the leading letter's case, which
// collides under case-insensitive filesystems (default macOS APFS) — an
// extensionless import here is a coin flip between the two modules. The
// explicit extension bypasses guessing and resolves unambiguously.
import { getStationActions } from './stationActions.ts';
import type { CommandContext } from './commands';

interface Props {
  projectId: string;
  station: StationKey;
}

export default function StationActions({ projectId, station }: Props) {
  const navigate = useNavigate();
  const phases = useJourneyStore((s) => s.phases);
  const elements = useArchitectureStore((s) => s.elements);

  if (elements.length === 0) return null; // empty-world CTA owns this state

  const phase = STATIONS.find((s) => s.key === station)!.phase;
  const ctx: CommandContext = { projectId, navigate, phase };
  const actions = getStationActions(station, phases, ctx);
  if (actions.length === 0) return null;

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Station actions">
      {actions.map((cmd, i) => (
        <button
          key={cmd.id}
          onClick={() => cmd.run(ctx)}
          className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md transition ${
            i === 0
              ? 'border-[#00ff41]/40 bg-[#00ff41]/10 text-[#00ff41] hover:bg-[#00ff41]/20'
              : 'border-[var(--border-subtle)] bg-[var(--surface-base)]/80 text-[var(--text-secondary)] hover:text-white'
          }`}
        >
          {cmd.label}
        </button>
      ))}
    </div>
  );
}
