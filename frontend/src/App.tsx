import { Navigate, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import AiApiKeysPage from './pages/AiApiKeysPage';
import AiTest from './pages/AiTest';
import EduTutorPage from './pages/EduTutorPage';
import PromptLibraryPage from './pages/PromptLibraryPage';
import HistoryPage from './pages/HistoryPage';
import AgentsPage from './pages/AgentsPage';
import ComparePage from './pages/ComparePage';
import ImageGenPage from './pages/ImageGenPage';
import MediaSummarizePage from './pages/MediaSummarizePage';
import ContentRepurposePage from './pages/ContentRepurposePage';
import MainLayout from './layouts/MainLayout';
import { UnderDevelopmentPage, VersionLayout } from './pages/versions';
import ProtectedRoute from './components/ProtectedRoute';
import AuthPage from './pages/AuthPage';

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />

      <Route element={<ProtectedRoute />}>
        {/* ── Main App Routes (Wrapped in MainLayout) ── */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/settings/api-keys" element={<AiApiKeysPage />} />
          <Route path="/ai-core" element={<AiTest />} />
          <Route path="/education-tutor" element={<EduTutorPage />} />
          <Route path="/ui/ai-test" element={<Navigate to="/ai-core" replace />} />
          <Route path="/prompts" element={<PromptLibraryPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/image-gen" element={<ImageGenPage />} />
          <Route path="/media-summarize" element={<MediaSummarizePage />} />
          <Route path="/content-repurpose" element={<ContentRepurposePage />} />
          <Route path="/cross-platform-repurpose" element={<Navigate to="/content-repurpose" replace />} />

          {/* Experimental Legacy Version Routes (also wrapped in main layout for now if they share it)
              Note: The original code wrapped these in the main structure.
              If they need the main header/sidebar, they stay here.
          */}
          <Route path="/V_main" element={<VersionLayout versionName="V_main" />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="ai-core" element={<AiTest />} />
            <Route path="education-tutor" element={<EduTutorPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="image-gen" element={<ImageGenPage />} />
            <Route path="media-summarize" element={<MediaSummarizePage />} />
            <Route path="content-repurpose" element={<ContentRepurposePage />} />
            <Route path="prompts" element={<PromptLibraryPage />} />
            <Route path="settings/api-keys" element={<AiApiKeysPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="*" element={<UnderDevelopmentPage />} />
          </Route>

        </Route>
      </Route>
    </Routes>
  );
}
