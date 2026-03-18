import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import ErrorBoundary from './components/ui/ErrorBoundary';
import MainLayout from './components/ui/MainLayout';
import AuthLayout from './components/security/AuthLayout';
import LoginPage from './components/security/LoginPage';
import OAuthCallbackPage from './components/security/OAuthCallbackPage';
import ResetPasswordPage from './components/security/ResetPasswordPage';
import DashboardPage from './components/ui/DashboardPage';
import ProjectView from './components/ui/ProjectView';
import SettingsPage from './components/settings/SettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="project/:projectId" element={<ProjectView />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:section" element={<SettingsPage />} />
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}
