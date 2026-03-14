import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

export default function AccessibilitySection() {
  const { preferences, fetchPreferences, updatePreferences } = useSettingsStore();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const acc = {
    fontSize: 'medium' as string,
    reduceMotion: false,
    highContrast: false,
    ...(preferences?.accessibility as Record<string, unknown>),
  };

  const handleUpdate = async (key: string, value: unknown) => {
    try {
      await updatePreferences({ accessibility: { ...acc, [key]: value } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error in store
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Accessibility</h2>
      <p className="text-sm text-[#64748b] mb-6">Adjust display and interaction settings for your comfort.</p>

      <div className="space-y-6">
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Font Size</h3>
          <div className="flex gap-3">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => handleUpdate('fontSize', size)}
                className={`rounded-md px-4 py-2 text-sm capitalize transition ${
                  acc.fontSize === size
                    ? 'bg-[#7c3aed] text-white'
                    : 'border border-[#334155] text-[#94a3b8] hover:text-white'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5 space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm text-white">Reduce Motion</p>
              <p className="text-xs text-[#64748b]">Minimize animations and transitions</p>
            </div>
            <button
              onClick={() => handleUpdate('reduceMotion', !acc.reduceMotion)}
              className={`relative h-6 w-11 rounded-full transition ${
                acc.reduceMotion ? 'bg-[#7c3aed]' : 'bg-[#334155]'
              }`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${acc.reduceMotion ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm text-white">High Contrast</p>
              <p className="text-xs text-[#64748b]">Increase contrast for better readability</p>
            </div>
            <button
              onClick={() => handleUpdate('highContrast', !acc.highContrast)}
              className={`relative h-6 w-11 rounded-full transition ${
                acc.highContrast ? 'bg-[#7c3aed]' : 'bg-[#334155]'
              }`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${acc.highContrast ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </label>
        </div>

        {saved && <span className="text-sm text-green-400">Accessibility preferences saved!</span>}
      </div>
    </div>
  );
}
