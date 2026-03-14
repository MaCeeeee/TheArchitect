import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAuthStore } from '../../stores/authStore';

export default function ProfileSection() {
  const { profile, fetchProfile, updateProfile, loading } = useSettingsStore();
  const updateUser = useAuthStore((s) => s.updateUser);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setBio(profile.bio);
      setAvatarUrl(profile.avatarUrl);
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile({ name, bio, avatarUrl });
      updateUser({ name });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handled in store
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Profile</h2>
      <p className="text-sm text-[#64748b] mb-6">Manage your public profile information.</p>

      <div className="space-y-5">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-16 w-16 rounded-full bg-[#7c3aed]/30 flex items-center justify-center text-2xl text-[#a78bfa] font-bold shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              name?.charAt(0)?.toUpperCase() || '?'
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-[#94a3b8] mb-1">Avatar URL</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#7c3aed]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-1">Email</label>
          <input
            type="email"
            value={profile?.email || ''}
            disabled
            className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-[#64748b] outline-none cursor-not-allowed"
          />
          <p className="text-xs text-[#475569] mt-1">Email cannot be changed.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Tell us about yourself..."
            className="w-full rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white placeholder:text-[#64748b] outline-none focus:border-[#7c3aed] resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className="rounded-md bg-[#7c3aed] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d28d9] transition disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
          {saved && <span className="text-sm text-green-400">Saved!</span>}
        </div>
      </div>
    </div>
  );
}
