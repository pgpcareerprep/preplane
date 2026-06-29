import { lazy, Suspense, useMemo, useState } from "react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database, GraduationCap, Loader2, RefreshCw, Users, History, UserCheck, BarChart2, Briefcase, UserPlus, GraduationCap as StudentIcon } from "lucide-react";
import { LmpMentorAssignmentsModal } from "@/components/datasources/LmpMentorAssignmentsModal";
import { SourceCard } from "@/components/datasources/SourceCard";
import { DbSourceCard } from "@/components/datasources/DbSourceCard";
import { ExternalDiscoveryCard } from "@/components/datasources/ExternalDiscoveryCard";
import { UploadCsvModal } from "@/components/datasources/UploadCsvModal";
import { ViewAllMentorsModal } from "@/components/datasources/ViewAllMentorsModal";
import { AlumniViewAllModal } from "@/components/datasources/AlumniViewAllModal";
import { UploadHistoryModal } from "@/components/datasources/UploadHistoryModal";
import { ViewAllDomainsModal } from "@/components/datasources/ViewAllDomainsModal";
import { ViewAllPocsModal } from "@/components/datasources/ViewAllPocsModal";
import { ViewAllLmpsModal } from "@/components/datasources/ViewAllLmpsModal";
import { LmpTrackerSyncHistoryModal } from "@/components/datasources/LmpTrackerSyncHistoryModal";
import { useSyncIngest, useDataSourceStatus, useAllDomains, useAllPocProfiles, useLmpTrackerSyncHistory, useLmpProcesses, useLastSyncFailure, useSmartLmpSync } from "@/lib/hooks/useDbData";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { useRole } from "@/lib/rolesContext";
import { cn } from "@/lib/utils";
import {
  MU_TEMPLATE_HEADERS, ALU_TEMPLATE_HEADERS, STU_TEMPLATE_HEADERS, downloadCsvTemplate,
} from "@/lib/csvTemplates";
import { exportTableToCsv, exportLmpProcessesCsv, dateStamp } from "@/lib/exportCsv";

import AuditLogPageContent from "@/pages/AuditLogPage";
const AiUsagePage = lazy(() => import("@/pages/AiUsagePage"));
import { MappingInspectorModal } from "@/components/datasources/MappingInspectorModal";
import { StudentDatasetTab } from "@/components/datasources/StudentDatasetTab";


const BASE_TABS = [
  { key: "sources", label: "Sources", icon: Database },
  { key: "student-dataset", label: "Student Dataset", icon: StudentIcon },
] as const;

const ADMIN_TABS = [
  { key: "audit-log", label: "Audit Log", icon: History },
  { key: "copilot-insights", label: "AI Usage", icon: BarChart2 },
] as const;

const ALL_TABS = [...BASE_TABS, ...ADMIN_TABS] as const;

type TabKey = typeof ALL_TABS[number]["key"];

type ModalState =
  | { source: "mentor_union" | "alumni_db" | "student_db" | "poc_db"; kind: "upload" | "viewAll" | "history" }
  | { source: "domain_db" | "lmp_db" | "lmp_mentors_db"; kind: "viewAll" | "history" }
  | null;

