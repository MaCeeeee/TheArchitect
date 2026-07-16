// The v2 Journey shell (ADR-0005, THE-482): ONE persistent World. The Scene
// mounts here exactly once and never unmounts on station changes — the
// :station route param drives only camera framing and which Sheet is open.
// This component deliberately does NOT live under MainLayout: the shell owns
// its own (minimal) chrome. Classic UI stays untouched (additive v2).
import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import Scene from '../3d/Scene';
import PropertyPanel from '../ui/PropertyPanel';
import StationRail from './StationRail';
import StationSheet from './StationSheet';
import Sheet from './Sheet';
import { useProjectData } from '../../hooks/useProjectData';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { flyToStation } from '../3d/ViewModeCamera';
import { DEFAULT_STATION, isStationKey, type StationKey } from './stations';

export default function JourneyShell() {
  const { projectId, station: stationParam } = useParams<{ projectId: string; station: string }>();
  const { loading, error } = useProjectData(projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const projectName = useArchitectureStore((s) => s.projectName);
  const selectedElementId = useArchitectureStore((s) => s.selectedElementId);
  const isPropertyPanelOpen = useUIStore((s) => s.isPropertyPanelOpen);

  const station: StationKey = isStationKey(stationParam) ? stationParam : DEFAULT_STATION;

  // Station drives the camera framing — and nothing else about how the world
  // is drawn (Station ⟂ viewMode). Deliberately NOT depending on `elements`:
  // we reframe on arrival at a station, not on every model edit.
  useEffect(() => {
    if (!loading && elements.length > 0) {
      flyToStation(station, elements);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, loading]);

  // Canonical URL for junk station params (AC-5 deep-link hygiene).
  if (stationParam && !isStationKey(stationParam)) {
    return <Navigate to={`/v2/project/${projectId}`} replace />;
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-base)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[#00ff41]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-base)]">
        <span className="text-sm text-red-400">{error}</span>
      </div>
    );
  }

  // Exactly one Sheet at a time (structural — replaces the Slice-1
  // station!==model hack). Hoisted out of the JSX so the render below stays a
  // flat conditional instead of an inline IIFE.
  const sheetBody = !projectId
    ? null
    : station !== 'model'
      ? <StationSheet station={station} projectId={projectId} />
      : (isPropertyPanelOpen && selectedElementId ? <PropertyPanel fill /> : null);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--surface-base)]">
      {/* The World — mounted once, never keyed by station */}
      <Scene />

      {/* Minimal HUD chrome */}
      <header className="absolute left-4 top-3 z-40 flex items-center gap-2 text-xs">
        <span className="font-semibold text-white">{projectName ?? 'Project'}</span>
        <span className="rounded border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#a78bfa]">
          Journey beta
        </span>
        <Link to={`/project/${projectId}`} className="text-[var(--text-tertiary)] underline-offset-2 hover:text-white hover:underline">
          Back to classic UI
        </Link>
      </header>

      {/* Empty world: point at the classic on-ramp (Genesis arrives in Slice 5) */}
      {elements.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="pointer-events-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]/90 p-6 text-center backdrop-blur-md">
            <p className="mb-3 text-sm text-[var(--text-secondary)]">No architecture yet.</p>
            <Link
              to={`/project/${projectId}/blueprint`}
              className="rounded-lg bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#6d31d4]"
            >
              Generate with AI →
            </Link>
          </div>
        </div>
      )}

      {projectId && sheetBody ? <Sheet ariaLabel="Station panel">{sheetBody}</Sheet> : null}

      {/* The Rail + the one CTA */}
      {projectId && <StationRail projectId={projectId} station={station} />}
    </div>
  );
}
