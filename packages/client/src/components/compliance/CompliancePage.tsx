import { useState, useEffect } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ComplianceSidebar, { SECTIONS, GROUPS, SUBJECTS } from './ComplianceSidebar';
import ConformanceHub from './ConformanceHub';
import PipelineStepper from './PipelineStepper';
import AssessWorkflow from './AssessWorkflow';
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
import RemediateGateway from './RemediateGateway';
import GapAnalysis from './GapAnalysis';
import RegulationsPanel from './RegulationsPanel';
// Governance components
import ComplianceDashboard from '../governance/ComplianceDashboard';
import ApprovalWorkflow from '../governance/ApprovalWorkflow';
import PolicyManager from '../governance/PolicyManager';
import AuditTrail from '../governance/AuditTrail';
import CertificationQueue from '../governance/CertificationQueue';

// Sections that belong to the compliance pipeline (show stepper)
const PIPELINE_SECTIONS = new Set([
  'pipeline', 'portfolio', 'standards', 'matrix', 'remediate', 'policies', 'roadmap', 'elements', 'progress', 'audit',
]);

// AC-5 (ADR-0003): every view states subject + norm explicitly in its header.
const GATE_NORM: Record<'cover' | 'enforce' | 'attest', string> = {
  cover: 'External standards & regulations',
  enforce: 'Internal policies',
  attest: 'Statutory record requirements (GDPR Art. 30)',
};

function SubjectNormHeader({ sectionId }: { sectionId: string }) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return null;
  const group = GROUPS.find((g) => g.key === section.group);
  const subject = group && SUBJECTS.find((s) => s.key === group.subject);
  if (!group || !subject) return null;
  return (
    <div
      data-testid="subject-norm-header"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-[10px] text-[var(--text-tertiary)]"
    >
      <span className="font-semibold text-[var(--text-secondary)]">{subject.label}</span>
      <span>
        <span className="uppercase tracking-wider">Subject:</span>{' '}
        <span className="text-[var(--text-secondary)]">{subject.hint.replace('Subject: ', '')}</span>
      </span>
      <span>
        <span className="uppercase tracking-wider">Norm:</span>{' '}
        <span className="text-[var(--text-secondary)]">{GATE_NORM[group.key]}</span>
      </span>
    </div>
  );
}

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
    // ADR-0003: the Conformance Hub is the entry router
    return <Navigate to={`/project/${projectId}/compliance/hub`} replace />;
  }

  if (!projectId) {
    return <Navigate to="/dashboard" replace />;
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

          {/* AC-5 — subject + norm stated explicitly on every gate view */}
          <SubjectNormHeader sectionId={activeSection} />

          {/* Pipeline Stepper — visible on compliance pipeline sections */}
          {showStepper && <PipelineStepper />}

          {/* Conformance Hub — entry router (ADR-0003) */}
          {activeSection === 'hub' && <ConformanceHub />}

          {/* UC-WFCOMP-001 — assess a single workflow against GDPR Art. 30 */}
          {activeSection === 'assess' && <AssessWorkflow />}

          {/* Compliance Pipeline sections */}
          {activeSection === 'pipeline' && <CompliancePipelineWizard />}

          {activeSection === 'portfolio' && <CompliancePortfolioView />}

          {activeSection === 'standards' && (
            <>
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
              {/* THE-390 P4b — corpus laws enter the pipeline from here */}
              <RegulationsPanel />
            </>
          )}

          {activeSection === 'matrix' && matrixStandardId && (
            <ComplianceMatrix
              standardId={matrixStandardId}
              sectionIds={matrixSectionIds.length > 0 ? matrixSectionIds : undefined}
              onBack={() => navigate(`/project/${projectId}/compliance/standards`)}
              onNext={() => navigate(`/project/${projectId}/compliance/remediate`)}
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

          {activeSection === 'remediate' && <RemediateGateway />}

          {activeSection === 'policies' && <PolicyDraftReview />}

          {activeSection === 'roadmap' && <RoadmapPanel />}

          {activeSection === 'elements' && <SuggestedElements />}

          {activeSection === 'progress' && (
            <ComplianceProgressChart projectId={projectId} />
          )}

          {activeSection === 'audit' && (
            <AuditReadinessDashboard projectId={projectId} />
          )}

          {/* UC-GAP-001 (THE-307) — gap analysis: what is still open? */}
          {activeSection === 'gaps' && <GapAnalysis />}

          {/* Governance sections */}
          {activeSection === 'compliance-dashboard' && <ComplianceDashboard />}

          {activeSection === 'approvals' && <ApprovalWorkflow />}

          {activeSection === 'policy-mgr' && <PolicyManager />}

          {activeSection === 'audit-trail' && <AuditTrail />}

          {activeSection === 'certify' && <CertificationQueue />}
        </div>
      </div>
    </div>
  );
}
