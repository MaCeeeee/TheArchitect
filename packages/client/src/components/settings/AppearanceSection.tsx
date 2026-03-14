import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

const THEMES = [
  { id: 'dark', label: 'Dark', preview: 'bg-[#0f172a]' },
  { id: 'light', label: 'Light', preview: 'bg-white' },
];

const LANGUAGES = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Francais' },
  { id: 'es', label: 'Espanol' },
];

const TIMEZONES = [
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'UTC',
];

export default function AppearanceSection() {
  const { preferences, fetchPreferences, updatePreferences, loading } = useSettingsStore();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const handleUpdate = async (key: string, value: string) => {
    try {
      await updatePreferences({ [key]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error in store
    }
  };

  const theme = (preferences?.theme as string) || 'dark';
  const language = (preferences?.language as string) || 'de';
  const timezone = (preferences?.timezone as string) || 'Europe/Berlin';

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Appearance</h2>
      <p className="text-sm text-[#64748b] mb-6">Customize the look and feel of TheArchitect.</p>

      <div className="space-y-6">
        {/* Theme */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Theme</h3>
          <div className="flex gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleUpdate('theme', t.id)}
                disabled={loading}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition ${
                  theme === t.id
                    ? 'border-[#7c3aed] bg-[#7c3aed]/10'
                    : 'border-[#334155] hover:border-[#475569]'
                }`}
              >
                <div className={`h-16 w-24 rounded-md ${t.preview} border border-[#334155]`} />
                <span className="text-xs text-[#94a3b8]">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Language</h3>
          <select
            value={language}
            onChange={(e) => handleUpdate('language', e.target.value)}
            className="rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Timezone */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Timezone</h3>
          <select
            value={timezone}
            onChange={(e) => handleUpdate('timezone', e.target.value)}
            className="rounded-md border border-[#334155] bg-[#0f172a] px-3 py-2 text-sm text-white outline-none focus:border-[#7c3aed]"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        {saved && <span className="text-sm text-green-400">Preferences saved!</span>}
      </div>
    </div>
  );
}
