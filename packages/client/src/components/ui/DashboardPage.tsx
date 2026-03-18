import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, FolderOpen, Loader2, AlertCircle, X, Trash2 } from 'lucide-react';
import { SkeletonCard } from './Skeleton';
import { projectAPI } from '../../services/api';
import { useArchitectureStore } from '../../stores/architectureStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

interface Project {
  _id: string;
  name: string;
  description?: string;
  tags?: string[];
  updatedAt?: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New project dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Clear stale project data when returning to dashboard
    useArchitectureStore.getState().clearProject();
    useWorkspaceStore.getState().setWorkspaces([]);
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await projectAPI.list();
      setProjects(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
      toast.error('Failed to load projects');
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await projectAPI.delete(deleteTarget._id);
      toast.success('Project deleted');
      setDeleteTarget(null);
      loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
      toast.error('Failed to delete project');
      setError('Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await projectAPI.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      const project = data.data || data;
      toast.success('Project created');
      navigate(`/project/${project._id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      toast.error('Failed to create project');
      setError('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-white mb-1">Welcome to TheArchitect</h1>
        <p className="text-sm text-[#7a8a7a] mb-8">
          Enterprise Architecture Management Platform
        </p>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <ActionCard
            icon={<Plus size={24} />}
            title="New Project"
            description="Create a new architecture project"
            onClick={() => setShowCreate(true)}
            accent="#00ff41"
          />
          <ActionCard
            icon={<FolderOpen size={24} />}
            title="Open Project"
            description="Select a project below"
            onClick={() => {}}
            accent="#3b82f6"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 mb-4">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span className="text-xs text-red-300">{error}</span>
          </div>
        )}

        {/* Projects list */}
        <h2 className="text-sm font-semibold text-[#7a8a7a] uppercase tracking-wider mb-3">
          Projects
        </h2>

        {loading ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[#4a5a4a]">No projects yet. Create your first project to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project._id}
                onClick={() => navigate(`/project/${project._id}`)}
                className="group flex items-center gap-4 rounded-lg border border-[#1a2a1a] bg-[#111111] p-4 cursor-pointer hover:border-[#00ff41] hover:shadow-[0_0_15px_rgba(0,255,65,0.15)] transition"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#00ff41]/20">
                  <FolderOpen size={20} className="text-[#00ff41]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white">{project.name}</h3>
                  {project.description && (
                    <p className="text-xs text-[#7a8a7a] truncate">{project.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {project.updatedAt && (
                    <span className="text-xs text-[#4a5a4a]">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); }}
                    className="p-1.5 rounded text-[#4a5a4a] hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition"
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirmation dialog */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-xl border border-[#1a2a1a] bg-[#111111] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#1a2a1a] px-5 py-4">
                <h2 className="text-sm font-semibold text-white">Delete Project</h2>
                <button onClick={() => setDeleteTarget(null)} className="text-[#7a8a7a] hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5">
                <p className="text-sm text-[#7a8a7a]">
                  Are you sure you want to delete <span className="text-white font-medium">"{deleteTarget.name}"</span>?
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#1a2a1a] px-5 py-4">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-md px-4 py-2 text-xs text-[#7a8a7a] hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create project dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-xl border border-[#1a2a1a] bg-[#111111] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#1a2a1a] px-5 py-4">
                <h2 className="text-sm font-semibold text-white">New Project</h2>
                <button onClick={() => setShowCreate(false)} className="text-[#7a8a7a] hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#7a8a7a] mb-1.5">Project Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder="My Architecture Project"
                    className="w-full rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#3a4a3a] outline-none focus:border-[#00ff41] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#7a8a7a] mb-1.5">Description (optional)</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Brief description of the project"
                    rows={3}
                    className="w-full rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#3a4a3a] outline-none focus:border-[#00ff41] transition resize-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#1a2a1a] px-5 py-4">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-md px-4 py-2 text-xs text-[#7a8a7a] hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="rounded-md bg-[#00ff41] px-4 py-2 text-xs font-medium text-black hover:bg-[#00cc33] disabled:opacity-50 transition"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-3 rounded-lg border border-[#1a2a1a] bg-[#111111] p-6 text-center hover:border-[#00ff41] hover:shadow-[0_0_15px_rgba(0,255,65,0.15)] transition"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent}20`, color: accent }}
      >
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-[#7a8a7a] mt-1">{description}</p>
      </div>
    </button>
  );
}
