import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, Upload, Eye, Boxes, GitBranch } from 'lucide-react';
import { useBlueprintStore } from '../../stores/blueprintStore';

export default function BlueprintImport() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const editedElements = useBlueprintStore((s) => s.editedElements);
  const editedConnections = useBlueprintStore((s) => s.editedConnections);
  const isImporting = useBlueprintStore((s) => s.isImporting);
  const importResult = useBlueprintStore((s) => s.importResult);
  const error = useBlueprintStore((s) => s.error);
  const importBlueprint = useBlueprintStore((s) => s.importBlueprint);
  const setStep = useBlueprintStore((s) => s.setStep);
  const reset = useBlueprintStore((s) => s.reset);

  const [workspaceName, setWorkspaceName] = useState(
    `Blueprint - ${new Date().toLocaleDateString('en-US')}`,
  );

  const handleImport = () => {
    if (projectId) {
      importBlueprint(projectId, workspaceName);
    }
  };

  const handleOpenInView = () => {
    reset();
    if (projectId) {
      navigate(`/project/${projectId}`);
    }
  };

  // Already imported — show success
  if (importResult) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <div className="p-4 rounded-full bg-[#22c55e]/10">
          <CheckCircle2 size={48} className="text-[#22c55e]" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-white">Architecture Imported!</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Your enterprise architecture has been successfully created.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="rounded-lg bg-[#7c3aed]/10 border border-[#7c3aed]/30 px-6 py-3 text-center">
            <Boxes size={20} className="mx-auto text-[#a78bfa] mb-1" />
            <div className="text-xl font-bold text-[#a78bfa]">{importResult.elementsCreated}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Elements Created</div>
          </div>
          <div className="rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/30 px-6 py-3 text-center">
            <GitBranch size={20} className="mx-auto text-[#60a5fa] mb-1" />
            <div className="text-xl font-bold text-[#60a5fa]">{importResult.connectionsCreated}</div>
            <div className="text-[10px] text-[var(--text-tertiary)]">Connections Created</div>
          </div>
        </div>
        <button
          onClick={handleOpenInView}
          className="py-3 px-8 rounded-lg text-sm font-bold bg-[#7c3aed] hover:bg-[#6d28d9] text-white transition flex items-center gap-2 shadow-lg shadow-[#7c3aed]/20"
        >
          <Eye size={16} /> Open in 3D View
        </button>
      </div>
    );
  }

  // Import confirmation
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Import Architecture</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Confirm the import — the elements and connections will be created in your project.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-md bg-[var(--surface-base)] px-3 py-2">
            <Boxes size={16} className="text-[#7c3aed]" />
            <div>
              <div className="text-sm font-bold text-white">{editedElements.length}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">Elements</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-[var(--surface-base)] px-3 py-2">
            <GitBranch size={16} className="text-[#3b82f6]" />
            <div>
              <div className="text-sm font-bold text-white">{editedConnections.length}</div>
              <div className="text-[10px] text-[var(--text-tertiary)]">Connections</div>
            </div>
          </div>
        </div>
      </div>

      {/* Workspace name */}
      <div>
        <label className="text-xs font-medium text-[var(--text-secondary)] mb-1 block">Workspace Name</label>
        <input
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white placeholder:text-[var(--text-disabled)] outline-none focus:border-[#7c3aed] transition"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setStep(3)}
          disabled={isImporting}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleImport}
          disabled={isImporting}
          className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-[#7c3aed] hover:bg-[#6d28d9] text-white transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-[#7c3aed]/20"
        >
          {isImporting ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Importing...
            </>
          ) : (
            <>
              <Upload size={14} /> Import Now
            </>
          )}
        </button>
      </div>
    </div>
  );
}
