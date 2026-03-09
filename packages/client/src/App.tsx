import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import MainLayout from './components/ui/MainLayout';
import LoginPage from './components/security/LoginPage';
import OAuthCallbackPage from './components/security/OAuthCallbackPage';
import DashboardPage from './components/ui/DashboardPage';
import ProjectView from './components/ui/ProjectView';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
      </Route>
    </Routes>
  );
}
