import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ComplianceSidebar from './ComplianceSidebar';
import PipelineStepper from './PipelineStepper';
import { useComplianceStore } from '../../stores/complianceStore';
import { CompliancePipelineWizard } from '../copilot/CompliancePipelineWizard';
import { CompliancePortfolioView } from '../governance/CompliancePortfolioView';
import StandardsManager from '../copilot/StandardsManager';
import ComplianceMatrix from '../copilot/ComplianceMatrix';
import { PolicyDraftReview } from '../governance/PolicyDraftReview';
import { SuggestedElements } from '../copilot/SuggestedElements';
import ComplianceProgressChart from '../copilot/ComplianceProgressChart';
import AuditReadinessDashboard from '../copilot/AuditReadinessDashboard';
import RoadmapPanel from '../analytics/RoadmapPanel';
// Governance components
import ComplianceDashboard from '../governance/ComplianceDashboard';
import ApprovalWorkflow from '../governance/ApprovalWorkflow';
import PolicyManager from '../governance/PolicyManager';
import AuditTrail from '../governance/AuditTrail';

// Sections that belong to the compliance pipeline (show stepper)
const PIPELINE_SECTIONS = new Set([
  'pipeline', 'portfolio', 'standards', 'matrix', 'policies', 'roadmap', 'elements', 'progress', 'audit',
]);

export default function CompliancePage() {
  const { projectId, section } = useParams<{ projectId: string; section?: string }>();
  const navigate = useNavigate();
  const activeSection = section || 'pipeline';

  // State for standards → matrix navigation
  const [matrixStandardId, setMatrixStandardId] = useState<string | null>(null);
  const [matrixSectionIds, setMatrixSectionIds] = useState<string[]>([]);
  const [matrixAutoSuggest, setMatrixAutoSuggest] = useState(false);
  const pipelineStates = useComplianceStore((s) => s.pipelineStates);

  // Auto-select first standard when navigating directly to matrix without prior selection
  useEffect(() => {
    if (activeSection === 'matrix' && !matrixStandardId && pipelineStates.length > 0) {
      setMatrixStandardId(pipelineStates[0].standardId);
    }
  }, [activeSection, matrixStandardId, pipelineStates]);

  if (!section) {
    return <Navigate to={`/project/${projectId}/compliance/pipeline`} replace />;
  }

  if (!projectId) {
    return <Navigate to="/" replace />;
  }

  const showStepper = PIPELINE_SECTIONS.has(activeSection);

  return (
    <div className="flex h-full bg-[var(--surface-base)]">
      <ComplianceSidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">
          <button
            onClick={() => navigate(`/project/${projectId}`)}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition mb-4"
          >
            <ArrowLeft size={16} />
            Back to Architecture
          </button>

          {/* Pipeline Stepper — visible on compliance pipeline sections */}
          {showStepper && <PipelineStepper />}

          {/* Compliance Pipeline sections */}
          {activeSection === 'pipeline' && <CompliancePipelineWizard />}

          {activeSection === 'portfolio' && <CompliancePortfolioView />}

          {activeSection === 'standards' && (
            <StandardsManager
              onAnalyze={(stdId, secIds) => {
                setMatrixStandardId(stdId);
                setMatrixSectionIds(secIds);
                setMatrixAutoSuggest(true);
                navigate(`/project/${projectId}/compliance/matrix`);
              }}
              onMatrixView={(stdId, secIds) => {
                setMatrixStandardId(stdId);
                setMatrixSectionIds(secIds);
                setMatrixAutoSuggest(false);
                navigate(`/project/${projectId}/compliance/matrix`);
              }}
            />
          )}

          {activeSection === 'matrix' && matrixStandardId && (
            <ComplianceMatrix
              standardId={matrixStandardId}
              sectionIds={matrixSectionIds.length > 0 ? matrixSectionIds : undefined}
              onBack={() => navigate(`/project/${projectId}/compliance/standards`)}
              autoSuggest={matrixAutoSuggest}
            />
          )}

          {activeSection === 'matrix' && !matrixStandardId && (
            <div className="text-center py-12 text-[var(--text-tertiary)]">
              <p className="text-sm">Select a standard first in the Standards section.</p>
              <button
                onClick={() => navigate(`/project/${projectId}/compliance/standards`)}
                className="mt-3 text-xs text-[#7c3aed] hover:underline"
              >
                Go to Standards
              </button>
            </div>
          )}

          {activeSection === 'policies' && <PolicyDraftReview />}

          {activeSection === 'roadmap' && <RoadmapPanel />}

          {activeSection === 'elements' && <SuggestedElements />}

          {activeSection === 'progress' && (
            <ComplianceProgressChart projectId={projectId} />
          )}

          {activeSection === 'audit' && (
            <AuditReadinessDashboard projectId={projectId} />
          )}

          {/* Governance sections */}
          {activeSection === 'compliance-dashboard' && <ComplianceDashboard />}

          {activeSection === 'approvals' && <ApprovalWorkflow />}

          {activeSection === 'policy-mgr' && <PolicyManager />}

          {activeSection === 'audit-trail' && <AuditTrail />}
        </div>
      </div>
    </div>
  );
}
