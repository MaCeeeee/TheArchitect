import { useEffect } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useActivityViewStore } from '../../stores/activityViewStore';
import { useArchitectureStore } from '../../stores/architectureStore';

export default function ActivityHUD() {
  const stack = useActivityViewStore((s) => s.stack);
  const back = useActivityViewStore((s) => s.back);
  const isLoading = useActivityViewStore((s) => s.isLoading);
  const error = useActivityViewStore((s) => s.error);
  const projectName = useArchitectureStore((s) => s.projectName);
  const current = stack.length > 0 ? stack[stack.length - 1] : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [back]);

  if (!current) return null;

  const activityCount = current.activities.length;
  const flowCount = current.flows.length;

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

      {!isLoading && !error && activityCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="text-[14px] text-[var(--text-tertiary)]">
            No activities defined for this process yet.
          </div>
        </div>
      )}
    </>
  );
}
