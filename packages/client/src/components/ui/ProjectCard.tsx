import { FolderOpen, Trash2, ArrowRight } from 'lucide-react';
import { ProgressRing } from '../../design-system';

const PHASE_NAMES = ['', 'Build', 'Map', 'Govern', 'Simulate', 'Audit'] as const;

interface ProjectCardProps {
  project: {
    _id: string;
    name: string;
    description?: string;
    updatedAt?: string;
  };
  stats?: {
    elementCount: number;
    connectionCount: number;
    currentPhase: number;
    healthScore: number;
  };
  onClick: () => void;
  onDelete: () => void;
}

export default function ProjectCard({ project, stats, onClick, onDelete }: ProjectCardProps) {
  const phase = stats?.currentPhase ?? 1;
  const health = stats?.healthScore ?? 0;

  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 cursor-pointer hover:border-[var(--accent-default)] hover:shadow-[0_0_15px_rgba(0,255,65,0.15)] transition"
    >
      {/* Health Ring */}
      <ProgressRing value={health} size={48} strokeWidth={3} color="var(--accent-default)" />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white">{project.name}</h3>
        {project.description && (
          <p className="text-xs text-[var(--text-secondary)] truncate">{project.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[10px] text-[var(--status-purple)] font-medium">
            Phase {phase}: {PHASE_NAMES[phase] || 'Build'}
          </span>
          {stats && (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {stats.elementCount} elements · {stats.connectionCount} connections
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {project.updatedAt && (
          <span className="text-xs text-[var(--text-tertiary)]">
            {new Date(project.updatedAt).toLocaleDateString()}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition"
          title="Delete project"
        >
          <Trash2 size={14} />
        </button>
        <ArrowRight size={14} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent-default)] transition" />
      </div>
    </div>
  );
}
