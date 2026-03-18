import { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { Check } from 'lucide-react';

export default function BillingSection() {
  const { billing, fetchBilling } = useSettingsStore();

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  if (!billing) {
    return <div className="text-sm text-[#4a5a4a]">Loading billing information...</div>;
  }

  const planColors: Record<string, string> = {
    free: 'text-[#7a8a7a]',
    professional: 'text-[#00ff41]',
    enterprise: 'text-yellow-400',
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">Billing & Plan</h2>
      <p className="text-sm text-[#4a5a4a] mb-6">View your current plan and features.</p>

      <div className="rounded-lg border border-[#1a2a1a] bg-[#111111] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div>
            <p className="text-sm text-[#7a8a7a]">Current Plan</p>
            <p className={`text-2xl font-bold capitalize ${planColors[billing.plan] || 'text-white'}`}>
              {billing.plan}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="text-sm text-[#7a8a7a] mb-1">Role</p>
          <p className="text-sm text-white capitalize">{billing.role.replace(/_/g, ' ')}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-white mb-3">Included Features</p>
          <ul className="space-y-2">
            {billing.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-[#7a8a7a]">
                <Check size={14} className="text-green-400 shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
