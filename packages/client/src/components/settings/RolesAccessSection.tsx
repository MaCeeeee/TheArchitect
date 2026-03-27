import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { projectAPI } from '../../services/api';
import { ROLE_PERMISSIONS, PERMISSIONS } from '@thearchitect/shared';
import {
  FolderOpen, Info, ChevronDown, ChevronRight, User as UserIcon, Plus, X,
} from 'lucide-react';

interface ProjectWithRole {
  _id: string;
  name: string;
  role: string;
}

interface Member {
  name: string;
  email: string;
  role: string;
}

interface SearchResult {
  _id: string;
  name: string;
  email: string;
}

const ROLE_COLOR: Record<string, string> = {
  owner: 'bg-amber-500/20 text-amber-400',
  editor: 'bg-blue-500/20 text-blue-400',
  reviewer: 'bg-purple-500/20 text-purple-400',
  viewer: 'bg-slate-500/20 text-slate-400',
};

const PROJECT_ROLES = ['owner', 'editor', 'reviewer', 'viewer'] as const;

export default function RolesAccessSection() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role || 'viewer';
  const userId = user?.id;

  const [projects, setProjects] = useState<ProjectWithRole[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({});

  // Add member state — keyed by projectId
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchResult | null>(null);
  const [newRole, setNewRole] = useState<string>('viewer');
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const permissionGroups = useMemo(() => {
    const perms = ROLE_PERMISSIONS[userRole as keyof typeof ROLE_PERMISSIONS] || [];
    const allPerms = Object.values(PERMISSIONS);
    const groups: Record<string, { label: string; has: boolean }[]> = {};
    for (const p of allPerms) {
      const [domain, action] = p.split(':');
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push({ label: action.replace(/_/g, ' '), has: perms.includes(p) });
    }
    return groups;
  }, [userRole]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await projectAPI.list();
        const list = (res.data || []).map((p: Record<string, unknown>) => {
          const collaborators = (p.collaborators || []) as Array<{ userId: string; role: string }>;
          const collab = collaborators.find((c) => c.userId === userId);
          const isOwner = p.ownerId === userId;
          return {
            _id: p._id as string,
            name: p.name as string,
            role: isOwner ? 'owner' : collab?.role || 'viewer',
          };
        });
        setProjects(list);
      } catch {
        // silently fail
      } finally {
        setLoadingProjects(false);
      }
    };
    fetchProjects();
  }, [userId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchMembers = useCallback(async (projectId: string) => {
    setLoadingMembers((prev) => ({ ...prev, [projectId]: true }));
    try {
      const res = await projectAPI.getCollaborators(projectId);
      const data = res.data as {
        data: Array<{ userId: { _id: string; name: string; email: string }; role: string }>;
        owner: { name: string; email: string; role: string };
      };
      const memberList: Member[] = [];
      if (data.owner) {
        memberList.push({ name: data.owner.name, email: data.owner.email, role: 'owner' });
      }
      for (const c of data.data || []) {
        const u = c.userId as { _id: string; name: string; email: string };
        memberList.push({ name: u?.name || 'Unknown', email: u?.email || '', role: c.role });
      }
      setMembers((prev) => ({ ...prev, [projectId]: memberList }));
    } catch {
      setMembers((prev) => ({ ...prev, [projectId]: [] }));
    } finally {
      setLoadingMembers((prev) => ({ ...prev, [projectId]: false }));
    }
  }, []);

  const toggleExpand = useCallback(async (projectId: string) => {
    const isOpen = expanded[projectId];
    setExpanded((prev) => ({ ...prev, [projectId]: !isOpen }));
    if (!isOpen && !members[projectId]) {
      fetchMembers(projectId);
    }
  }, [expanded, members, fetchMembers]);

  const handleSearch = useCallback((projectId: string, q: string) => {
    setSearchQuery(q);
    setSelectedUser(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await projectAPI.searchUsers(projectId, q);
        setSearchResults(res.data as SearchResult[]);
      } catch {
        setSearchResults([]);
      }
    }, 250);
  }, []);

  const selectUser = useCallback((u: SearchResult) => {
    setSelectedUser(u);
    setSearchQuery(u.name);
    setSearchResults([]);
  }, []);

  const openAddForm = useCallback((projectId: string) => {
    setAddingTo(projectId);
    setSearchQuery('');
    setSelectedUser(null);
    setNewRole('viewer');
    setSearchResults([]);
  }, []);

  const closeAddForm = useCallback(() => {
    setAddingTo(null);
    setSearchQuery('');
    setSelectedUser(null);
    setSearchResults([]);
  }, []);

  const handleAddMember = useCallback(async (projectId: string) => {
    const email = selectedUser?.email || searchQuery.trim();
    if (!email) return;
    if (newRole === 'owner') {
      const confirmed = window.confirm(
        `Transfer ownership to ${selectedUser?.name || email}? You will become an editor.`
      );
      if (!confirmed) return;
    }
    setSubmitting(true);
    try {
      const res = await projectAPI.addCollaborator(projectId, email, newRole);
      const data = res.data as { type: string; email?: string };
      if (data.type === 'invited') {
        toast.success(`Invitation sent to ${data.email || email}`);
      } else if (data.type === 'transferred') {
        toast.success(`Ownership transferred to ${selectedUser?.name || email}`);
      } else {
        toast.success(`${selectedUser?.name || email} added as ${newRole}`);
      }
      closeAddForm();
      fetchMembers(projectId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to add member';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [selectedUser, searchQuery, newRole, closeAddForm, fetchMembers]);

  const canManage = (projectRole: string) => projectRole === 'owner' || projectRole === 'editor';

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Roles & Access</h2>
      <p className="text-sm text-[var(--text-tertiary)] mb-6">
        Your platform role and project-level access across all projects.
      </p>

      <div className="space-y-6">
        {/* Platform Role */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Platform Role</h3>
            <span className="rounded-full bg-[#7c3aed]/20 px-3 py-1 text-xs font-medium text-[#a78bfa] capitalize">
              {userRole.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            Your platform role determines which features you can access globally. It is assigned by an administrator.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(permissionGroups).map(([domain, perms]) => (
              <div key={domain}>
                <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">{domain}</p>
                <ul className="space-y-1">
                  {perms.map((p) => (
                    <li key={p.label} className="flex items-center gap-1.5 text-xs">
                      {p.has ? (
                        <span className="text-green-400">&#10003;</span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">&#10005;</span>
                      )}
                      <span className={p.has ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)] line-through'}>
                        {p.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Project Roles */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Project Roles</h3>
          <p className="text-xs text-[var(--text-tertiary)] mb-4">
            Your role in each project. Project owners and editors can change member roles.
          </p>

          {loadingProjects ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-tertiary)] border-t-transparent" />
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)] py-4">You are not a member of any projects yet.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((p) => (
                <div key={p._id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden">
                  {/* Project header row */}
                  <div className="flex items-center">
                    <button
                      onClick={() => toggleExpand(p._id)}
                      className="flex flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-raised)]"
                    >
                      {expanded[p._id] ? (
                        <ChevronDown size={14} className="text-[var(--text-tertiary)] shrink-0" />
                      ) : (
                        <ChevronRight size={14} className="text-[var(--text-tertiary)] shrink-0" />
                      )}
                      <FolderOpen size={16} className="text-[var(--text-tertiary)] shrink-0" />
                      <span className="text-sm text-white truncate">{p.name}</span>
                    </button>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize mr-4 ${ROLE_COLOR[p.role] || ROLE_COLOR.viewer}`}>
                      {p.role}
                    </span>
                  </div>

                  {/* Expanded members list */}
                  {expanded[p._id] && (
                    <div className="border-t border-[var(--border-subtle)] px-4 py-3">
                      {loadingMembers[p._id] ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-1">
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--text-tertiary)] border-t-transparent" />
                          Loading members...
                        </div>
                      ) : (
                        <>
                          {(members[p._id] || []).length === 0 ? (
                            <p className="text-xs text-[var(--text-tertiary)]">No members found.</p>
                          ) : (
                            <div className="space-y-2">
                              {(members[p._id] || []).map((m, i) => (
                                <div key={i} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <UserIcon size={14} className="text-[var(--text-tertiary)] shrink-0" />
                                    <div className="min-w-0">
                                      <span className="text-xs text-white block truncate">{m.name}</span>
                                      <span className="text-[10px] text-[var(--text-tertiary)] block truncate">{m.email}</span>
                                    </div>
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${ROLE_COLOR[m.role] || ROLE_COLOR.viewer}`}>
                                    {m.role}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add member form */}
                          {canManage(p.role) && (
                            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                              {addingTo === p._id ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    {/* User search input with autocomplete */}
                                    <div ref={searchRef} className="relative flex-1">
                                      <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => handleSearch(p._id, e.target.value)}
                                        placeholder="Search by name or email..."
                                        autoFocus
                                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs text-white outline-none focus:border-[#00ff41] placeholder:text-[var(--text-tertiary)]"
                                      />
                                      {searchResults.length > 0 && (
                                        <div className="absolute z-10 mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-lg max-h-40 overflow-y-auto">
                                          {searchResults.map((u) => (
                                            <button
                                              key={u._id}
                                              onClick={() => selectUser(u)}
                                              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-base)] transition"
                                            >
                                              <UserIcon size={12} className="text-[var(--text-tertiary)] shrink-0" />
                                              <div className="min-w-0">
                                                <span className="text-xs text-white block truncate">{u.name}</span>
                                                <span className="text-[10px] text-[var(--text-tertiary)] block truncate">{u.email}</span>
                                              </div>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Role picker */}
                                    <select
                                      value={newRole}
                                      onChange={(e) => setNewRole(e.target.value)}
                                      className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1.5 text-xs text-white outline-none focus:border-[#00ff41] capitalize"
                                    >
                                      {PROJECT_ROLES.map((r) => (
                                        <option key={r} value={r}>{r}</option>
                                      ))}
                                    </select>

                                    {/* Submit */}
                                    <button
                                      onClick={() => handleAddMember(p._id)}
                                      disabled={submitting || (!selectedUser && !searchQuery.includes('@'))}
                                      className="rounded-md bg-[#00ff41] px-3 py-1.5 text-xs font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-40"
                                    >
                                      {submitting ? '...' : 'Add'}
                                    </button>

                                    {/* Cancel */}
                                    <button
                                      onClick={closeAddForm}
                                      className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:text-white hover:bg-[var(--surface-raised)] transition"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                  {selectedUser && (
                                    <p className="text-[10px] text-[var(--text-tertiary)]">
                                      Adding <span className="text-white">{selectedUser.name}</span> ({selectedUser.email}) as {newRole}
                                    </p>
                                  )}
                                  {!selectedUser && searchQuery.includes('@') && (
                                    <p className="text-[10px] text-[var(--text-tertiary)]">
                                      Will add by email: <span className="text-white">{searchQuery}</span>
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <button
                                  onClick={() => openAddForm(p._id)}
                                  className="flex items-center gap-1.5 text-xs text-[#00ff41] hover:text-[#33ff66] transition"
                                >
                                  <Plus size={14} />
                                  Add member
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => navigate(`/project/${p._id}`)}
                        className="mt-3 text-xs text-[var(--text-secondary)] hover:text-white transition"
                      >
                        Open project &rarr;
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Who can change permissions */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-start gap-3">
            <Info size={16} className="text-[var(--text-tertiary)] mt-0.5 shrink-0" />
            <div className="text-xs text-[var(--text-tertiary)] space-y-2">
              <p>
                <span className="text-[var(--text-secondary)] font-medium">Platform role</span> can only be changed by administrators
                (Chief Architect or Enterprise Architect) under Settings &gt; Users.
              </p>
              <p>
                <span className="text-[var(--text-secondary)] font-medium">Project role</span> can be changed by the project owner
                or any editor within the project's collaborator settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
