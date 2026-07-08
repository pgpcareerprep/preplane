import { Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider } from "@/lib/rolesContext";
import { ViewerProvider } from "@/lib/viewerContext";
import { WorkspaceViewProvider } from "@/lib/workspaceViewContext";
import { CohortProgramFilterProvider } from "@/lib/cohortProgramFilterContext";
import { LmpViewingProvider } from "@/lib/lmpViewingContext";
import { LmpChatProvider } from "@/lib/lmpChatContext";
import { LmpCommentsDrawer } from "@/components/lmp/LmpCommentsDrawer";
import { ThemeProvider } from "@/lib/themeContext";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate, RouteRoleGate } from "@/components/auth/AuthGate";
import { lazyPage } from "@/lib/lazyWithChunkReload";

// Eager: tiny pages shown before auth resolves
import NotFound from "./pages/NotFound.tsx";
import LoginPage from "./pages/LoginPage";

// Lazy: every route-level page gets its own chunk
const DashboardPage      = lazyPage(() => import("./pages/DashboardPage"));
const LmpBoardPage       = lazyPage(() => import("./pages/LmpBoardPage"));
const LmpDetailPage      = lazyPage(() => import("./pages/LmpDetailPage"));
const CreateLmpPage      = lazyPage(() => import("./pages/CreateLmpPage"));
const PocBoardPage       = lazyPage(() => import("./pages/PocBoardPage"));
const CopilotPage        = lazyPage(() => import("./pages/CopilotPage"));
const MentorsPage        = lazyPage(() => import("./pages/MentorsPage"));
const MentorDetailPage   = lazyPage(() => import("./pages/MentorDetailPage"));
const MentorFeedbackPage = lazyPage(() => import("./pages/MentorFeedbackPage"));
const DataSourcesPage    = lazyPage(() => import("./pages/DataSourcesPage"));
const StudentFeedbackPage= lazyPage(() => import("./pages/StudentFeedbackPage"));
const AlumniPage         = lazyPage(() => import("./pages/AlumniPage"));
const StudentDetailPage  = lazyPage(() => import("./pages/StudentDetailPage"));
const HistoryPage        = lazyPage(() => import("./pages/ImportHistoryPage"));

// Lazy: mobile quick-actions PWA (no AppShell)
const QuickActionsPage   = lazyPage(() => import("./pages/QuickActionsPage"));

// Lazy: settings layout + sub-pages
const SettingsLayout     = lazyPage(() =>
  import("@/components/settings/SettingsLayout").then((m) => ({ default: m.SettingsLayout })),
);
const GeneralPage        = lazyPage(() => import("./pages/settings/GeneralPage"));
const ScoringWeightsPage = lazyPage(() => import("./pages/settings/ScoringWeightsPage"));
const PocDomainsPage     = lazyPage(() => import("./pages/settings/PocDomainsPage"));
const FeedbackFormsPage  = lazyPage(() => import("./pages/settings/FeedbackFormsPage"));
const UserManagementPage = lazyPage(() => import("./pages/settings/UserManagementPage"));
const NotificationsPage  = lazyPage(() => import("./pages/settings/NotificationsPage"));
const KnowledgeBasePage  = lazyPage(() => import("./pages/settings/KnowledgeBasePage"));
const LmpGuidePage       = lazyPage(() => import("./pages/settings/LmpGuidePage"));

