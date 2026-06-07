import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import { RoleProvider } from "@/lib/rolesContext";
import { WorkspaceViewProvider } from "@/lib/workspaceViewContext";
import { LmpViewingProvider } from "@/lib/lmpViewingContext";
import { LmpChatProvider } from "@/lib/lmpChatContext";
import { LmpCommentsDrawer } from "@/components/lmp/LmpCommentsDrawer";
import { ThemeProvider } from "@/lib/themeContext";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate, RouteRoleGate } from "@/components/auth/AuthGate";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import CreateLmpPage from "./pages/CreateLmpPage";
import LmpBoardPage from "./pages/LmpBoardPage";
import LmpDetailPage from "./pages/LmpDetailPage";
import PocBoardPage from "./pages/PocBoardPage";
import CopilotPage from "./pages/CopilotPage";
import MentorsPage from "./pages/MentorsPage";
import MentorDetailPage from "./pages/MentorDetailPage";
import MentorFeedbackPage from "./pages/MentorFeedbackPage";
import DataSourcesPage from "./pages/DataSourcesPage";
import StudentFeedbackPage from "./pages/StudentFeedbackPage";
import AlumniPage from "./pages/AlumniPage";
import StudentDetailPage from "./pages/StudentDetailPage";
import HistoryPage from "./pages/ImportHistoryPage";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import GeneralPage from "./pages/settings/GeneralPage";
import ScoringWeightsPage from "./pages/settings/ScoringWeightsPage";
import PocDomainsPage from "./pages/settings/PocDomainsPage";
import FeedbackFormsPage from "./pages/settings/FeedbackFormsPage";
import UserManagementPage from "./pages/settings/UserManagementPage";
import NotificationsPage from "./pages/settings/NotificationsPage";
import KnowledgeBasePage from "./pages/settings/KnowledgeBasePage";
import LmpGuidePage from "./pages/settings/LmpGuidePage";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
        <RoleProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/feedback/:token" element={<StudentFeedbackPage />} />
            {/* Protected routes */}
            <Route path="*" element={
              <AuthGate>
                <WorkspaceViewProvider>
                <LmpViewingProvider>
                <LmpChatProvider>
                  <AppShell><AppRoutes /></AppShell>
                  <LmpCommentsDrawer />
                </LmpChatProvider>
                </LmpViewingProvider>
                </WorkspaceViewProvider>
              </AuthGate>
            } />
          </Routes>
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

    {/* Admin-only routes */}
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
      <Route path="scoring" element={<ScoringWeightsPage />} />
      <Route path="poc-domains" element={<PocDomainsPage />} />
      <Route path="feedback" element={<FeedbackFormsPage />} />
      <Route path="users" element={
        <RouteRoleGate allowed={["admin"]}>
          <UserManagementPage />
        </RouteRoleGate>
      } />
      
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="knowledge" element={
        <RouteRoleGate allowed={["admin"]}>
          <KnowledgeBasePage />
        </RouteRoleGate>
      } />
      <Route path="lmp-guide" element={<LmpGuidePage />} />
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;
