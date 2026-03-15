import { useEffect, useState } from 'react';
import { X, UserPlus, Loader2, AlertCircle, Crown, Trash2 } from 'lucide-react';
import { projectAPI } from '../../services/api';

interface CollaboratorEntry {
  userId: { _id: string; name: string; email: string } | string;
  role: string;
  joinedAt: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

const PROJECT_ROLES = [
  { value: 'editor', label: 'Editor' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'viewer', label: 'Viewer' },
];

const ROLE_BADGE_COLORS: Record<string, string> = {
  owner: 'bg-amber-500/20 text-amber-300',
  editor: 'bg-blue-500/20 text-blue-300',
  reviewer: 'bg-purple-500/20 text-purple-300',
  viewer: 'bg-slate-500/20 text-slate-300',
};

export default function ProjectCollaborators({ isOpen, onClose, projectId }: Props) {
  const [collaborators, setCollaborators] = useState<CollaboratorEntry[]>([]);
  const [ownerId, setOwnerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (isOpen) loadCollaborators();
  }, [isOpen, projectId]);

  const loadCollaborators = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await projectAPI.getCollaborators(projectId);
      setCollaborators(data.data || []);
      setOwnerId(data.ownerId || '');
    } catch {
      setError('Failed to load collaborators');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!email.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const { data } = await projectAPI.addCollaborator(projectId, email.trim(), newRole);
      setCollaborators((prev) => [...prev, data]);
      setEmail('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add collaborator');
    } finally {
      setAdding(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await projectAPI.updateCollaborator(projectId, userId, role);
      setCollaborators((prev) =>
        prev.map((c) => {
          const uid = typeof c.userId === 'string' ? c.userId : c.userId._id;
          return uid === userId ? { ...c, role } : c;
        })
      );
    } catch {
      setError('Failed to update role');
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await projectAPI.removeCollaborator(projectId, userId);
      setCollaborators((prev) =>
        prev.filter((c) => {
          const uid = typeof c.userId === 'string' ? c.userId : c.userId._id;
          return uid !== userId;
        })
      );
    } catch {
      setError('Failed to remove collaborator');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-[#334155] bg-[#1e293b] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#334155] px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Project Members</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-2.5">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}

          {/* Add collaborator */}
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Email address..."
              className="flex-1 rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#475569] outline-none focus:border-[#7c3aed] transition"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-2 text-xs text-white outline-none"
            >
              {PROJECT_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={adding || !email.trim()}
              className="flex items-center gap-1.5 rounded-md bg-[#7c3aed] px-3 py-2 text-xs font-medium text-white hover:bg-[#6d28d9] disabled:opacity-50 transition"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Add
            </button>
          </div>

          {/* Members list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[#7c3aed]" />
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {/* Owner */}
              {ownerId && (
                <div className="flex items-center gap-3 rounded-md px-3 py-2.5 bg-[#0f172a]">
                  <Crown size={14} className="text-amber-400 shrink-0" />
                  <span className="text-sm text-white flex-1">Owner</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${ROLE_BADGE_COLORS.owner}`}>
                    Owner
                  </span>
                </div>
              )}

              {collaborators.length === 0 && (
                <p className="text-xs text-[#64748b] text-center py-4">No collaborators yet</p>
              )}

              {collaborators.map((c) => {
                const user = typeof c.userId === 'string'
                  ? { _id: c.userId, name: 'Unknown', email: '' }
                  : c.userId;

                return (
                  <div key={user._id} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[#0f172a] transition group">
                    <div className="h-7 w-7 rounded-full bg-[#334155] flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {user.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{user.name}</p>
                      <p className="text-xs text-[#475569] truncate">{user.email}</p>
                    </div>
                    <select
                      value={c.role}
                      onChange={(e) => handleRoleChange(user._id, e.target.value)}
                      className="rounded border border-[#334155] bg-[#0f172a] px-1.5 py-1 text-[11px] text-white outline-none"
                    >
                      {PROJECT_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemove(user._id)}
                      className="p-1 rounded text-[#475569] hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
