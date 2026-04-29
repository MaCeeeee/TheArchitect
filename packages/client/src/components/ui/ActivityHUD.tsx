import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useActivityViewStore } from '../../stores/activityViewStore';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useActivityGenerator, type GeneratedActivity } from '../../hooks/useActivityGenerator';
import ActivitySuggestionModal from '../copilot/ActivitySuggestionModal';
import { architectureAPI } from '../../services/api';
import type { ArchitectureElement, Connection } from '@thearchitect/shared/src/types/architecture.types';

export default function ActivityHUD() {
  const stack = useActivityViewStore((s) => s.stack);
  const back = useActivityViewStore((s) => s.back);
  const enter = useActivityViewStore((s) => s.enter);
  const isLoading = useActivityViewStore((s) => s.isLoading);
  const error = useActivityViewStore((s) => s.error);
  const projectId = useArchitectureStore((s) => s.projectId);
  const projectName = useArchitectureStore((s) => s.projectName);
  const allElements = useArchitectureStore((s) => s.elements);
  const current = stack.length > 0 ? stack[stack.length - 1] : null;

  const generator = useActivityGenerator(projectId);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close AI modal first if open, otherwise pop drill-stack
        if (showModal) {
          setShowModal(false);
          generator.reset();
        } else {
          back();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [back, showModal, generator]);

  if (!current) return null;

  const activityCount = current.activities.length;
  const flowCount = current.flows.length;
  const processElement = allElements.find((e) => e.id === current.processId);

  const handleGenerateClick = async () => {
    setShowModal(true);
    await generator.generate(current.processId);
  };

  const handleApply = async (selected: GeneratedActivity[]) => {
    const result = await generator.apply(current.processId, selected, {
      x: processElement?.position3D.x ?? 0,
      z: processElement?.position3D.z ?? 0,
    });
    if (result.success) {
      // Re-fetch the drill-frame so the new activities + connections render in the pyramid
      setShowModal(false);
      generator.reset();
      await enter(current.processId);
      // Also refresh the global element + connection store so the new activities
      // show up in PropertyPanel when clicked. Without this, clicks on freshly
      // applied activities leave the panel empty (they live only in the drill-frame).
      if (projectId) {
        try {
          const [elemRes, connRes] = await Promise.all([
            architectureAPI.getElements(projectId),
            architectureAPI.getConnections(projectId),
          ]);
          const newElements = (elemRes.data?.data ?? elemRes.data) as ArchitectureElement[];
          const newConnections = (connRes.data?.data ?? connRes.data) as Connection[];
          useArchitectureStore.setState({ elements: newElements, connections: newConnections });
        } catch {
          // Non-fatal — the PropertyPanel has a drill-frame fallback.
        }
      }
    } else {
      // Keep modal open with error
      console.error('[ActivityHUD] apply failed', result.error);
    }
  };

  return (
    <>
      <div
        className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg px-5 py-2"
        style={{ background: 'rgba(10,10,10,0.95)', border: '1px solid #00ff41' }}
      >
        <span className="text-[11px] text-[var(--text-tertiary)]">{projectName || 'Project'}</span>
        {stack.map((frame, i) => (
          <span key={frame.processId + i} className="flex items-center gap-2">
            <ChevronRight size={10} className="text-[#334155]" />
            <span
              className={`text-[11px] ${
                i === stack.length - 1 ? 'font-bold text-[#00ff41]' : 'text-[var(--text-tertiary)]'
              }`}
            >
              {frame.processName}
            </span>
          </span>
        ))}
        <ChevronRight size={10} className="text-[#334155]" />
        <span className="text-[11px] font-bold text-[#00ff41]">Activities ({activityCount})</span>
      </div>

      <div className="absolute top-3 right-4 z-20">
        <button
          onClick={back}
          className="flex items-center gap-2 rounded-lg px-4 py-2 transition hover:bg-[#1a2a1a]"
          style={{ background: 'rgba(10,10,10,0.95)', border: '1px solid #00ff41' }}
        >
          <ArrowLeft size={16} className="text-[#00ff41]" />
          <span className="text-xs font-semibold text-[#00ff41]">Back</span>
          <kbd className="ml-2 text-[9px] font-mono text-[var(--text-tertiary)] bg-[#1a2a1a] px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </button>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-[11px] text-[var(--text-tertiary)] font-mono">
        {activityCount} {activityCount === 1 ? 'Activity' : 'Activities'} · {flowCount} Flow-
        {flowCount === 1 ? 'Connection' : 'Connections'}
      </div>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-[14px] text-[#00ff41] font-mono">Loading…</div>
        </div>
      )}

      {error && (
        <div
          className="absolute top-20 left-1/2 -translate-x-1/2 z-20 rounded-lg px-4 py-2"
          style={{ background: 'rgba(40,10,10,0.95)', border: '1px solid #ef4444' }}
        >
          <span className="text-[11px] text-red-300">{error}</span>
        </div>
      )}

      {/* Empty-state with AI-Generate CTA */}
      {!isLoading && !error && activityCount === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4 pointer-events-none">
          <div className="text-[14px] text-[var(--text-tertiary)]">
            No activities defined for this process yet.
          </div>
          <button
            type="button"
            onClick={handleGenerateClick}
            className="pointer-events-auto flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition hover:scale-[1.02]"
            style={{
              background: 'linear-gradient(135deg, #00ff41 0%, #33ff66 100%)',
              color: '#0a0a0a',
              boxShadow: '0 0 20px rgba(0,255,65,0.4)',
            }}
          >
            <Sparkles size={16} />
            Generate Activities with AI
          </button>
          <div className="text-[10px] text-[var(--text-tertiary)] text-center max-w-[280px]">
            Claude will analyze this process and propose 5–12 BPMN-sequential activities,<br />
            using your project's roles, applications, and compliance standards as context.
          </div>
        </div>
      )}

      {/* AI-Suggestion Modal */}
      <ActivitySuggestionModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          generator.reset();
        }}
        status={generator.state.status}
        activities={generator.state.activities}
        ragChunks={generator.state.ragChunks}
        processName={generator.state.processName ?? current.processName}
        durationMs={generator.state.durationMs}
        errorMessage={generator.state.error}
        onApply={handleApply}
      />
    </>
  );
}
