import { useState } from 'react';
import TOGAF10Framework from '../togaf/TOGAF10Framework';
import TemplateMarketplace from '../marketplace/TemplateMarketplace';

const TABS = [
  { id: 'framework', label: 'Framework' },
  { id: 'templates', label: 'Templates' },
] as const;

export default function ArchitectPanel() {
  const [tab, setTab] = useState<'framework' | 'templates'>('framework');

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex border-b border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-2 text-[10px] font-medium transition ${
              tab === t.id
                ? 'text-white border-b-2 border-[#00ff41]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'framework' && <TOGAF10Framework />}
        {tab === 'templates' && <TemplateMarketplace />}
      </div>
    </div>
  );
}
