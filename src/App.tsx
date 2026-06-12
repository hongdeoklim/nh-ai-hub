import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './components/auth/AuthProvider'
import { useAuth } from './components/auth/useAuth'
import { MainLayout } from './components/layout/MainLayout'
import { ReloadPrompt } from './components/layout/ReloadPrompt'
import { RouteLoadingFallback } from './components/layout/RouteLoadingFallback'
import { AppUiProvider } from './contexts/AppUiContext'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { PrivateChatHomeRedirect } from './pages/PrivateChatHomeRedirect'
import { AdminRoute } from './routes/AdminRoute'
import { PwaInstallPrompt } from './components/pwa/PwaInstallPrompt'
const Scrapbook = lazy(() =>
  import('./pages/Scrapbook').then((m) => ({ default: m.Scrapbook })),
)
const ReferenceRoom = lazy(() =>
  import('./pages/ReferenceRoom').then((m) => ({ default: m.ReferenceRoom })),
)
const AiSlidesPage = lazy(() =>
  import('./pages/AiSlidesPage').then((m) => ({ default: m.AiSlidesPage })),
)
const AiSheetsPage = lazy(() =>
  import('./pages/AiSheetsPage').then((m) => ({ default: m.AiSheetsPage })),
)
const UniverOfficePage = lazy(() =>
  import('./pages/UniverOfficePage').then((m) => ({
    default: m.UniverOfficePage,
  })),
)
const AiDesignerPage = lazy(() =>
  import('./pages/AiDesignerPage').then((m) => ({ default: m.AiDesignerPage })),
)
const WorkflowsPage = lazy(() =>
  import('./pages/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage })),
)
const TeamsPage = lazy(() =>
  import('./pages/TeamsPage').then((m) => ({ default: m.TeamsPage })),
)
const TeamDetailPage = lazy(() =>
  import('./pages/TeamDetailPage').then((m) => ({ default: m.TeamDetailPage })),
)
const TeamSharedChatPage = lazy(() =>
  import('./pages/TeamSharedChatPage').then((m) => ({
    default: m.TeamSharedChatPage,
  })),
)
const GoogleIntegrationCallback = lazy(() =>
  import('./pages/GoogleIntegrationCallback').then((m) => ({
    default: m.GoogleIntegrationCallback,
  })),
)
const MicrosoftIntegrationCallback = lazy(() =>
  import('./pages/MicrosoftIntegrationCallback').then((m) => ({
    default: m.MicrosoftIntegrationCallback,
  })),
)
const WorkspaceIntegrationsPage = lazy(() =>
  import('./pages/WorkspaceIntegrationsPage').then((m) => ({
    default: m.WorkspaceIntegrationsPage,
  })),
)
const NotebookWorkspace = lazy(() =>
  import('./pages/NotebookWorkspace').then((m) => ({
    default: m.NotebookWorkspace,
  })),
)

const AdminLayout = lazy(() =>
  import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
)
const ModernAdminDashboard = lazy(() =>
  import('./pages/admin/ModernAdminDashboard').then((m) => ({
    default: m.ModernAdminDashboard,
  })),
)
const EmployeeCRUD = lazy(() =>
  import('./pages/admin/EmployeeCRUD').then((m) => ({
    default: m.EmployeeCRUD,
  })),
)
const AdminTokenRequestsPage = lazy(() =>
  import('./pages/AdminTokenRequestsPage').then((m) => ({
    default: m.AdminTokenRequestsPage,
  })),
)
const PluginManager = lazy(() =>
  import('./pages/admin/PluginManager').then((m) => ({
    default: m.PluginManager,
  })),
)
const AiLab = lazy(() =>
  import('./pages/admin/AiLab').then((m) => ({ default: m.AiLab })),
)
const ChatAudit = lazy(() =>
  import('./pages/admin/ChatAudit').then((m) => ({ default: m.ChatAudit })),
)
const KnowledgeAdmin = lazy(() =>
  import('./pages/admin/KnowledgeAdmin').then((m) => ({
    default: m.KnowledgeAdmin,
  })),
)
const TemplateManager = lazy(() =>
  import('./pages/admin/TemplateManager').then((m) => ({
    default: m.TemplateManager,
  })),
)
const TeamManager = lazy(() =>
  import('./pages/admin/TeamManager').then((m) => ({
    default: m.TeamManager,
  })),
)
const ActivityLogViewer = lazy(() =>
  import('./pages/admin/ActivityLogViewer').then((m) => ({
    default: m.ActivityLogViewer,
  })),
)
const WeeklyTrendReport = lazy(() =>
  import('./pages/admin/WeeklyTrendReport').then((m) => ({
    default: m.WeeklyTrendReport,
  })),
)
const ModelManagement = lazy(() =>
  import('./components/auth/admin/ModelManagement').then((m) => ({
    default: m.ModelManagement,
  })),
)

function AuthSpinner() {
  return (
    <div className="app-shell flex min-h-dvh w-full items-center justify-center bg-slate-100 dark:bg-slate-950">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
        인증 정보를 불러오는 중…
      </p>
    </div>
  )
}

function RequireAuth() {
  const { session, loading } = useAuth()
  if (loading) return <AuthSpinner />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}

function LazyRouteOutlet() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Outlet />
    </Suspense>
  )
}

