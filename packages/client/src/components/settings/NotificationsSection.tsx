import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

interface NotifPrefs {
  emailOnApproval: boolean;
  emailOnMention: boolean;
  emailOnProjectUpdate: boolean;
  inAppOnApproval: boolean;
  inAppOnMention: boolean;
  inAppOnProjectUpdate: boolean;
}

const DEFAULTS: NotifPrefs = {
  emailOnApproval: true,
  emailOnMention: true,
  emailOnProjectUpdate: false,
  inAppOnApproval: true,
  inAppOnMention: true,
  inAppOnProjectUpdate: true,
};

const LABELS: Record<string, string> = {
  emailOnApproval: 'Email on approval requests',
  emailOnMention: 'Email when mentioned',
  emailOnProjectUpdate: 'Email on project updates',
  inAppOnApproval: 'In-app approval notifications',
  inAppOnMention: 'In-app mention notifications',
  inAppOnProjectUpdate: 'In-app project updates',
};

export default function NotificationsSection() {
  const { preferences, fetchPreferences, updatePreferences } = useSettingsStore();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const notifs = { ...DEFAULTS, ...(preferences?.notifications as Partial<NotifPrefs>) };

  const handleToggle = async (key: keyof NotifPrefs) => {
    const updated = { ...notifs, [key]: !notifs[key] };
    try {
      await updatePreferences({ notifications: updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error in store
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Notifications</h2>
      <p className="text-sm text-[#64748b] mb-6">Choose how and when you want to be notified.</p>

      <div className="space-y-6">
        {/* Email Notifications */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Email Notifications</h3>
          <div className="space-y-3">
            {(['emailOnApproval', 'emailOnMention', 'emailOnProjectUpdate'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-[#94a3b8]">{LABELS[key]}</span>
                <button
                  onClick={() => handleToggle(key)}
                  className={`relative h-6 w-11 rounded-full transition ${
                    notifs[key] ? 'bg-[#7c3aed]' : 'bg-[#334155]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                      notifs[key] ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>

        {/* In-App Notifications */}
        <div className="rounded-lg border border-[#334155] bg-[#1e293b] p-5">
          <h3 className="text-sm font-semibold text-white mb-4">In-App Notifications</h3>
          <div className="space-y-3">
            {(['inAppOnApproval', 'inAppOnMention', 'inAppOnProjectUpdate'] as const).map((key) => (
              <label key={key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-[#94a3b8]">{LABELS[key]}</span>
                <button
                  onClick={() => handleToggle(key)}
                  className={`relative h-6 w-11 rounded-full transition ${
                    notifs[key] ? 'bg-[#7c3aed]' : 'bg-[#334155]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                      notifs[key] ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </label>
            ))}
          </div>
        </div>

        {saved && <span className="text-sm text-green-400">Notification preferences saved!</span>}
      </div>
    </div>
  );
}
