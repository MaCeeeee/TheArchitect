import { useState } from 'react';
import { Store, Search, Download, Star, Filter } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string;
  industry: string;
  description: string;
  elements: number;
  connections: number;
  downloads: number;
  rating: number;
  author: string;
  free: boolean;
}

const DEMO_TEMPLATES: Template[] = [
  { id: 't1', name: 'Microservices Architecture', category: 'technology', industry: 'General', description: 'Complete microservices pattern with API Gateway, Service Mesh, and Event Bus', elements: 24, connections: 36, downloads: 1240, rating: 4.8, author: 'TheArchitect Team', free: true },
  { id: 't2', name: 'Banking Core System', category: 'industry', industry: 'Finance', description: 'Core banking architecture with payment processing, KYC, and compliance modules', elements: 42, connections: 58, downloads: 890, rating: 4.6, author: 'FinArch Solutions', free: false },
  { id: 't3', name: 'Healthcare Integration', category: 'industry', industry: 'Healthcare', description: 'HL7 FHIR compliant integration pattern for hospital systems', elements: 31, connections: 44, downloads: 520, rating: 4.5, author: 'MedTech EA', free: false },
  { id: 't4', name: 'Cloud Migration Blueprint', category: 'best_practice', industry: 'General', description: 'Step-by-step cloud migration architecture with hybrid transition state', elements: 18, connections: 22, downloads: 2100, rating: 4.9, author: 'TheArchitect Team', free: true },
  { id: 't5', name: 'GDPR Compliance Framework', category: 'compliance', industry: 'General', description: 'Data privacy architecture with consent management and data lineage', elements: 15, connections: 20, downloads: 780, rating: 4.3, author: 'DataGov Pro', free: true },
  { id: 't6', name: 'E-Commerce Platform', category: 'technology', industry: 'Retail', description: 'Full e-commerce architecture with catalog, cart, checkout, and fulfillment', elements: 36, connections: 48, downloads: 1560, rating: 4.7, author: 'RetailArch', free: false },
  { id: 't7', name: 'Event-Driven Architecture', category: 'best_practice', industry: 'General', description: 'Event sourcing and CQRS patterns with message broker integration', elements: 20, connections: 28, downloads: 940, rating: 4.4, author: 'TheArchitect Team', free: true },
  { id: 't8', name: 'IoT Platform Architecture', category: 'technology', industry: 'Manufacturing', description: 'IoT device management, data ingestion, and real-time analytics pipeline', elements: 28, connections: 35, downloads: 410, rating: 4.2, author: 'IoT Masters', free: false },
];

const CATEGORIES = ['all', 'technology', 'industry', 'compliance', 'best_practice'];

export default function TemplateMarketplace() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [deploying, setDeploying] = useState<string | null>(null);

  const filtered = DEMO_TEMPLATES.filter((t) => {
    if (category !== 'all' && t.category !== category) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDeploy = (id: string) => {
    setDeploying(id);
    setTimeout(() => setDeploying(null), 2000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
          <Store size={14} className="text-[#f97316]" />
          Template Marketplace
        </h3>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="flex items-center gap-2 rounded-md bg-[var(--surface-base)] px-3 py-1.5 border border-[var(--border-subtle)]">
          <Search size={12} className="text-[var(--text-secondary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="flex-1 bg-transparent text-[10px] text-white placeholder:text-[var(--text-tertiary)] outline-none"
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 px-3 pb-2 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2 py-0.5 rounded-full text-[9px] capitalize transition ${
              category === c
                ? 'bg-[#f97316] text-white'
                : 'bg-[var(--surface-base)] text-[var(--text-tertiary)] hover:text-white border border-[var(--border-subtle)]'
            }`}
          >
            {c.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.map((t) => (
          <div key={t.id} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] p-2.5">
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-white font-medium truncate">{t.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[8px] text-[#f97316] capitalize bg-[#f97316]/10 px-1 rounded">{t.category.replace(/_/g, ' ')}</span>
                  <span className="text-[8px] text-[var(--text-tertiary)]">{t.industry}</span>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <Star size={8} className="text-[#eab308]" />
                <span className="text-[9px] text-[#eab308]">{t.rating}</span>
              </div>
            </div>
            <p className="text-[9px] text-[var(--text-tertiary)] mb-2 line-clamp-2">{t.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[8px] text-[var(--text-disabled)]">
                <span>{t.elements} elements</span>
                <span>{t.connections} connections</span>
                <span><Download size={8} className="inline" /> {t.downloads}</span>
              </div>
              <button
                onClick={() => handleDeploy(t.id)}
                disabled={deploying === t.id}
                className="rounded bg-[#f97316] px-2 py-0.5 text-[9px] font-medium text-white hover:bg-[#ea580c] disabled:opacity-50 transition"
              >
                {deploying === t.id ? 'Deploying...' : t.free ? 'Deploy' : 'Purchase'}
              </button>
            </div>
            <div className="text-[8px] text-[var(--text-disabled)] mt-1">by {t.author}</div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-[10px] text-[var(--text-tertiary)] text-center py-6">No templates found</p>
        )}
      </div>
    </div>
  );
}
