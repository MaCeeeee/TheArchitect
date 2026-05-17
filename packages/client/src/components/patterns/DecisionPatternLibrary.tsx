import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Search } from 'lucide-react';
import Modal from '../../design-system/patterns/Modal';
import type { PatternCategory } from '@thearchitect/shared';
import { useDecisionPatterns } from '../../hooks/useDecisionPatterns';
import { PatternCard } from './PatternCard';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
}

const CATEGORIES: { id: PatternCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'security', label: 'Security' },
  { id: 'data', label: 'Data' },
  { id: 'integration', label: 'Integration' },
  { id: 'observability', label: 'Observability' },
  { id: 'compute', label: 'Compute' },
];

// Chernev: choice-set complexity HIGH → max 5 visible; "Show More" beyond.
const INITIAL_VISIBLE = 5;

export function DecisionPatternLibrary({ isOpen, onClose, projectId }: Props) {
  const [category, setCategory] = useState<PatternCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [adoptingSlug, setAdoptingSlug] = useState<string | null>(null);

  const { patterns, loading, error, adopt, reload } = useDecisionPatterns(
    category === 'all' ? undefined : { category },
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patterns;
    return patterns.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [patterns, query]);

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE);

  const handleAdopt = async (slug: string) => {
    if (!projectId) {
      toast.error('Open a project first to apply patterns');
      return;
    }
    setAdoptingSlug(slug);
    try {
      const result = await adopt(slug, projectId);
      toast.success(`Pattern applied: ${result.patternSlug} v${result.version}`);
      reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Apply failed';
      toast.error(msg);
    } finally {
      setAdoptingSlug(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📚 Pre-Validated Pattern Library" size="lg">
      <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
        <p className="text-sm text-slate-400">
          Compliance-scored, lifecycle-tracked patterns for common architecture decisions.
          Apply with one click — adoption is audited.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategory(c.id);
                setShowAll(false);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                category === c.id
                  ? 'bg-[#7c3aed] text-white'
                  : 'bg-[#1e293b] text-slate-300 hover:bg-[#334155]'
              }`}
              data-testid={`category-${c.id}`}
            >
              {c.label}
            </button>
          ))}
          <div className="flex-1 min-w-[160px] relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowAll(false);
              }}
              placeholder="Search patterns…"
              className="w-full pl-8 pr-3 py-1.5 rounded bg-[#0f172a] border border-[#334155] text-xs text-white placeholder-slate-500 focus:border-[#7c3aed] focus:outline-none"
              data-testid="pattern-search"
            />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading patterns…
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded p-3">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm">
            No patterns match your filter.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {visible.map((p) => (
                <PatternCard
                  key={p.slug}
                  pattern={p}
                  onAdopt={handleAdopt}
                  adopting={adoptingSlug === p.slug}
                />
              ))}
            </div>
            {!showAll && filtered.length > INITIAL_VISIBLE && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mx-auto px-4 py-1.5 rounded bg-[#1e293b] border border-[#334155] hover:border-[#7c3aed] text-sm text-slate-300"
                data-testid="show-more"
              >
                Show {filtered.length - INITIAL_VISIBLE} more
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default DecisionPatternLibrary;
