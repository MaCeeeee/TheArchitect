import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSettingsStore } from '../../stores/settingsStore';

const THEMES = [
  { id: 'dark', label: 'Dark', preview: 'bg-[var(--surface-base)]' },
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
      toast.success('Preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    }
  };

  const theme = (preferences?.theme as string) || 'dark';
  const language = (preferences?.language as string) || 'de';
  const timezone = (preferences?.timezone as string) || 'Europe/Berlin';

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Appearance</h2>
      <p className="text-sm text-[var(--text-tertiary)] mb-6">Customize the look and feel of TheArchitect.</p>

      <div className="space-y-6">
        {/* Theme */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Theme</h3>
          <div className="flex gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => handleUpdate('theme', t.id)}
                disabled={loading}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition ${
                  theme === t.id
                    ? 'border-[#00ff41] bg-[#00ff41]/10'
                    : 'border-[var(--border-subtle)] hover:border-[#3a4a3a]'
                }`}
              >
                <div className={`h-16 w-24 rounded-md ${t.preview} border border-[var(--border-subtle)]`} />
                <span className="text-xs text-[var(--text-secondary)]">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Language</h3>
          <select
            value={language}
            onChange={(e) => handleUpdate('language', e.target.value)}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white outline-none focus:border-[#00ff41]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>

        {/* Timezone */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Timezone</h3>
          <select
            value={timezone}
            onChange={(e) => handleUpdate('timezone', e.target.value)}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-white outline-none focus:border-[#00ff41]"
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
