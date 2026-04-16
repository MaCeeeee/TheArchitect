import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, RefreshCw, AlertCircle, X, Loader2, Boxes, Sparkles } from 'lucide-react';
import { SkeletonCard } from './Skeleton';
import { projectAPI, demoAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { usePortfolioData } from '../../hooks/usePortfolioData';
import ProjectCard from './ProjectCard';
import PortfolioKPIStrip from '../dashboard/PortfolioKPIStrip';
import RiskHeatmap from '../dashboard/RiskHeatmap';
import ComplianceOverview from '../dashboard/ComplianceOverview';

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { projects, stats, health, risk, cost, compliance, loading, enriching, error, refresh } = usePortfolioData();

  // New project dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Demo creation
  const [creatingDemo, setCreatingDemo] = useState<false | 'banking' | 'bsh'>(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ _id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await projectAPI.delete(deleteTarget._id);
      toast.success('Project deleted');
      setDeleteTarget(null);
      refresh();
    } catch {
      toast.error('Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const handleTryDemo = async (variant: 'banking' | 'bsh' = 'banking') => {
    setCreatingDemo(variant);
    try {
      const { data } = variant === 'bsh' ? await demoAPI.createBsh() : await demoAPI.create();
      if (data.existing) {
        toast.success('Opening existing demo project');
      } else {
        toast.success(`Demo created — ${data.elementsCreated} elements, ${data.connectionsCreated} connections`);
      }
      navigate(`/project/${data.projectId}`);
    } catch {
      toast.error('Failed to create demo project. Please try again.');
    } finally {
      setCreatingDemo(false);
    }
  };

  // Auto-demo trigger from login page
  useEffect(() => {
    if (sessionStorage.getItem('thearchitect-auto-demo') && !loading && projects.length === 0) {
      sessionStorage.removeItem('thearchitect-auto-demo');
      handleTryDemo('banking');
    }
  }, [loading, projects.length]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await projectAPI.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      const project = data.data || data;
      toast.success('Project created');
      navigate(`/project/${project._id}`);
    } catch {
      toast.error('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Portfolio Overview</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Enterprise Architecture Management'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading || enriching}
              className="flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-white hover:border-[var(--accent-default)] disabled:opacity-50 transition"
            >
              <RefreshCw size={14} className={enriching ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={() => handleTryDemo('banking')}
              disabled={!!creatingDemo}
              title="Load Banking & Insurance demo project"
              className="flex items-center gap-1.5 rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-2 text-xs font-medium text-[#a78bfa] hover:bg-[#7c3aed]/20 disabled:opacity-50 transition"
            >
              {creatingDemo === 'banking' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Banking Demo
            </button>
            <button
              onClick={() => handleTryDemo('bsh')}
              disabled={!!creatingDemo}
              title="Load BSH ESG Compliance Transformation demo"
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition"
            >
              {creatingDemo === 'bsh' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              ESG Demo
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-md bg-[var(--accent-default)] px-3 py-2 text-xs font-medium text-black hover:bg-[var(--accent-hover)] transition"
            >
              <Plus size={14} />
              New Project
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 mb-4">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span className="text-xs text-red-300">{error}</span>
          </div>
        )}

        {/* KPI Strip */}
        {!loading && (
          <PortfolioKPIStrip
            projects={projects}
            stats={stats}
            health={health}
            risk={risk}
            cost={cost}
            compliance={compliance}
            enriching={enriching}
          />
        )}

        {/* Projects list */}
        <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Projects
        </h2>

        {loading ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--accent-default)]/10 flex items-center justify-center mb-4">
              <Boxes size={28} className="text-[var(--accent-default)]" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Projects Yet</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-6">
              Create your first enterprise architecture project or explore a pre-built demo — Banking modernization or ESG Compliance Transformation.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-md bg-[var(--accent-default)] px-4 py-2.5 text-sm font-medium text-black hover:bg-[var(--accent-hover)] transition"
              >
                <Plus size={16} />
                New Project
              </button>
              <button
                onClick={() => handleTryDemo('banking')}
                disabled={!!creatingDemo}
                className="flex items-center gap-1.5 rounded-md border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-4 py-2.5 text-sm font-medium text-[#a78bfa] hover:bg-[#7c3aed]/20 disabled:opacity-50 transition"
              >
                {creatingDemo === 'banking' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {creatingDemo === 'banking' ? 'Creating Demo...' : 'Banking Demo'}
              </button>
              <button
                onClick={() => handleTryDemo('bsh')}
                disabled={!!creatingDemo}
                className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition"
              >
                {creatingDemo === 'bsh' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {creatingDemo === 'bsh' ? 'Creating Demo...' : 'ESG Compliance Demo'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <ProjectCard
                key={project._id}
                project={project}
                stats={stats[project._id] ?? undefined}
                healthData={health[project._id]}
                riskData={risk[project._id]}
                complianceData={compliance[project._id]}
                costData={cost[project._id]}
                onClick={() => navigate(`/project/${project._id}`)}
                onDelete={() => setDeleteTarget(project)}
              />
            ))}
          </div>
        )}

        {/* Risk Heatmap */}
        {!loading && projects.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 mt-8">
              Risk Heatmap
            </h2>
            <RiskHeatmap
              projects={projects}
              risk={risk}
              onProjectClick={(id) => navigate(`/project/${id}`)}
            />
          </>
        )}

        {/* Compliance Overview */}
        {!loading && projects.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 mt-8">
              Compliance Overview
            </h2>
            <ComplianceOverview compliance={compliance} />
          </>
        )}

        {/* Bottom spacing */}
        <div className="h-8" />

        {/* Delete confirmation dialog */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                <h2 className="text-sm font-semibold text-white">Delete Project</h2>
                <button onClick={() => setDeleteTarget(null)} className="text-[var(--text-secondary)] hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5">
                <p className="text-sm text-[var(--text-secondary)]">
                  Are you sure you want to delete <span className="text-white font-medium">"{deleteTarget.name}"</span>?
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] px-5 py-4">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-md px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-white transition"
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
            <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
                <h2 className="text-sm font-semibold text-white">New Project</h2>
                <button onClick={() => setShowCreate(false)} className="text-[var(--text-secondary)] hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Project Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder="My Architecture Project"
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#00ff41] transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Description (optional)</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Brief description of the project"
                    rows={3}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#00ff41] transition resize-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] px-5 py-4">
                <button
                  onClick={() => setShowCreate(false)}
                  className="rounded-md px-4 py-2 text-xs text-[var(--text-secondary)] hover:text-white transition"
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
