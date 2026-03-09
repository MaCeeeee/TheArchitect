import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Loader2, AlertCircle, X } from 'lucide-react';
import { projectAPI } from '../../services/api';

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

  useEffect(() => {
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
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await projectAPI.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      const project = data.data || data;
      navigate(`/project/${project._id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      setError('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-white mb-1">Welcome to TheArchitect</h1>
        <p className="text-sm text-[#94a3b8] mb-8">
          Enterprise Architecture Management Platform
        </p>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <ActionCard
            icon={<Plus size={24} />}
            title="New Project"
            description="Create a new architecture project"
            onClick={() => setShowCreate(true)}
            accent="#7c3aed"
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
        <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">
          Projects
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 size={18} className="animate-spin text-[#7c3aed]" />
            <span className="text-sm text-[#94a3b8]">Loading projects...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[#64748b]">No projects yet. Create your first project to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project._id}
                onClick={() => navigate(`/project/${project._id}`)}
                className="flex items-center gap-4 rounded-lg border border-[#334155] bg-[#1e293b] p-4 cursor-pointer hover:border-[#7c3aed] transition"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#7c3aed]/20">
                  <FolderOpen size={20} className="text-[#7c3aed]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white">{project.name}</h3>
                  {project.description && (
                    <p className="text-xs text-[#94a3b8] truncate">{project.description}</p>
                  )}
                </div>
                {project.updatedAt && (
                  <span className="text-xs text-[#64748b] shrink-0">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create project dialog */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
                <h2 className="text-sm font-semibold text-white">New Project</h2>
                <button onClick={() => setShowCreate(false)} className="text-[#94a3b8] hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Project Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder="My Architecture Project"
                    className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#475569] outline-none focus:border-[#7c3aed] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Description (optional)</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Brief description of the project"
                    rows={3}
                    className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#475569] outline-none focus:border-[#7c3aed] transition resize-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#334155] px-5 py-4">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-md px-4 py-2 text-xs text-[#94a3b8] hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="rounded-md bg-[#7c3aed] px-4 py-2 text-xs font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50 transition"
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
      className="flex flex-col items-center gap-3 rounded-lg border border-[#334155] bg-[#1e293b] p-6 text-center hover:border-[#7c3aed] transition"
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent}20`, color: accent }}
      >
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-[#94a3b8] mt-1">{description}</p>
      </div>
    </button>
  );
}
