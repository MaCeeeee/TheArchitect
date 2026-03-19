import { useEffect, useState } from 'react';
import { X, UserPlus, Loader2, AlertCircle, Crown, Trash2, Mail, RotateCw, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectAPI, invitationAPI } from '../../services/api';

interface CollaboratorEntry {
  userId: { _id: string; name: string; email: string } | string;
  role: string;
  joinedAt: string;
}

interface PendingInvitation {
  _id: string;
  invitedEmail: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  inviterUserId?: { name: string; email: string };
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
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [ownerId, setOwnerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [adding, setAdding] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) loadAll();
  }, [isOpen, projectId]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [collabRes, inviteRes] = await Promise.all([
        projectAPI.getCollaborators(projectId),
        invitationAPI.list(projectId).catch(() => ({ data: { data: [] } })),
      ]);
      setCollaborators(collabRes.data.data || []);
      setOwnerId(collabRes.data.ownerId || '');
      setInvitations(inviteRes.data.data || []);
    } catch {
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const { data } = await invitationAPI.create(projectId, email.trim(), newRole);
      setInvitations((prev) => [data, ...prev]);
      setEmail('');
      toast.success(`Invitation sent to ${email.trim()}`);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to send invitation';
      // If user exists and can be added directly, fall back to direct add
      if (msg === 'User not found') {
        toast.error('Failed to send invitation');
      } else {
        toast.error(msg);
      }
      setError(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleResend = async (invitationId: string) => {
    setResendingId(invitationId);
    try {
      await invitationAPI.resend(projectId, invitationId);
      toast.success('Invitation resent');
    } catch {
      toast.error('Failed to resend invitation');
    } finally {
      setResendingId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await invitationAPI.cancel(projectId, invitationId);
      setInvitations((prev) => prev.filter((i) => i._id !== invitationId));
      toast.success('Invitation cancelled');
    } catch {
      toast.error('Failed to cancel invitation');
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
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
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
      toast.success('Collaborator removed');
    } catch {
      toast.error('Failed to remove collaborator');
    }
  };

  const daysUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 0 ? 'Expired' : `${days}d left`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-[fadeIn_150ms_ease-out]" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-[#1a2a1a] bg-[#111111] shadow-2xl animate-[scaleIn_200ms_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1a2a1a] px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Project Members</h2>
          <button onClick={onClose} className="text-[#7a8a7a] hover:text-white">
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

          {/* Invite form */}
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
              placeholder="Invite by email..."
              className="flex-1 rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#3a4a3a] outline-none focus:border-[#00ff41] transition"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-2 py-2 text-xs text-white outline-none"
            >
              {PROJECT_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={adding || !email.trim()}
              className="flex items-center gap-1.5 rounded-md bg-[#00ff41] px-3 py-2 text-xs font-medium text-black hover:bg-[#00cc33] disabled:opacity-50 transition"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
              Invite
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[#00ff41]" />
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {/* Owner */}
              {ownerId && (
                <div className="flex items-center gap-3 rounded-md px-3 py-2.5 bg-[#0a0a0a]">
                  <Crown size={14} className="text-amber-400 shrink-0" />
                  <span className="text-sm text-white flex-1">Owner</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${ROLE_BADGE_COLORS.owner}`}>
                    Owner
                  </span>
                </div>
              )}

              {/* Active Collaborators */}
              {collaborators.map((c) => {
                const user = typeof c.userId === 'string'
                  ? { _id: c.userId, name: 'Unknown', email: '' }
                  : c.userId;

                return (
                  <div key={user._id} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[#0a0a0a] transition group">
                    <div className="h-7 w-7 rounded-full bg-[#1a2a1a] flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {user.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{user.name}</p>
                      <p className="text-xs text-[#3a4a3a] truncate">{user.email}</p>
                    </div>
                    <select
                      value={c.role}
                      onChange={(e) => handleRoleChange(user._id, e.target.value)}
                      className="rounded border border-[#1a2a1a] bg-[#0a0a0a] px-1.5 py-1 text-[11px] text-white outline-none"
                    >
                      {PROJECT_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemove(user._id)}
                      className="p-1 rounded text-[#3a4a3a] hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}

              {/* Pending Invitations */}
              {invitations.length > 0 && (
                <>
                  <div className="pt-3 pb-1 px-1">
                    <p className="text-[10px] font-medium text-[#4a5a4a] uppercase tracking-wider">Pending Invitations</p>
                  </div>
                  {invitations.map((inv) => (
                    <div key={inv._id} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-[#0a0a0a] transition group border border-dashed border-[#1a2a1a]">
                      <div className="h-7 w-7 rounded-full bg-[#1a2a1a]/50 flex items-center justify-center shrink-0">
                        <Mail size={12} className="text-[#4a5a4a]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#7a8a7a] truncate">{inv.invitedEmail}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ROLE_BADGE_COLORS[inv.role] || ROLE_BADGE_COLORS.viewer}`}>
                            {inv.role}
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px] text-[#4a5a4a]">
                            <Clock size={9} />
                            {daysUntil(inv.expiresAt)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleResend(inv._id)}
                        disabled={resendingId === inv._id}
                        className="p-1 rounded text-[#3a4a3a] hover:text-[#00ff41] hover:bg-[#00ff41]/10 opacity-0 group-hover:opacity-100 transition"
                        title="Resend invitation"
                      >
                        {resendingId === inv._id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <RotateCw size={12} />
                        )}
                      </button>
                      <button
                        onClick={() => handleCancelInvitation(inv._id)}
                        className="p-1 rounded text-[#3a4a3a] hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition"
                        title="Cancel invitation"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {collaborators.length === 0 && invitations.length === 0 && (
                <p className="text-xs text-[#4a5a4a] text-center py-4">No collaborators yet. Invite someone above.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
