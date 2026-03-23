import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, ShieldAlert, FileText, Grid3X3, FileCheck, Sparkles, TrendingUp, ClipboardCheck, LayoutDashboard } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import StandardsManager from '../copilot/StandardsManager';
import ComplianceMatrix from '../copilot/ComplianceMatrix';
import { PolicyDraftReview } from '../governance/PolicyDraftReview';
import { SuggestedElements } from '../copilot/SuggestedElements';
import ComplianceProgressChart from '../copilot/ComplianceProgressChart';
import AuditReadinessDashboard from '../copilot/AuditReadinessDashboard';
import { CompliancePipelineWizard } from '../copilot/CompliancePipelineWizard';

interface OverlaySection {
  id: string;
  label: string;
  icon: LucideIcon;
}

const SECTIONS: OverlaySection[] = [
  { id: 'pipeline', label: 'Pipeline', icon: ShieldAlert },
  { id: 'standards', label: 'Standards', icon: FileText },
  { id: 'matrix', label: 'Matrix', icon: Grid3X3 },
  { id: 'policies', label: 'Policies', icon: FileCheck },
  { id: 'elements', label: 'Elements', icon: Sparkles },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'audit', label: 'Audit', icon: ClipboardCheck },
];

interface ComplianceOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: string;
}

export default function ComplianceOverlay({ isOpen, onClose, initialSection }: ComplianceOverlayProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(initialSection || 'pipeline');
  const [matrixStandardId, setMatrixStandardId] = useState<string | null>(null);
  const [matrixSectionIds, setMatrixSectionIds] = useState<string[]>([]);

  if (!isOpen || !projectId) return null;

  const goFullscreen = () => {
    navigate(`/project/${projectId}/compliance/${activeSection}`);
    onClose();
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 z-40 flex animate-[slideInRight_250ms_ease-out]">
      {/* Backdrop — click to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Panel */}
      <div className="w-[480px] flex flex-col border-l border-[var(--border-default)] bg-[var(--surface-raised)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Compliance</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={goFullscreen}
              className="text-[10px] text-[var(--status-purple)] hover:text-[#c4b5fd] transition"
            >
              Full View →
            </button>
            <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-white transition">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex border-b border-[var(--border-subtle)] px-2 overflow-x-auto">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-medium whitespace-nowrap transition border-b-2 ${
                activeSection === s.id
                  ? 'text-[var(--status-purple)] border-[var(--status-purple)]'
                  : 'text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]'
              }`}
            >
              <s.icon size={12} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeSection === 'pipeline' && <CompliancePipelineWizard />}

          {activeSection === 'standards' && (
            <StandardsManager
              onAnalyze={() => {}}
              onMatrixView={(stdId, secIds) => {
                setMatrixStandardId(stdId);
                setMatrixSectionIds(secIds);
                setActiveSection('matrix');
              }}
            />
          )}

          {activeSection === 'matrix' && matrixStandardId && (
            <ComplianceMatrix
              standardId={matrixStandardId}
              sectionIds={matrixSectionIds.length > 0 ? matrixSectionIds : undefined}
              onBack={() => setActiveSection('standards')}
            />
          )}

          {activeSection === 'matrix' && !matrixStandardId && (
            <div className="text-center py-8 text-[var(--text-tertiary)]">
              <p className="text-xs">Select a standard first in the Standards tab.</p>
              <button
                onClick={() => setActiveSection('standards')}
                className="mt-2 text-[10px] text-[var(--status-purple)] hover:underline"
              >
                Go to Standards
              </button>
            </div>
          )}

          {activeSection === 'policies' && <PolicyDraftReview />}
          {activeSection === 'elements' && <SuggestedElements />}
          {activeSection === 'progress' && <ComplianceProgressChart projectId={projectId} />}
          {activeSection === 'audit' && <AuditReadinessDashboard projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}
