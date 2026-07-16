// The v2 Journey shell (ADR-0005, THE-482): ONE persistent World. The Scene
// mounts here exactly once and never unmounts on station changes — the
// :station route param drives only camera framing and which Sheet is open.
// This component deliberately does NOT live under MainLayout: the shell owns
// its own (minimal) chrome. Classic UI stays untouched (additive v2).
import { useEffect } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import Scene from '../3d/Scene';
import PropertyPanel from '../ui/PropertyPanel';
import ConformanceHub from '../compliance/ConformanceHub';
import StationRail from './StationRail';
import StationSheet from './StationSheet';
import Sheet from './Sheet';
import CommandMenu from './CommandMenu';
import { useProjectData } from '../../hooks/useProjectData';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useComplianceStore } from '../../stores/complianceStore';
import { flyToStation } from '../3d/ViewModeCamera';
import { DEFAULT_STATION, isStationKey, STATIONS, type StationKey } from './stations';
import { decideTempo, markStationSeen } from './stationTempo';

export default function JourneyShell() {
  const { projectId, station: stationParam } = useParams<{ projectId: string; station: string }>();
  const { loading, error } = useProjectData(projectId);
  const elements = useArchitectureStore((s) => s.elements);
  const projectName = useArchitectureStore((s) => s.projectName);
  const selectedElementId = useArchitectureStore((s) => s.selectedElementId);
  const isPropertyPanelOpen = useUIStore((s) => s.isPropertyPanelOpen);
  const setShowComplianceGlow = useComplianceStore((s) => s.setShowComplianceGlow);
  const setCommandMenuOpen = useUIStore((s) => s.setCommandMenuOpen);

  const station: StationKey = isStationKey(stationParam) ? stationParam : DEFAULT_STATION;
  const conformanceGate = STATIONS.find((s) => s.key === station)?.conformanceGate;

  // Station drives the camera framing — and nothing else about how the world
  // is drawn (Station ⟂ viewMode). Deliberately NOT depending on `elements`:
  // we reframe on arrival at a station, not on every model edit.
  useEffect(() => {
    if (loading || elements.length === 0) return;
    // A docked Sheet covers part of the viewport — pass its width so the model
    // centres in the *visible* area, not behind the Sheet (THE-488). Read via
    // getState so neither selection nor a Sheet resize reframes (deps: station/
    // loading only; the latter matches THE-485 AC-2 "camera still on resize").
    const ui = useUIStore.getState();
    const { selectedElementId: selId } = useArchitectureStore.getState();
    // Mirrors `sheetBody` below: a Sheet shows on every station except Model
    // with nothing selected.
    const sheetShown = station !== 'model' || (ui.isPropertyPanelOpen && !!selId);
    // Two tempi (ADR-0005 #8): cinematic only on the FIRST arrival at this
    // station in this project; instant afterwards. Reduced motion always instant.
    const tempo = projectId ? decideTempo(projectId, station) : 'cinematic';
    flyToStation(station, elements, {
      sheetOffsetPx: sheetShown ? ui.sheetWidth : 0,
      sheetDock: ui.sheetDock,
      instant: tempo === 'instant',
    });
    // Mark on arrival (not after the flight) — an interrupted flight still counts.
    if (projectId) markStationSeen(projectId, station);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, loading]);

  // ⌘K / Ctrl+K opens the command menu (THE-493). v2-only — the listener lives
  // and dies with the shell. Ignores keystrokes while typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        setCommandMenuOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      // Leaving v2 with the menu open (e.g. browser back) must not re-show a
      // stale palette on the next mount — the flag is transient shell state.
      setCommandMenuOpen(false);
    };
  }, [setCommandMenuOpen]);

  // Conformance stations show the coverage heatmap as "results in the World" —
  // but only when the project actually has coverage data. An unassessed project
  // (0 mappings) would otherwise light up as a misleading wall of red "gaps", so
  // we load mappings first and stay neutral when there are none. showComplianceGlow
  // is a shared global toggle, so save its prior value and restore it on leave
  // (station change or unmount) — classic UI must not inherit the heatmap (AC-7).
  useEffect(() => {
    if (!conformanceGate || !projectId) return;
    const prev = useComplianceStore.getState().showComplianceGlow;
    let cancelled = false;
    const enableIfCovered = () => {
      if (!cancelled && useComplianceStore.getState().mappingsByElement.size > 0) {
        setShowComplianceGlow(true);
      }
    };
    const store = useComplianceStore.getState();
    if (store.mappingsByElement.size > 0) {
      enableIfCovered();
    } else {
      void store.loadAllMappings(projectId).then(enableIfCovered);
    }
    return () => {
      cancelled = true;
      setShowComplianceGlow(prev);
    };
  }, [conformanceGate, projectId, setShowComplianceGlow]);

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
    : station === 'model'
      ? (isPropertyPanelOpen && selectedElementId ? <PropertyPanel fill /> : null)
      : conformanceGate
        ? <ConformanceHub scopeVerb={conformanceGate} />
        : <StationSheet station={station} projectId={projectId} />;

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

      {/* Hint on the Model station when nothing is selected yet (v2 shows the
          PropertyPanel only on selection — unlike classic's always-open panel). */}
      {station === 'model' && !selectedElementId && elements.length > 0 && (
        <div className="pointer-events-none absolute right-4 top-3 z-30 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)]/80 px-3 py-1.5 text-xs text-[var(--text-tertiary)] backdrop-blur-md">
          Click an element for details
        </div>
      )}

      {projectId && sheetBody ? <Sheet ariaLabel="Station panel">{sheetBody}</Sheet> : null}

      {projectId && <CommandMenu projectId={projectId} />}

      {/* The Rail + the one CTA */}
      {projectId && <StationRail projectId={projectId} station={station} />}
    </div>
  );
}