function DataSourcesPageInner() {
  const { role } = useRole();
  const isAdmin = role === "admin";
  const canBackfillLmp = role === "admin" || role === "allocator";
  const isReadOnly = !isAdmin;
  const TABS = isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : [...BASE_TABS];

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabKey = (TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "sources");
  const setActiveTab = (tab: TabKey) => setSearchParams({ tab }, { replace: true });

  const syncIngest = useSyncIngest();
  const smartLmpSync = useSmartLmpSync();

  // Keep every card on this page live — no manual refresh needed.
  useRealtimeInvalidate("students", [["db-students"], ["db-students-with-load"], ["db-data-source-status"]]);
  useRealtimeInvalidate("mentors", [["db-all-mentors"], ["db-mentor-stats"], ["db-mentor-preview"], ["db-data-source-status"]]);
  useRealtimeInvalidate("alumni_records", [["db-all-alumni"], ["db-mentor-stats"], ["db-all-mentors"], ["db-data-source-status"]]);
  useRealtimeInvalidate("lmp_processes", [
    ["db-lmp-processes"],
    ["db-data-source-status"],
    ["db-all-domains"],
    ["db-mapped-poc-counts"],
    ["db-poc-live-loads"],
    ["db-all-poc-profiles"],
  ]);
  useRealtimeInvalidate("lmp_candidates", [
    ["db-lmp-full-view"],
    ["db-lmp-candidates-by-process"],
    ["db-lmp-candidates"],
    ["db-lmp-candidate-counts"],
  ]);
  useRealtimeInvalidate("poc_profiles", [
    ["db-all-poc-profiles"],
    ["db-poc-live-loads"],
    ["db-mapped-poc-counts"],
    ["poc_registry"],
  ]);
  useRealtimeInvalidate("domains", [
    ["db-all-domains"],
    ["db-domains"],
    ["db-mapped-poc-counts"],
  ]);
  useRealtimeInvalidate("lmp_poc_links", [
    ["db-poc-live-loads"],
    ["db-all-poc-profiles"],
    ["db-poc-switcher-list"],
  ]);


  const { data: muStatus } = useDataSourceStatus("mentor_union");
  const { data: aluStatus } = useDataSourceStatus("alumni_db");
  const { data: stuStatus } = useDataSourceStatus("student_db");
  const { data: muFail } = useLastSyncFailure("mentor_union");
  const { data: aluFail } = useLastSyncFailure("alumni_db");
  const { data: stuFail } = useLastSyncFailure("student_db");
  const { data: domainsList } = useAllDomains();
  const { data: pocsList } = useAllPocProfiles();
  const { data: trackerSyncs } = useLmpTrackerSyncHistory();
  const { data: lmpsList } = useLmpProcesses({ includeArchived: false });

  const domainCount = domainsList?.length ?? 0;
  const pocCount = pocsList?.length ?? 0;
  const lmpCount = lmpsList?.length ?? 0;

  const { data: lmpMentorCount = 0, dataUpdatedAt: lmpMentorUpdatedAt } = useQuery({
    queryKey: ["lmp_mentors_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lmp_mentors")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const lastTrackerSyncAt = useMemo(() => {
    const ok = (trackerSyncs ?? []).find((r: any) => r.status === "success");
    return ok?.created_at ?? trackerSyncs?.[0]?.created_at ?? null;
  }, [trackerSyncs]);
  const lastTrackerSyncStatus = (trackerSyncs?.[0] as any)?.status;
  const dbStatus: "synced" | "awaiting_first_sync" | "failed" = lastTrackerSyncStatus === "failed"
    ? "failed"
    : (domainCount > 0 || pocCount > 0) ? "synced" : "awaiting_first_sync";

  const [modal, setModal] = useState<ModalState>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [historicalBackfillOpen, setHistoricalBackfillOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="max-w-2xl">
          <div className="label-eyebrow mb-2">{isAdmin ? "Admin · Data" : "Repository"}</div>
          <h2 className="text-[36px] leading-[1.15] font-bold tracking-[-1px] text-n900">
            {isAdmin ? (
              <>Data <span className="text-orange-500 text-[34px] font-semibold">sources</span></>
            ) : (
              <>Repo<span className="text-orange-500 text-[34px] font-semibold">sitory</span></>
            )}
          </h2>
          <p className="mt-2 text-[14px] text-n500 leading-[1.6]">
            {isAdmin
              ? "Centralised admin database hub. Mentor Union and Alumni DB are shared globally — uploads reflect for everyone instantly."
              : "View and export centralised data sources shared across the platform."}
          </p>
        </div>
        {activeTab === "sources" && isAdmin && (
          <div className="flex items-center gap-3">
            <Link
              to="/import-history"
              className="text-[13px] font-medium text-orange-600 hover:text-orange-700 hover:underline"
            >
              View upload history →
            </Link>
            <button
              onClick={() => syncIngest.mutate("full")}
              disabled={syncIngest.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-card border border-n300 hover:bg-n50 text-n800 text-[14px] font-medium px-4 py-2.5 shadow-sm transition-colors duration-150 ease-smooth disabled:opacity-50"
            >
              {syncIngest.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" strokeWidth={1.5} />}
              {syncIngest.isPending ? "Syncing…" : "Sync All"}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-n100 p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
                activeTab === tab.key ? "bg-card text-n900 shadow-sm" : "text-n500 hover:text-n700",
              )}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "sources" && (
        <>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SourceCard
              index={0}
              icon={Users}
              iconClass="bg-teal-50 text-teal-600"
              title="Mentor Union"
              badge="MU"
              badgeClass="bg-teal-50 text-teal-600 border-teal-200"
              status={(muStatus?.current_status as any) || "awaiting_first_sync"}
              count={muStatus?.total_records ?? 0}
              noun="mentors"
              lastUploadedAt={muStatus?.last_uploaded_at}
              uploadedBy={muStatus?.last_uploaded_by_admin_email}
              isAdmin={isAdmin}
              canDownloadTemplate={true}
              showHistory={isAdmin}
              onUpload={() => setModal({ source: "mentor_union", kind: "upload" })}
              onDownloadTemplate={() => downloadCsvTemplate(MU_TEMPLATE_HEADERS, "mentor_union_template.csv")}
              onViewAll={() => setModal({ source: "mentor_union", kind: "viewAll" })}
              onViewHistory={() => setModal({ source: "mentor_union", kind: "history" })}
              viewAllLabel="View All Mentors"
              failureReason={muFail?.message}
              onExport={() => exportTableToCsv("mentors", `mentors_${dateStamp()}.csv`, { orderBy: "name" })}
            />


            <SourceCard
              index={1}
              icon={GraduationCap}
              iconClass="bg-sage-50 text-sage-600"
              title="Alumni DB"
              badge="ALU"
              badgeClass="bg-sage-50 text-sage-600 border-sage-200"
              status={(aluStatus?.current_status as any) || "awaiting_first_sync"}
              count={aluStatus?.total_records ?? 0}
              noun="alumni"
              lastUploadedAt={aluStatus?.last_uploaded_at}
              uploadedBy={aluStatus?.last_uploaded_by_admin_email}
              isAdmin={isAdmin}
              canDownloadTemplate={true}
              showHistory={isAdmin}
              onUpload={() => setModal({ source: "alumni_db", kind: "upload" })}
              onDownloadTemplate={() => downloadCsvTemplate(ALU_TEMPLATE_HEADERS, "alumni_db_template.csv")}
              onViewAll={() => setModal({ source: "alumni_db", kind: "viewAll" })}
              onViewHistory={() => setModal({ source: "alumni_db", kind: "history" })}
              viewAllLabel="View All Alumni"
              failureReason={aluFail?.message}
              onExport={() => exportTableToCsv("alumni_records", `alumni_${dateStamp()}.csv`)}
            />


            <SourceCard
              index={2}
              icon={StudentIcon}
              iconClass="bg-blue-50 text-blue-600"
              title="Student Database"
              badge="STU"
              badgeClass="bg-blue-50 text-blue-600 border-blue-200"
              status={(stuStatus?.current_status as any) || "awaiting_first_sync"}
              count={stuStatus?.total_records ?? 0}
              noun="students"
              lastUploadedAt={stuStatus?.last_uploaded_at}
              uploadedBy={stuStatus?.last_uploaded_by_admin_email}
              isAdmin={isAdmin}
              canDownloadTemplate={true}
              showHistory={isAdmin}
              onUpload={() => setModal({ source: "student_db", kind: "upload" })}
              onDownloadTemplate={() => downloadCsvTemplate(STU_TEMPLATE_HEADERS, "students_template.csv")}
              onViewAll={() => setActiveTab("student-dataset")}
              onViewHistory={() => setModal({ source: "student_db", kind: "history" })}
              viewAllLabel="Open Student Dataset"
              failureReason={stuFail?.message}
              onExport={() => exportTableToCsv("students", `students_${dateStamp()}.csv`, { orderBy: "name" })}
            />


            <DbSourceCard
              index={2}
              icon={Database}
              iconClass="bg-purple-50 text-purple-600"
              title="Domain Database"
              badgeClass="bg-purple-50 text-purple-600 border-purple-200"
              status={dbStatus}
              count={domainCount}
              noun={domainCount === 1 ? "domain" : "domains"}
              lastSyncedAt={lastTrackerSyncAt}
              onViewAll={() => setModal({ source: "domain_db", kind: "viewAll" })}
              onViewHistory={() => setModal({ source: "domain_db", kind: "history" })}
              viewAllLabel="View All Domains"
              showHistory={isAdmin}
              onExport={() => exportTableToCsv("domains", `domains_${dateStamp()}.csv`, { orderBy: "name" })}
            />


            <DbSourceCard
              index={3}
              icon={UserCheck}
              iconClass="bg-orange-50 text-orange-600"
              title="POC Database"
              badgeClass="bg-orange-50 text-orange-600 border-orange-200"
              status={dbStatus}
              count={pocCount}
              noun={pocCount === 1 ? "POC" : "POCs"}
              lastSyncedAt={lastTrackerSyncAt}
              onViewAll={() => setModal({ source: "poc_db", kind: "viewAll" })}
              onViewHistory={() => setModal({ source: "poc_db", kind: "history" })}
              viewAllLabel="View All POCs"
              showHistory={isAdmin}
              onExport={() => exportTableToCsv("poc_profiles", `poc_profiles_${dateStamp()}.csv`, { orderBy: "name" })}
            />


            <DbSourceCard
              index={4}
              icon={Briefcase}
              iconClass="bg-amber-50 text-amber-600"
              title="LMP Database"
              badgeClass="bg-amber-50 text-amber-600 border-amber-200"
              status={dbStatus}
              count={lmpCount}
              noun={lmpCount === 1 ? "LMP process" : "LMP processes"}
              lastSyncedAt={lastTrackerSyncAt}
              onViewAll={() => setModal({ source: "lmp_db", kind: "viewAll" })}
              onViewHistory={() => setModal({ source: "lmp_db", kind: "history" })}
              viewAllLabel="View All LMP Processes"
              showHistory={isAdmin}
              onSync={isAdmin ? () => smartLmpSync.mutate() : undefined}
              syncing={smartLmpSync.isPending}
              onInspectMapping={isAdmin ? () => setMappingOpen(true) : undefined}
              onHistoricalBackfill={canBackfillLmp ? () => setHistoricalBackfillOpen(true) : undefined}
              onExport={() => exportLmpProcessesCsv(`lmp_processes_${dateStamp()}.csv`)}
            />


            <DbSourceCard
              index={5}
              icon={UserPlus}
              iconClass="bg-rose-50 text-rose-600"
              title="LMP Mentor Assignments"
              badgeClass="bg-rose-50 text-rose-600 border-rose-200"
              status={lmpMentorCount > 0 ? "synced" : "awaiting_first_sync"}
              count={lmpMentorCount}
              noun={lmpMentorCount === 1 ? "assignment" : "assignments"}
              lastSyncedAt={lmpMentorUpdatedAt ? new Date(lmpMentorUpdatedAt).toISOString() : null}
              onViewAll={() => setModal({ source: "lmp_mentors_db", kind: "viewAll" })}
              onViewHistory={() => setModal({ source: "lmp_mentors_db", kind: "history" })}
              viewAllLabel="View All Assignments"
              showHistory={isAdmin}
              onExport={() => exportTableToCsv("lmp_mentors", `lmp_mentor_assignments_${dateStamp()}.csv`, { orderBy: "created_at" })}
            />


            <ExternalDiscoveryCard index={6} readOnly={isReadOnly} />
          </div>

        </>
      )}

      {activeTab === "student-dataset" && (
        <StudentDatasetTab
          onUpload={isAdmin ? () => setModal({ source: "student_db", kind: "upload" }) : undefined}
        />
      )}

      {modal?.kind === "upload" && (
        <UploadCsvModal source={modal.source} open onOpenChange={(v) => !v && setModal(null)} />
      )}

      {activeTab === "sources" && (
        <>
          {modal?.kind === "viewAll" && modal.source === "mentor_union" && (
            <ViewAllMentorsModal open onOpenChange={(v) => !v && setModal(null)} />
          )}
          {modal?.kind === "viewAll" && modal.source === "alumni_db" && (
            <AlumniViewAllModal open onOpenChange={(v) => !v && setModal(null)} readOnly={isReadOnly} />
          )}
          {modal?.kind === "viewAll" && modal.source === "domain_db" && (
            <ViewAllDomainsModal open onOpenChange={(v) => !v && setModal(null)} />
          )}
          {modal?.kind === "viewAll" && modal.source === "poc_db" && (
            <ViewAllPocsModal open onOpenChange={(v) => !v && setModal(null)} />
          )}
          {modal?.kind === "viewAll" && modal.source === "lmp_db" && (
            <ViewAllLmpsModal open onOpenChange={(v) => !v && setModal(null)} readOnly={isReadOnly} />
          )}
          {modal?.kind === "viewAll" && modal.source === "lmp_mentors_db" && (
            <LmpMentorAssignmentsModal open onOpenChange={(v) => !v && setModal(null)} />
          )}
          {modal?.kind === "history" && (modal.source === "mentor_union" || modal.source === "alumni_db" || modal.source === "student_db" || modal.source === "poc_db") && (
            <UploadHistoryModal source={modal.source} open onOpenChange={(v) => !v && setModal(null)} />
          )}
          {modal?.kind === "history" && modal.source === "domain_db" && (
            <LmpTrackerSyncHistoryModal open onOpenChange={(v) => !v && setModal(null)} title="Domain Database" />
          )}
          {modal?.kind === "history" && modal.source === "lmp_db" && (
            <LmpTrackerSyncHistoryModal open onOpenChange={(v) => !v && setModal(null)} title="LMP Database" />
          )}
          {modal?.kind === "history" && modal.source === "lmp_mentors_db" && (
            <LmpTrackerSyncHistoryModal open onOpenChange={(v) => !v && setModal(null)} title="LMP Mentor Assignments" />
          )}
        </>
      )}

      
      {activeTab === "audit-log" && <AuditLogPageContent />}
      {activeTab === "copilot-insights" && (
        <Suspense fallback={<div className="flex items-center justify-center py-12 text-sm text-n500">Loading…</div>}>
          <AiUsagePage />
        </Suspense>
      )}

      <MappingInspectorModal open={mappingOpen} onOpenChange={setMappingOpen} />
      <HistoricalLmpBackfillModal open={historicalBackfillOpen} onOpenChange={setHistoricalBackfillOpen} />
    </div>
  );
}

export default function DataSourcesPage() {
  return (
    <ErrorBoundary fallbackTitle="Data sources unavailable">
      <DataSourcesPageInner />
    </ErrorBoundary>
  );
}
