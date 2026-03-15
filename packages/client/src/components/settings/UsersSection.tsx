import { useEffect, useState } from 'react';
import { Search, Shield, Loader2, AlertCircle } from 'lucide-react';
import { adminAPI } from '../../services/api';

interface UserEntry {
  _id: string;
  name: string;
  email: string;
  role: string;
  mfaEnabled?: boolean;
  createdAt: string;
  updatedAt?: string;
}

const ROLES = [
  { value: 'chief_architect', label: 'Chief Architect' },
  { value: 'enterprise_architect', label: 'Enterprise Architect' },
  { value: 'solution_architect', label: 'Solution Architect' },
  { value: 'data_architect', label: 'Data Architect' },
  { value: 'business_architect', label: 'Business Architect' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'viewer', label: 'Viewer' },
];

const ROLE_COLORS: Record<string, string> = {
  chief_architect: '#ef4444',
  enterprise_architect: '#f97316',
  solution_architect: '#a855f7',
  data_architect: '#3b82f6',
  business_architect: '#22c55e',
  analyst: '#06b6d4',
  viewer: '#64748b',
};

export default function UsersSection() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [changingRole, setChangingRole] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminAPI.getUsers();
      setUsers(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (uid: string, newRole: string) => {
    setChangingRole(uid);
    try {
      await adminAPI.updateUserRole(uid, newRole);
      setUsers((prev) =>
        prev.map((u) => (u._id === uid ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      setError('Failed to update role');
    } finally {
      setChangingRole(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">User Management</h2>
      <p className="text-sm text-[#94a3b8] mt-1 mb-6">
        Manage platform users, assign roles, and monitor account status.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 mb-4">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <span className="text-xs text-red-300">{error}</span>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 mb-4">
        <Search size={14} className="text-[#94a3b8]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="flex-1 bg-transparent text-sm text-white placeholder:text-[#475569] outline-none"
        />
        <span className="text-xs text-[#475569]">{filtered.length} users</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center">
          <Loader2 size={18} className="animate-spin text-[#7c3aed]" />
          <span className="text-sm text-[#94a3b8]">Loading users...</span>
        </div>
      ) : (
        <div className="rounded-lg border border-[#334155] overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_160px_80px] gap-4 px-4 py-2.5 bg-[#0f172a] border-b border-[#334155]">
            <span className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Name</span>
            <span className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Email</span>
            <span className="text-xs font-medium text-[#64748b] uppercase tracking-wider">Role</span>
            <span className="text-xs font-medium text-[#64748b] uppercase tracking-wider">MFA</span>
          </div>

          {/* Rows */}
          <div className="max-h-[480px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#64748b]">No users found</div>
            ) : (
              filtered.map((user) => (
                <div
                  key={user._id}
                  className="grid grid-cols-[1fr_1fr_160px_80px] gap-4 items-center px-4 py-3 border-b border-[#334155] last:border-b-0 hover:bg-[#1e293b]/50 transition"
                >
                  {/* Name + Avatar */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: ROLE_COLORS[user.role] || '#475569' }}
                    >
                      {(user.name || user.email)?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{user.name || 'Unnamed'}</p>
                      <p className="text-xs text-[#475569]">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Email */}
                  <span className="text-sm text-[#94a3b8] truncate">{user.email}</span>

                  {/* Role dropdown */}
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user._id, e.target.value)}
                    disabled={changingRole === user._id}
                    className="rounded-md border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-xs text-white outline-none focus:border-[#7c3aed] transition disabled:opacity-50"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>

                  {/* MFA */}
                  <div className="flex items-center gap-1.5">
                    <Shield size={12} className={user.mfaEnabled ? 'text-emerald-400' : 'text-[#475569]'} />
                    <span className={`text-xs ${user.mfaEnabled ? 'text-emerald-400' : 'text-[#475569]'}`}>
                      {user.mfaEnabled ? 'On' : 'Off'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
