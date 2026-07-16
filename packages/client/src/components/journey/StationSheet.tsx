// A Sheet (CONTEXT.md): a DOM overlay that slides over the World — it never
// unmounts the scene and never changes route by itself. In Slice 1 this is
// the placeholder + escape hatch for stations that migrate in later slices.
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { STATIONS, type StationKey } from './stations';

interface Props {
  station: StationKey;
  projectId: string;
}

export default function StationSheet({ station, projectId }: Props) {
  const def = STATIONS.find((s) => s.key === station)!;
  return (
    <div className="flex flex-col p-6">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-lg font-bold text-white">{def.label}</h2>
        <span className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-[var(--text-tertiary)]">
          {def.admBadge}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)] mb-6">
        This station moves into the Journey shell in a later slice. Your work and data
        are untouched — everything is available in the classic UI today.
      </p>
      <Link
        to={def.classicRoute(projectId)}
        className="inline-flex items-center gap-2 self-start rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-2 text-sm font-medium text-[#a78bfa] transition hover:bg-[#7c3aed]/20"
      >
        Open in classic UI <ArrowRight size={14} />
      </Link>
    </div>
  );
}