// Minimal full-screen loader shown while a lazy chunk downloads
function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
        <RoleProvider>
          <ViewerProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/feedback/:token" element={<Suspense fallback={<PageLoader />}><StudentFeedbackPage /></Suspense>} />
            {/* Mobile PWA quick-actions — no AppShell, no desktop providers */}
            <Route path="/quick/*" element={
              <AuthGate>
                <Suspense fallback={<PageLoader />}>
                  <QuickActionsPage />
                </Suspense>
              </AuthGate>
            } />
            {/* Protected routes */}
            <Route path="*" element={
              <AuthGate>
                <WorkspaceViewProvider>
                <CohortProgramFilterProvider>
                <LmpViewingProvider>
                <LmpChatProvider>
                  <AppShell><Suspense fallback={<PageLoader />}><AppRoutes /></Suspense></AppShell>
                  <LmpCommentsDrawer />
                </LmpChatProvider>
                </LmpViewingProvider>
                </CohortProgramFilterProvider>
                </WorkspaceViewProvider>
              </AuthGate>
            } />
          </Routes>
          </ViewerProvider>
        </RoleProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/dashboard" element={<DashboardPage />} />

    {/* LMP */}
    <Route path="/lmp" element={<LmpBoardPage />} />
    <Route path="/lmp/:id" element={<LmpDetailPage />} />

    {/* Process creation — admin + allocator only */}
    <Route path="/processes" element={<Navigate to="/lmp" replace />} />
    <Route path="/processes/new" element={
      <RouteRoleGate allowed={["admin", "allocator"]}>
        <CreateLmpPage />
      </RouteRoleGate>
    } />
    <Route path="/processes/:id" element={<LmpDetailPage />} />
    <Route path="/poc/:pocKey" element={<PocBoardPage />} />

    {/* Legacy redirects */}
    <Route path="/requisitions" element={<Navigate to="/lmp" replace />} />
    <Route path="/requisitions/new" element={<Navigate to="/processes/new" replace />} />
    <Route path="/requisitions/:id" element={<Navigate to="/lmp" replace />} />

    {/* Shared routes */}
    <Route path="/copilot" element={<CopilotPage />} />
    {/* /copilot/insights now redirects below into the Data Sources tab */}
    <Route path="/mentors" element={<MentorsPage />} />
    <Route path="/mentors/:id" element={<MentorDetailPage />} />
    <Route path="/alumni" element={<AlumniPage />} />
    <Route path="/feedback" element={<MentorFeedbackPage />} />
    <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />

    {/* Shared repository route; DataSourcesPage keeps non-admin access read-only. */}
    <Route path="/data-sources" element={
      <RouteRoleGate allowed={["admin", "allocator", "poc"]}>
        <DataSourcesPage />
      </RouteRoleGate>
    } />
    <Route path="/import-history" element={
      <RouteRoleGate allowed={["admin"]}>
        <HistoryPage />
      </RouteRoleGate>
    } />
    <Route path="/students" element={<Navigate to="/data-sources?tab=sources" replace />} />
    <Route path="/students/:rollNo" element={
      <RouteRoleGate allowed={["admin"]}>
        <StudentDetailPage />
      </RouteRoleGate>
    } />
    {/* Legacy redirects for moved pages — students/pocs/domains live inside the Sources tab */}
    <Route path="/pocs" element={<Navigate to="/data-sources?tab=sources" replace />} />
    <Route path="/domains" element={<Navigate to="/data-sources?tab=sources" replace />} />
    
    <Route path="/audit-log" element={<Navigate to="/data-sources?tab=audit-log" replace />} />
    <Route path="/copilot/insights" element={<Navigate to="/data-sources?tab=copilot-insights" replace />} />
    <Route path="/ai-usage" element={<Navigate to="/data-sources?tab=copilot-insights" replace />} />

    <Route path="/settings" element={
      <RouteRoleGate allowed={["admin", "allocator", "poc"]}>
        <SettingsLayout />
      </RouteRoleGate>
    }>
      <Route index element={<GeneralPage />} />
      <Route path="scoring" element={<RouteRoleGate allowed={["admin", "allocator", "poc"]}><ScoringWeightsPage /></RouteRoleGate>} />
      <Route path="poc-domains" element={<RouteRoleGate allowed={["admin", "allocator"]}><PocDomainsPage /></RouteRoleGate>} />
      <Route path="feedback" element={<RouteRoleGate allowed={["admin", "allocator", "poc"]}><FeedbackFormsPage /></RouteRoleGate>} />
      <Route path="users" element={
        <RouteRoleGate allowed={["admin"]}>
          <UserManagementPage />
        </RouteRoleGate>
      } />
      
      <Route path="notifications" element={<RouteRoleGate allowed={["admin", "allocator", "poc"]}><NotificationsPage /></RouteRoleGate>} />
      <Route path="knowledge" element={
        <RouteRoleGate allowed={["admin"]}>
          <KnowledgeBasePage />
        </RouteRoleGate>
      } />
      <Route path="lmp-guide" element={<RouteRoleGate allowed={["admin", "allocator", "poc"]}><LmpGuidePage /></RouteRoleGate>} />
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;
