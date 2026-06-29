import { useState, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLmpById, useLmpMutation } from "@/lib/sheets/hooks";
import { toast } from "sonner";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { useJdRealtime } from "@/lib/hooks/useJdRealtime";
import { useLmpCandidatesLive } from "@/lib/hooks/useLmpCandidatesLive";
import { useIsLmpSyncPending } from "@/lib/hooks/useIsLmpSyncPending";
import { StickyHeader } from "@/components/lmp/detail/StickyHeader";
import { MentorsTab } from "@/components/lmp/detail/MentorsTab";
import { FeedbackTab } from "@/components/lmp/detail/FeedbackTab";
import { UnifiedOverviewTab } from "@/components/lmp/UnifiedOverviewTab";
import { normalizeLmpOwnership, useLmpPermission } from "@/lib/hooks/usePermissions";
import { useRole } from "@/lib/rolesContext";
import { Eye } from "lucide-react";
import { resolveLmpBoardBackHref } from "@/lib/lmpViewingContext";

const TABS = ["Overview", "Mentors", "Feedback"] as const;
type Tab = typeof TABS[number];

export default function LmpDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from") === "kanban" ? "kanban" : "cards";
  const returnTo = searchParams.get("returnTo");
  const rawId = id ? decodeURIComponent(id) : "";

  const { data: lmp, isLoading } = useLmpById(rawId);
  const initialTab = (() => {
    const t = searchParams.get("tab");
    const match = TABS.find((x) => x.toLowerCase() === (t || "").toLowerCase());
    return match ?? "Overview";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);

  // `lmp.id` is the DB uuid (useLmpRows reads from `lmp_processes`).
  const dbLmpId = lmp?.id;

  // Mount realtime once for this LMP — keeps process row, candidates,
  // sessions, mentors, daily logs, and dashboard KPIs in sync.
  useLmpProcessesRealtime({ lmpId: dbLmpId });
  useLmpCandidatesRealtime({ lmpId: dbLmpId });
  useJdRealtime(dbLmpId);

  // Pull live candidates so the StickyHeader count and Mentors tab are in sync.
  const { data: liveCandidates = [] } = useLmpCandidatesLive(dbLmpId);
  const candidates = useMemo(() => liveCandidates ?? [], [liveCandidates]);

  // IMPORTANT: call all hooks before any early return so hook order stays stable
  // across renders (e.g. after the LMP is deleted and `lmp` flips to undefined).
  const lmpOwnership = useMemo(() => normalizeLmpOwnership(lmp), [lmp]);
  const { canOperateLmp } = useLmpPermission(lmpOwnership);
  const { isLoading: isRoleLoading, user, role } = useRole();
  // Only treat as read-only once auth/role/POC profile have fully resolved.
  // Otherwise a Support POC would briefly see the read-only banner on every
  // page load while `pocProfileName` is still being fetched.
  const pocProfileReady = role === "admin" || !!user.pocProfileName || !!user.name;
  const operationalReadOnly = !!lmp && !isRoleLoading && pocProfileReady && !canOperateLmp;
  const showViewOnlyBanner = operationalReadOnly;

  const backHref = resolveLmpBoardBackHref(returnTo, from);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-[120px] w-full rounded-2xl" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    );
  }

  if (!lmp) {
    return <LmpMissingState rawId={rawId} backHref={backHref} />;
  }

  const lmpId = lmp.id;

  return (
    <div className="space-y-5">
      <Link
        to={backHref}
        className="inline-flex items-center gap-1 text-[12px] text-n500 hover:text-n800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Last Mile Prep
      </Link>

      <StickyHeaderWithCount lmp={lmp} operationalReadOnly={operationalReadOnly} />

      {showViewOnlyBanner && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2 text-[12.5px] flex items-center gap-2">
          <Eye className="h-3.5 w-3.5" />
          View-only process access — you can review LMP details, documents, mentors, sessions and activity. POC-only actions are disabled.
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-n200">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 border-b-2 -mb-px whitespace-nowrap",
                tab === t
                  ? "text-orange-600 border-orange-500"
                  : "text-n500 hover:text-n800 border-transparent",
              )}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      <div className="pt-2">
        {/* Keep all tabs mounted — toggle visibility so react-query caches,
            realtime subscriptions and local component state persist across
            tab switches (prevents candidate list / mentor shortlist flicker). */}
        <div hidden={tab !== "Overview"}>
          <UnifiedOverviewTab lmp={lmp} onOpenSessionsTab={() => setTab("Mentors")} operationalReadOnly={operationalReadOnly} />
        </div>
        <div hidden={tab !== "Mentors"}>
          <MentorsTab reqId={lmpId} role={lmp.role} company={lmp.company} domain={lmp.domain} industry={lmp.domain} candidates={candidates} operationalReadOnly={operationalReadOnly} />
        </div>
        <div hidden={tab !== "Feedback"}>
          <FeedbackTab reqId={lmpId} operationalReadOnly={operationalReadOnly} />
        </div>

      </div>
    </div>
  );
}

function StickyHeaderWithCount({ lmp, operationalReadOnly }: { lmp: NonNullable<ReturnType<typeof useLmpById>["data"]>; operationalReadOnly?: boolean }) {
  const { data: liveCandidates = [] } = useLmpCandidatesLive(lmp.id);
  const count = Math.max(lmp.candidates ?? 0, liveCandidates.length);
  const { update } = useLmpMutation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const handleChangeStatus = (next: typeof lmp.status) => {
    update.mutate(
      { id: lmp.id, patch: { status: next, lastActivity: "Just now — Status updated" } },
      {
        onSuccess: () => {
          if (next === "not-converted") setFeedbackOpen(true);
        },
        onError: (e: any) => toast.error(e?.message || "Failed to update status"),
      },
    );
  };
  return (
    <>
      <StickyHeader
        lmp={lmp}
        candidateCount={count}
        operationalReadOnly={operationalReadOnly}
        onChangeStatus={operationalReadOnly ? undefined : handleChangeStatus}
      />
      <OutreachFeedbackModal
        open={feedbackOpen}
        lmpId={lmp.id}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  );
}

function LmpMissingState({ rawId, backHref }: { rawId: string; backHref: string }) {
  const { isUuid, pending, timedOut, loading } = useIsLmpSyncPending(rawId);
  const showPending = isUuid && (loading || pending) && !timedOut;

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      {showPending ? (
        <>
          <Loader2 className="h-5 w-5 text-orange-500 animate-spin" />
          <div className="space-y-1 max-w-sm">
            <p className="text-n800 text-sm font-medium">Sync pending</p>
            <p className="text-n500 text-[13px]">
              This LMP process was just created and is finishing its first sync to the tracker sheet. It should appear within a few seconds.
            </p>
          </div>
        </>
      ) : (
        <p className="text-n500 text-sm">
          LMP not found. It may have been removed or the ID is invalid.
        </p>
      )}
      <Link
        to={backHref}
        className="inline-flex items-center gap-1 text-[13px] text-orange-600 hover:text-orange-700 font-medium"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to LMP Board
      </Link>
    </div>
  );
}
