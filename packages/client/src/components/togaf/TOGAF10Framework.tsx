import { useState } from 'react';
import { Compass, Building2, Database, AppWindow, Server, Eye, Layers } from 'lucide-react';
import ADMPhaseNavigator from './ADMPhaseNavigator';
import BusinessArchitecture from './BusinessArchitecture';
import DataArchitecture from './DataArchitecture';
import ApplicationArchitecture from './ApplicationArchitecture';
import TechnologyArchitecture from './TechnologyArchitecture';
import ViewpointSelector from './ViewpointSelector';

type TOGAFTab = 'adm' | 'business' | 'data' | 'application' | 'technology' | 'viewpoints';

const TABS: { id: TOGAFTab; label: string; icon: typeof Compass; color: string }[] = [
  { id: 'adm', label: 'ADM', icon: Compass, color: '#7c3aed' },
  { id: 'business', label: 'Business', icon: Building2, color: '#22c55e' },
  { id: 'data', label: 'Data', icon: Database, color: '#3b82f6' },
  { id: 'application', label: 'Apps', icon: AppWindow, color: '#f97316' },
  { id: 'technology', label: 'Tech', icon: Server, color: '#a855f7' },
  { id: 'viewpoints', label: 'Views', icon: Eye, color: '#94a3b8' },
];

export default function TOGAF10Framework() {
  const [activeTab, setActiveTab] = useState<TOGAFTab>('adm');

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex border-b border-[#334155] overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2.5 py-2 text-[10px] font-medium whitespace-nowrap transition border-b-2 ${
                activeTab === tab.id
                  ? 'border-current text-white'
                  : 'border-transparent text-[#64748b] hover:text-[#94a3b8]'
              }`}
              style={activeTab === tab.id ? { color: tab.color } : undefined}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'adm' && <ADMPhaseNavigator />}
        {activeTab === 'business' && <BusinessArchitecture />}
        {activeTab === 'data' && <DataArchitecture />}
        {activeTab === 'application' && <ApplicationArchitecture />}
        {activeTab === 'technology' && <TechnologyArchitecture />}
        {activeTab === 'viewpoints' && <ViewpointSelector />}
      </div>
    </div>
  );
}
