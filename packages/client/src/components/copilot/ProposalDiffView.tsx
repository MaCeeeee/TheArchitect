import { Layers, ArrowRight, Plus, Link2 } from 'lucide-react';
import type { RemediationProposal } from '@thearchitect/shared';

interface ProposalDiffViewProps {
  proposal: RemediationProposal;
}

const LAYER_COLORS: Record<string, string> = {
  motivation: '#ec4899',
  strategy: '#f59e0b',
  business: '#22c55e',
  information: '#3b82f6',
  application: '#f97316',
  technology: '#a855f7',
  physical: '#14b8a6',
  implementation_migration: '#6366f1',
};

export default function ProposalDiffView({ proposal }: ProposalDiffViewProps) {
  // Group elements by layer
  const byLayer: Record<string, typeof proposal.elements> = {};
  for (const el of proposal.elements) {
    if (!byLayer[el.layer]) byLayer[el.layer] = [];
    byLayer[el.layer].push(el);
  }

  const layerOrder = [
    'motivation', 'strategy', 'business', 'information',
    'application', 'technology', 'physical', 'implementation_migration',
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Layers size={11} className="text-[#7c3aed]" />
        <span className="text-[10px] font-medium text-white">Architecture Changes</span>
        <span className="text-[8px] text-[var(--text-tertiary)] ml-auto">
          +{proposal.elements.length} elements, +{proposal.connections.length} connections
        </span>
      </div>

      {/* Layer-grouped elements */}
      {layerOrder.map((layer) => {
        const elements = byLayer[layer];
        if (!elements || elements.length === 0) return null;
        const color = LAYER_COLORS[layer] || '#64748b';

        return (
          <div key={layer} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-[9px] font-medium text-white capitalize">{layer.replace('_', ' ')}</span>
              <span className="text-[8px] text-[var(--text-tertiary)]">+{elements.length}</span>
            </div>
            {elements.map((el) => (
              <div
                key={el.tempId}
                className="flex items-center gap-1.5 ml-3.5 px-2 py-1 rounded bg-green-500/5 border border-green-500/20"
              >
                <Plus size={8} className="text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] text-green-300">{el.name}</span>
                  <span className="text-[7px] text-[var(--text-disabled)] ml-1.5">{el.type}</span>
                </div>
                {el.sectionReference && (
                  <span className="text-[7px] text-[#7c3aed] shrink-0">{el.sectionReference}</span>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {/* Connections */}
      {proposal.connections.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Link2 size={10} className="text-[#7c3aed]" />
            <span className="text-[9px] font-medium text-white">New Connections</span>
          </div>
          {proposal.connections.map((conn) => (
            <div
              key={conn.tempId}
              className="flex items-center gap-1 ml-3.5 px-2 py-0.5 text-[8px] text-[var(--text-secondary)]"
            >
              <span className="text-green-300 truncate max-w-[80px]">{formatEndpoint(conn.sourceTempId)}</span>
              <ArrowRight size={8} className="text-[#7c3aed] shrink-0" />
              <span className="text-[#7c3aed] shrink-0">[{conn.type}]</span>
              <ArrowRight size={8} className="text-[#7c3aed] shrink-0" />
              <span className="text-green-300 truncate max-w-[80px]">{formatEndpoint(conn.targetTempId)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatEndpoint(id: string): string {
  if (id.startsWith('existing:')) return id.slice(9);
  if (id.startsWith('temp-')) return id;
  return id;
}
