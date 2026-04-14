import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, Users, Bot } from 'lucide-react';
import AnalyzeSidebar from './AnalyzeSidebar';
import AnalyzeStepper from './AnalyzeStepper';
import AnalyzeDashboard from './AnalyzeDashboard';
// Existing analytics components
import RiskDashboard from '../analytics/RiskDashboard';
import ImpactAnalysis from '../analytics/ImpactAnalysis';
import CostAnalysisView from './CostAnalysisView';
import MonteCarloSimulation from '../simulation/MonteCarloSimulation';
import ScenarioDashboard from '../analytics/ScenarioDashboard';
import CapacityPlanning from '../simulation/CapacityPlanning';
import RoadmapPanel from '../analytics/RoadmapPanel';
import ConnectorPanel from '../import/ConnectorPanel';
import OraclePanel from '../oracle/OraclePanel';
import SimulationPanel from '../simulation/SimulationPanel';

export default function AnalyzePage() {
  const { projectId, section } = useParams<{ projectId: string; section?: string }>();
  const navigate = useNavigate();
  const activeSection = section || 'dashboard';

  if (!section) {
    return <Navigate to={`/project/${projectId}/analyze/dashboard`} replace />;
  }

  if (!projectId) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-full bg-[var(--surface-base)]">
      <AnalyzeSidebar />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">
          <button
            onClick={() => navigate(`/project/${projectId}`)}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-white transition mb-4"
          >
            <ArrowLeft size={16} />
            Back to Architecture
          </button>

          <AnalyzeStepper />

          {activeSection === 'dashboard' && <AnalyzeDashboard />}

          {activeSection === 'risk' && <RiskDashboard />}

          {activeSection === 'impact' && <ImpactAnalysis />}

          {activeSection === 'cost' && <CostAnalysisView />}

          {activeSection === 'monte-carlo' && <MonteCarloSimulation />}

          {activeSection === 'scenarios' && <ScenarioDashboard />}

          {activeSection === 'capacity' && <CapacityPlanning />}

          {activeSection === 'oracle' && <OraclePanel />}

          {activeSection === 'mirofish' && <SimulationPanel />}

          {activeSection === 'roadmap' && <RoadmapPanel />}

          {activeSection === 'portfolio' && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Portfolio Management</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Portfolio Overview', desc: 'Lifecycle, risk & status across all elements', icon: Briefcase, path: `/project/${projectId}/portfolio` },
                  { label: 'Stakeholder Dashboard', desc: 'Stakeholder mapping & communication', icon: Users, path: `/project/${projectId}/stakeholder` },
                  { label: 'AI Agent Inventory', desc: 'AI agents, capabilities & governance', icon: Bot, path: `/project/${projectId}/ai-agents` },
                ].map((card) => (
                  <button
                    key={card.path}
                    onClick={() => navigate(card.path)}
                    className="flex flex-col items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-left transition hover:border-[#7c3aed]/50 hover:bg-[var(--surface-overlay)]"
                  >
                    <card.icon size={24} className="text-[#a78bfa]" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{card.label}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">{card.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'integrations' && <ConnectorPanel projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}
