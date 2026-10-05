import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { RepositoriesPage } from './pages/RepositoriesPage';
import { RepositoryDetailPage } from './pages/RepositoryDetailPage';
import { AnalysisPage } from './pages/AnalysisPage';
import {
  AnalysesListPage,
  SecurityPage,
  HistoryPage,
  SettingsPage
} from './pages/OtherPages';
import { Spinner } from './components/ui';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/dashboard" element={
        <RequireAuth><DashboardPage /></RequireAuth>
      } />

      <Route path="/repositories" element={
        <RequireAuth><RepositoriesPage /></RequireAuth>
      } />

      <Route path="/repositories/:id" element={
        <RequireAuth><RepositoryDetailPage /></RequireAuth>
      } />

      <Route path="/analyses" element={
        <RequireAuth><AnalysesListPage /></RequireAuth>
      } />

      <Route path="/analyses/:id" element={
        <RequireAuth><AnalysisPage /></RequireAuth>
      } />

      <Route path="/security" element={
        <RequireAuth><SecurityPage /></RequireAuth>
      } />

      <Route path="/history" element={
        <RequireAuth><HistoryPage /></RequireAuth>
      } />

      <Route path="/settings" element={
        <RequireAuth><SettingsPage /></RequireAuth>
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