function LazyAdminOutlet() {
  return (
    <Suspense
      fallback={
        <RouteLoadingFallback label="관리자 콘솔을 불러오는 중…" />
      }
    >
      <Outlet />
    </Suspense>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<MainLayout />}>
          <Route index element={<PrivateChatHomeRedirect />} />
          <Route path="chat/:threadId" element={<Dashboard />} />

          <Route element={<LazyRouteOutlet />}>
            <Route path="scrapbook" element={<Scrapbook />} />
            <Route path="ai-slides" element={<AiSlidesPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="ai-designer" element={<AiDesignerPage />} />
            <Route path="ai-sheets" element={<AiSheetsPage />} />
            <Route path="ai-office" element={<UniverOfficePage />} />
            <Route path="reference-room" element={<ReferenceRoom />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="teams/:teamId" element={<TeamDetailPage />} />
            <Route
              path="teams/:teamId/chat/:conversationId"
              element={<TeamSharedChatPage />}
            />
            <Route
              path="oauth/google-integration"
              element={<GoogleIntegrationCallback />}
            />
            <Route
              path="workspace-tools"
              element={<WorkspaceIntegrationsPage />}
            />
            <Route path="notebook" element={<NotebookWorkspace />} />
            <Route
              path="oauth/microsoft-integration"
              element={<MicrosoftIntegrationCallback />}
            />
          </Route>
        </Route>

        <Route path="admin" element={<AdminRoute />}>
          <Route element={<LazyAdminOutlet />}>
            <Route element={<AdminLayout />}>
              <Route index element={<ModernAdminDashboard />} />
              <Route path="employees" element={<EmployeeCRUD />} />
              <Route path="teams" element={<TeamManager />} />
              <Route path="activity-logs" element={<ActivityLogViewer />} />
              <Route path="weekly-reports" element={<WeeklyTrendReport />} />
              <Route path="tokens" element={<Navigate to="/admin/employees" replace />} />
              <Route path="token-requests" element={<AdminTokenRequestsPage />} />
              <Route path="plugins" element={<PluginManager />} />
              <Route path="lab" element={<AiLab />} />
              <Route path="audit" element={<ChatAudit />} />
              <Route path="reference" element={<KnowledgeAdmin />} />
              <Route path="templates" element={<TemplateManager />} />
              <Route path="models" element={<ModelManagement />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppUiProvider>
        <AppRoutes />
        <ReloadPrompt />
        <PwaInstallPrompt />
      </AppUiProvider>
    </AuthProvider>
  )
}
