import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import ErrorBoundary from './components/ui/ErrorBoundary';
import MainLayout from './components/ui/MainLayout';
import AuthLayout from './components/security/AuthLayout';
import LoginPage from './components/security/LoginPage';
import OAuthCallbackPage from './components/security/OAuthCallbackPage';
import ResetPasswordPage from './components/security/ResetPasswordPage';
import InvitationPage from './components/security/InvitationPage';
import DashboardPage from './components/ui/DashboardPage';
import ProjectView from './components/ui/ProjectView';
import SettingsPage from './components/settings/SettingsPage';
import CompliancePage from './components/compliance/CompliancePage';
import AnalyzePage from './components/analyze/AnalyzePage';
import BlueprintWizard from './components/blueprint/BlueprintWizard';
import PortfolioPage from './components/portfolio/PortfolioPage';
import StakeholderDashboard from './components/portfolio/StakeholderDashboard';
import AIAgentInventory from './components/portfolio/AIAgentInventory';
import SharedSnapshotView from './components/portfolio/SharedSnapshotView';
import LandingPage from './components/landing/LandingPage';
import LegalPage from './components/landing/LegalPage';
import HealthReport from './components/healthcheck/HealthReport';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      {/* Public routes — no auth required */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<LegalPage />} />
      <Route path="/terms" element={<LegalPage />} />
      <Route path="/imprint" element={<LegalPage />} />
      <Route path="/report/:reportId" element={<HealthReport />} />
      <Route path="/shared/:token" element={<SharedSnapshotView />} />

      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/invitations/:token" element={<InvitationPage />} />

      {/* Protected app routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/project/:projectId" element={<ProjectView />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="/project/:projectId/blueprint" element={<BlueprintWizard />} />
        <Route path="/project/:projectId/portfolio" element={<PortfolioPage />} />
        <Route path="/project/:projectId/stakeholder" element={<StakeholderDashboard />} />
        <Route path="/project/:projectId/ai-agents" element={<AIAgentInventory />} />
        <Route path="/project/:projectId/compliance" element={<CompliancePage />} />
        <Route path="/project/:projectId/compliance/:section" element={<CompliancePage />} />
        <Route path="/project/:projectId/analyze" element={<AnalyzePage />} />
        <Route path="/project/:projectId/analyze/:section" element={<AnalyzePage />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}
