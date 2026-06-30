/**
 * /quick/* — Mobile PWA quick-actions view.
 *
 * Rules:
 * - No AppShell, no desktop providers.
 * - All mutations flow through existing hooks (useLmpMutation, useAddLmpCandidates, etc.)
 *   so changes sync to Supabase AND the sheet exactly as desktop does.
 * - No mock data, no new tables.
 * - Mode context (QuickModeContext) gates admin-summary (read-only) vs my-poc-actions.
 * - "My LMPs" badge ALWAYS counts only assigned LMPs regardless of role.
 */

import {
  useState, useMemo, useCallback, useEffect,
  createContext, useContext, type ReactNode,
} from "react";
import { Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import {
  ClipboardList, ListChecks, TrendingUp, CalendarClock, RefreshCw,
  CheckSquare, UserPlus, FileText, BarChart2, Plus, Users, Layers,
  LogOut, Check, X, Search, ExternalLink, Sparkles, Eye, ShieldAlert,
} from "lucide-react";

import { useRole, usePermission } from "@/lib/rolesContext";
import { useLmpProcesses, useLmpProcessById, useAddLmpCandidates } from "@/lib/hooks/useDbData";
import { usePocLiveLoads } from "@/lib/hooks/useDbData";
import { useStudents } from "@/lib/hooks/useDbData";
import { useAddProgressLog } from "@/lib/hooks/useLmpDailyLogs";
import { useLmpMutation } from "@/lib/sheets/hooks";
import { useCurrentPocId } from "@/lib/hooks/useCurrentPocId";
import { ACTIVE_LMP_STATUSES, isActiveLmpStatus } from "@/lib/config/lmpStatus";
import { fetchJdFromDb, getJd, type JdData } from "@/lib/jdStore";
import { STATUSES, STATUS_META, type LmpStatus } from "@/lib/lmpTypes";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_CHIPS } from "@/lib/lmpExecutionEngine";

import { QuickMobileShell } from "@/components/quick/QuickMobileShell";
import { QuickActionCard } from "@/components/quick/QuickActionCard";
import { QuickLmpPicker } from "@/components/quick/QuickLmpPicker";
import { QuickBottomBar, QuickSubmitButton } from "@/components/quick/QuickBottomBar";
import { QuickInstallPrompt } from "@/components/quick/QuickInstallPrompt";
import { QuickModeToggle } from "@/components/quick/QuickModeToggle";
import { AdminSummaryView } from "@/components/quick/AdminSummaryView";
import { QuickCopilotView } from "@/components/quick/QuickCopilotView";
import { QuickCreateLmpView } from "@/components/quick/QuickCreateLmpView";

// ─── Mode context ─────────────────────────────────────────────────────────────

export type QuickMode = "admin-summary" | "my-poc-actions";

interface QuickModeCtx {
  mode: QuickMode;
  setMode: (m: QuickMode) => void;
  isPrivileged: boolean;
  /** LMP query filters for action views (null = all LMPs, object = assigned only) */
  pocFilters: { pocId?: string | null; pocName?: string } | undefined;
  isReadOnly: boolean; // true when in admin-summary mode
}

const QuickModeContext = createContext<QuickModeCtx | null>(null);

export function useQuickMode(): QuickModeCtx {
  const ctx = useContext(QuickModeContext);
  if (!ctx) throw new Error("useQuickMode must be inside QuickActionsPage");
  return ctx;
}

// ─── Read-only banner ─────────────────────────────────────────────────────────

function ReadOnlyBanner({ onSwitch }: { onSwitch: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-800">Admin Summary — Read Only</p>
        <p className="text-xs text-amber-700 mt-0.5">Switch to My POC Actions to make changes.</p>
      </div>
      <button
        onClick={onSwitch}
        className="shrink-0 text-xs font-semibold text-primary underline underline-offset-2"
      >
        Switch
      </button>
    </div>
  );
}

// ─── Status label helper ──────────────────────────────────────────────────────

function statusLabel(s: LmpStatus): string {
  return STATUS_META[s]?.label ?? s;
}

// ─── POC filter helper ────────────────────────────────────────────────────────
// When no poc identity is resolved yet (pocId=null, pocName=undefined), passing
// { pocId: undefined, pocName: undefined } to useLmpProcesses skips both filter
// clauses and returns ALL LMPs. Use a no-match sentinel to guarantee 0 results
// instead, so a POC user never accidentally sees every LMP in the system.
function buildAssignedPocFilter(pocId: string | null, pocName: string | undefined) {
  if (pocId) return { pocId };
  if (pocName) return { pocName };
  return { pocId: "no-identity" };
}

// ─── Home ────────────────────────────────────────────────────────────────────

function QuickHome() {
  const { role, user, logout } = useRole();
  const { canCreateLmp, canAllocatePoc } = usePermission();
  const pocId = useCurrentPocId();
  const { mode, setMode, isPrivileged } = useQuickMode();

  // "My LMPs" badge — ALWAYS counts only assigned LMPs regardless of mode or role
  const assignedFilters = useMemo(
    () => buildAssignedPocFilter(pocId, user.pocProfileName),
    [pocId, user.pocProfileName]
  );
  const { data: myLmps = [] } = useLmpProcesses(assignedFilters);
  const myLmpCount = (myLmps as any[]).length;

  // All LMPs for admin summary stats
  const { data: allLmps = [] } = useLmpProcesses();
  const allCount = (allLmps as any[]).length;
  const activeCount = (allLmps as any[]).filter((r) => isActiveLmpStatus(r.status)).length;

  const isAdminSummary = isPrivileged && mode === "admin-summary";

  return (
    <div className="flex flex-col bg-background text-foreground" style={{ minHeight: "100dvh" }}>
      <header
        className="flex items-center justify-between px-4 py-4 border-b border-border"
        style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}
      >
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">PrepLane</p>
          <h1 className="text-lg font-bold leading-tight">Quick Actions</h1>
        </div>
        <button
          onClick={() => logout()}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <QuickInstallPrompt />

        {/* Mode toggle for privileged users */}
        {isPrivileged && (
          <QuickModeToggle
            mode={mode}
            setMode={setMode}
            isAllocator={role === "allocator"}
          />
        )}

        {/* ── Admin Summary mode ── */}
        {isAdminSummary && (
          <>
            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "All LMPs", value: allCount, accent: false },
                { label: "Active", value: activeCount, accent: true },
                { label: "Assigned", value: myLmpCount, accent: false },
              ].map(({ label, value, accent }) => (
                <div key={label} className="rounded-xl border border-border bg-card px-2 py-2.5 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold leading-tight">{label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest px-1 pt-2 pb-0.5">
              Admin Overview
            </p>
            <QuickActionCard icon={Eye} label="Browse All LMPs" description="Read-only view of all processes with filters" to="/quick/admin-summary" />
            <QuickActionCard icon={Layers} label="POC Load" description="View workload distribution across POCs" to="/quick/poc-load" />
            <QuickActionCard icon={Sparkles} label="LMP Copilot" description="Ask questions about the pipeline (read-only)" to="/quick/copilot" />
            <QuickActionCard icon={FileText} label="View JD" description="See the job description for any LMP" to="/quick/view-jd" />
            <QuickActionCard icon={BarChart2} label="LMP Summary" description="Pipeline snapshot and candidates" to="/quick/summary" />
            {canAllocatePoc && <QuickActionCard icon={Users} label="Assign POC" description="Edit POC assignment on an LMP" to="/quick/assign-poc" />}
            {canCreateLmp && (
              <QuickActionCard icon={Plus} label="Create LMP" description="Start a new LMP process (mobile wizard)" to="/quick/create-lmp" />
            )}
          </>
        )}

        {/* ── My POC Actions mode (also plain POC users) ── */}
        {!isAdminSummary && (
          <>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest px-1 pt-1 pb-0.5">
              My Actions
            </p>

            <QuickActionCard
              icon={ClipboardList}
              label="My LMPs"
              description="Active processes assigned to you"
              to="/quick/my-lmps"
              badge={myLmpCount > 0 ? myLmpCount : undefined}
            />
            <QuickActionCard icon={ListChecks} label="Pending Updates" description="LMPs with no progress log today" to="/quick/pending" />
            <QuickActionCard icon={TrendingUp} label="Daily Progress" description="Add a progress note to an LMP" to="/quick/progress" />
            <QuickActionCard icon={CalendarClock} label="Next Progress" description="Log 'no update' with next expected date" to="/quick/next-progress" />
            <QuickActionCard icon={RefreshCw} label="Change Status" description="Update the status of an assigned LMP" to="/quick/status" />
            <QuickActionCard icon={CheckSquare} label="Checklist" description="View and toggle execution checklist" to="/quick/checklist" />
            <QuickActionCard icon={UserPlus} label="Add Candidate" description="Link a student to an LMP process" to="/quick/add-candidate" />
            <QuickActionCard icon={FileText} label="View JD" description="See the job description for an LMP" to="/quick/view-jd" />
            <QuickActionCard icon={BarChart2} label="LMP Summary" description="Pipeline snapshot and candidates" to="/quick/summary" />
            <QuickActionCard icon={Sparkles} label="LMP Copilot" description="Ask questions or take assisted LMP actions" to="/quick/copilot" />

            {(canCreateLmp || canAllocatePoc) && (
              <>
                <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-widest px-1 pt-3 pb-0.5">
                  Admin / Allocator
                </p>
                {canCreateLmp && (
                  <QuickActionCard icon={Plus} label="Create LMP" description="Mobile LMP creation wizard" to="/quick/create-lmp" />
                )}
                {canAllocatePoc && (
                  <QuickActionCard icon={Users} label="Assign POC" description="Edit POC assignment on an LMP" to="/quick/assign-poc" />
                )}
                {canAllocatePoc && (
                  <QuickActionCard icon={Layers} label="POC Load" description="View workload across all POCs" to="/quick/poc-load" />
                )}
              </>
            )}
          </>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}

// ─── My LMPs ─────────────────────────────────────────────────────────────────

function MyLmpsView() {
  const { user } = useRole();
  const pocId = useCurrentPocId();
  const navigate = useNavigate();

  // Always filter by assigned — this view is always "my" LMPs
  const filters = useMemo(
    () => buildAssignedPocFilter(pocId, user.pocProfileName),
    [pocId, user.pocProfileName]
  );
  const { data: lmps = [], isLoading } = useLmpProcesses(filters);

  // Status chip colours
  const statusChipCls = (s: string) => {
    const map: Record<string, string> = {
      "not-started":   "bg-slate-100 text-slate-600 border-slate-200",
      "prep-ongoing":  "bg-blue-50 text-blue-700 border-blue-200",
      "prep-done":     "bg-emerald-50 text-emerald-700 border-emerald-200",
      "hold":          "bg-amber-50 text-amber-700 border-amber-200",
      "converted":     "bg-green-100 text-green-700 border-green-200",
      "not-converted": "bg-rose-50 text-rose-600 border-rose-200",
      "other-reasons": "bg-muted text-muted-foreground border-border",
    };
    return map[s] ?? "bg-muted text-muted-foreground border-border";
  };

  return (
    <QuickMobileShell title="My LMPs" back>
      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
      {!isLoading && (lmps as any[]).length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No LMPs assigned to you.</p>
      )}
      <ul className="space-y-2">
        {(lmps as any[]).map((r: any) => (
          <li key={r.id}>
            <button
              className="w-full text-left rounded-2xl border border-border bg-card px-4 py-3.5 hover:bg-muted/30 active:scale-[0.98] transition-all"
              style={{ minHeight: "64px" }}
              onClick={() => navigate(`/lmp/${r.id}`)}
            >
              <p className="text-sm font-semibold leading-snug line-clamp-1">{r.company}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{r.role}</p>
              <span className={`inline-block mt-2 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${statusChipCls(String(r.status ?? ""))}`}>
                {STATUS_META[r.status as LmpStatus]?.label ?? String(r.status ?? "").replace(/-/g, " ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </QuickMobileShell>
  );
}

// ─── Pending Updates ──────────────────────────────────────────────────────────

function PendingUpdatesView() {
  const { user } = useRole();
  const pocId = useCurrentPocId();
  const navigate = useNavigate();

  // Always filter by assigned for "pending updates"
  const filters = useMemo(
    () => buildAssignedPocFilter(pocId, user.pocProfileName),
    [pocId, user.pocProfileName]
  );
  const { data: lmps = [], isLoading } = useLmpProcesses(filters);

  const todayStr = new Date().toISOString().slice(0, 10);
  const pending = (lmps as any[]).filter((r) => {
    if (!isActiveLmpStatus(r.status)) return false;
    const last = r.last_progress_updated_at ? String(r.last_progress_updated_at).slice(0, 10) : null;
    return !last || last < todayStr;
  });

  return (
    <QuickMobileShell title="Pending Updates" back>
      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
      {!isLoading && pending.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">All LMPs have been updated today.</p>
      )}
      <ul className="space-y-2">
        {pending.map((r: any) => (
          <li key={r.id}>
            <button
              className="w-full text-left rounded-2xl border border-border bg-card px-4 py-3.5 hover:bg-muted/30 active:scale-[0.98] transition-all"
              style={{ minHeight: "64px" }}
              onClick={() => navigate(`/quick/progress?lmp=${r.id}`)}
            >
              <p className="text-sm font-semibold leading-snug line-clamp-1">{r.company}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{r.role}</p>
              {r.last_progress_updated_at && (
                <p className="text-[10px] text-amber-600 mt-1.5">
                  Last update: {new Date(r.last_progress_updated_at).toLocaleDateString()}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </QuickMobileShell>
  );
}

// ─── Daily Progress ───────────────────────────────────────────────────────────

function DailyProgressView() {
  const { user } = useRole();
  const pocId = useCurrentPocId();
  const { isReadOnly, setMode, pocFilters } = useQuickMode();
  const [searchParams] = useSearchParams();
  const [lmpId, setLmpId] = useState<string | null>(searchParams.get("lmp"));
  const [lmpLabel, setLmpLabel] = useState("");
  const [text, setText] = useState("");
  const [selectedChips, setSelectedChips] = useState<string[]>([]);

  const addLog = useAddProgressLog(lmpId ?? "");

  const handleSubmit = async () => {
    if (!lmpId || !text.trim()) return;
    await addLog.mutateAsync({
      text: text.trim(),
      chips: selectedChips,
      entry_type: "progress",
      author_name: user.pocProfileName ?? user.name,
      author_email: user.email,
    });
    setText("");
    setSelectedChips([]);
    toast({ title: "Progress logged", description: lmpLabel });
  };

  const toggleChip = (chip: string) =>
    setSelectedChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );

  return (
    <QuickMobileShell
      title="Daily Progress"
      back
      footer={
        !isReadOnly ? (
          <QuickBottomBar>
            <QuickSubmitButton label="Save Progress" onClick={handleSubmit} loading={addLog.isPending} disabled={!lmpId || !text.trim()} />
          </QuickBottomBar>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {isReadOnly && <ReadOnlyBanner onSwitch={() => setMode("my-poc-actions")} />}

        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">LMP Process</label>
          <QuickLmpPicker value={lmpId} onChange={(id, label) => { setLmpId(id || null); setLmpLabel(label); }} filters={pocFilters} />
        </div>

        {!isReadOnly && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Progress Note</label>
              <textarea
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
                rows={4}
                placeholder="Summarise today's progress, updates, or blockers…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Tags</label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => toggleChip(chip)}
                    className={[
                      "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                      selectedChips.includes(chip)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground",
                    ].join(" ")}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── Next Progress ────────────────────────────────────────────────────────────

function NextProgressView() {
  const { user } = useRole();
  const { isReadOnly, setMode, pocFilters } = useQuickMode();
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [reason, setReason] = useState("");
  const addLog = useAddProgressLog(lmpId ?? "");

  const handleSubmit = async () => {
    if (!lmpId || !nextDate) return;
    await addLog.mutateAsync({
      text: reason.trim() || "No update today.",
      entry_type: "no_update",
      author_name: user.pocProfileName ?? user.name,
      author_email: user.email,
      metadata: { next_expected_at: nextDate },
    });
    setReason("");
    setNextDate("");
    toast({ title: "Logged", description: `Next update expected ${nextDate}` });
  };

  return (
    <QuickMobileShell
      title="Next Progress"
      back
      footer={
        !isReadOnly ? (
          <QuickBottomBar>
            <QuickSubmitButton label="Log No Update" onClick={handleSubmit} loading={addLog.isPending} disabled={!lmpId || !nextDate} />
          </QuickBottomBar>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {isReadOnly && <ReadOnlyBanner onSwitch={() => setMode("my-poc-actions")} />}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">LMP Process</label>
          <QuickLmpPicker value={lmpId} onChange={(id, label) => { setLmpId(id || null); setLmpLabel(label); }} filters={pocFilters} />
        </div>
        {!isReadOnly && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Next Expected Update</label>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Reason (optional)</label>
              <textarea
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                placeholder="Why no update today?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── Change Status ────────────────────────────────────────────────────────────
// Flow: visible LMP list → tap to select → status options appear below

const CANONICAL_STATUSES: LmpStatus[] = STATUSES;

function ChangeStatusView() {
  const { isReadOnly, setMode, pocFilters } = useQuickMode();
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [newStatus, setNewStatus] = useState<LmpStatus | "">("");
  const { update } = useLmpMutation();

  const handleSave = useCallback(() => {
    if (!lmpId || !newStatus || isReadOnly) return;
    update.mutate(
      { id: lmpId, patch: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Status updated", description: `${lmpLabel} → ${statusLabel(newStatus as LmpStatus)}` });
          setLmpId(null);
          setLmpLabel("");
          setNewStatus("");
        },
      }
    );
  }, [lmpId, newStatus, lmpLabel, update, isReadOnly]);

  return (
    <QuickMobileShell
      title="Change Status"
      back
      footer={
        !isReadOnly && lmpId && newStatus ? (
          <QuickBottomBar>
            <QuickSubmitButton label="Update Status" onClick={handleSave} loading={update.isPending} disabled={!lmpId || !newStatus} />
          </QuickBottomBar>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {isReadOnly && <ReadOnlyBanner onSwitch={() => setMode("my-poc-actions")} />}

        {/* Step 1: LMP picker — shows scrollable list first */}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
            Select LMP Process
          </label>
          <QuickLmpPicker
            value={lmpId}
            onChange={(id, label) => { setLmpId(id || null); setLmpLabel(label); setNewStatus(""); }}
            filters={pocFilters}
          />
        </div>

        {/* Step 2: Status options — only shown after LMP is selected */}
        {lmpId && (
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              New Status
            </label>
            {isReadOnly ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                Switch to My POC Actions mode to update status.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {CANONICAL_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setNewStatus(s)}
                    className={[
                      "rounded-xl border px-3.5 py-3.5 text-sm font-medium text-left transition-colors",
                      newStatus === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground",
                    ].join(" ")}
                    style={{ minHeight: "52px" }}
                  >
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── Checklist ────────────────────────────────────────────────────────────────

const CHECKLIST_DEFS = [
  { id: "ck-mentor", sheetKey: "mentorAligned", label: "Mentor aligned", owner: "POC" },
  { id: "ck-prepdoc", sheetKey: "prepDocShared", label: "Prep doc shared", owner: "POC" },
  { id: "ck-assign", sheetKey: "assignmentReview", label: "Assignment review", owner: "Mentor" },
  { id: "ck-mock", sheetKey: "mockDoneByPoc", label: "1:1 mock completed", owner: "Mentor" },
] as const;

const DB_TO_SHEET_KEY: Record<string, string> = {
  mentor_aligned: "mentorAligned",
  prep_doc_shared: "prepDocShared",
  assignment_review: "assignmentReview",
  one_to_one_mock: "mockDoneByPoc",
};

function ChecklistView() {
  const { isReadOnly, setMode, pocFilters } = useQuickMode();
  const [lmpId, setLmpId] = useState<string | null>(null);
  const { update } = useLmpMutation();
  const { data: lmpRow } = useLmpProcessById(lmpId ?? "");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const checklistValues = useMemo<Record<string, boolean>>(() => {
    if (!lmpRow) return {};
    const row = lmpRow as any;
    const vals: Record<string, boolean> = {};
    for (const [dbCol, sheetKey] of Object.entries(DB_TO_SHEET_KEY)) {
      vals[sheetKey] = Boolean(row[dbCol]);
    }
    return vals;
  }, [lmpRow]);

  useEffect(() => {
    setOverrides((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      let changed = false;
      for (const [k, v] of Object.entries(prev)) {
        if (checklistValues[k] === v) { delete next[k]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [checklistValues]);

  const handleToggle = useCallback(
    (sheetKey: string, currentDone: boolean) => {
      if (!lmpId || isReadOnly) return;
      const next = !currentDone;
      setOverrides((p) => ({ ...p, [sheetKey]: next }));
      update.mutate(
        { id: lmpId, patch: { [sheetKey]: next } },
        {
          onError: () => {
            setOverrides((p) => { const copy = { ...p }; delete copy[sheetKey]; return copy; });
            toast({ title: "Update failed", variant: "destructive" });
          },
          onSuccess: () => { toast({ title: next ? "Marked done" : "Reopened" }); },
        }
      );
    },
    [lmpId, update, isReadOnly]
  );

  return (
    <QuickMobileShell title="Checklist" back>
      <div className="space-y-5">
        {isReadOnly && <ReadOnlyBanner onSwitch={() => setMode("my-poc-actions")} />}

        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">LMP Process</label>
          <QuickLmpPicker
            value={lmpId}
            onChange={(id) => { setLmpId(id || null); setOverrides({}); }}
            filters={pocFilters}
          />
        </div>

        {lmpId && !lmpRow && <p className="text-sm text-muted-foreground py-4 text-center">Loading checklist…</p>}

        {lmpRow && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Execution Checklist</label>
              <span className="text-xs text-muted-foreground">
                {CHECKLIST_DEFS.filter((d) => (d.sheetKey in overrides ? overrides[d.sheetKey] : checklistValues[d.sheetKey])).length} / {CHECKLIST_DEFS.length} done
              </span>
            </div>
            <div className="h-1 rounded-full bg-muted mb-4 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${(CHECKLIST_DEFS.filter((d) => (d.sheetKey in overrides ? overrides[d.sheetKey] : checklistValues[d.sheetKey])).length / CHECKLIST_DEFS.length) * 100}%`,
                }}
              />
            </div>
            <ul className="space-y-2">
              {CHECKLIST_DEFS.map((def) => {
                const done = def.sheetKey in overrides ? overrides[def.sheetKey] : checklistValues[def.sheetKey];
                return (
                  <li key={def.id}>
                    <button
                      onClick={() => handleToggle(def.sheetKey, done)}
                      className={[
                        "w-full flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-all",
                        isReadOnly ? "cursor-default" : "active:scale-[0.98]",
                      ].join(" ")}
                      style={{ minHeight: "60px" }}
                      disabled={update.isPending || isReadOnly}
                    >
                      <span className={["flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors", done ? "bg-foreground border-foreground" : "border-border bg-background"].join(" ")}>
                        {done && <Check className="h-3.5 w-3.5 text-background" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={["block text-sm font-medium", done ? "line-through text-muted-foreground" : "text-foreground"].join(" ")}>
                          {def.label}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {def.owner}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── Add Candidate ────────────────────────────────────────────────────────────

function AddCandidateView() {
  const { isReadOnly, setMode } = useQuickMode();
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: students = [], isLoading: studentsLoading } = useStudents();
  const addCandidates = useAddLmpCandidates();

  const filtered = useMemo(() => {
    const lower = search.toLowerCase().trim();
    if (!lower) return (students as any[]).slice(0, 80);
    return (students as any[])
      .filter(
        (s) =>
          String(s.name ?? "").toLowerCase().includes(lower) ||
          String(s.email ?? "").toLowerCase().includes(lower) ||
          String(s.roll_no ?? "").toLowerCase().includes(lower)
      )
      .slice(0, 80);
  }, [students, search]);

  const toggle = (id: string) =>
    setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const handleSubmit = async () => {
    if (!lmpId || picked.size === 0 || isReadOnly) return;
    const toAdd = (students as any[])
      .filter((s) => picked.has(s.id))
      .map((s) => ({ lmp_id: lmpId, student_name: s.name, student_id: s.id }));
    await addCandidates.mutateAsync(toAdd);
    setPicked(new Set());
    setSelectorOpen(false);
    toast({ title: "Candidates added", description: lmpLabel });
  };

  return (
    <>
      <QuickMobileShell
        title="Add Candidate"
        back
        footer={
          !isReadOnly && picked.size > 0 ? (
            <QuickBottomBar>
              <QuickSubmitButton
                label={`Add ${picked.size} student${picked.size === 1 ? "" : "s"}`}
                onClick={handleSubmit}
                loading={addCandidates.isPending}
                disabled={!lmpId}
              />
            </QuickBottomBar>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {isReadOnly && <ReadOnlyBanner onSwitch={() => setMode("my-poc-actions")} />}

          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">LMP Process</label>
            <QuickLmpPicker
              value={lmpId}
              onChange={(id, label) => { setLmpId(id || null); setLmpLabel(label); setPicked(new Set()); }}
            />
          </div>

          {lmpId && !isReadOnly && (
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Students</label>
              <button
                onClick={() => setSelectorOpen(true)}
                className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium hover:bg-muted/30 active:scale-[0.98] transition-all"
                style={{ minHeight: "52px" }}
              >
                <span className="text-muted-foreground">
                  {picked.size > 0 ? `${picked.size} student${picked.size === 1 ? "" : "s"} selected` : "Tap to select students…"}
                </span>
                <Search className="h-4 w-4 text-muted-foreground" />
              </button>
              {picked.size > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {(students as any[]).filter((s) => picked.has(s.id)).map((s: any) => (
                    <li key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5">
                      <div>
                        <p className="text-sm font-medium leading-tight">{s.name}</p>
                        {s.primary_domain && <p className="text-xs text-muted-foreground">{s.primary_domain}</p>}
                      </div>
                      <button onClick={() => toggle(s.id)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </QuickMobileShell>

      {selectorOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <button onClick={() => { setSelectorOpen(false); setSearch(""); }} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold flex-1">Select Students</h2>
            {picked.size > 0 && (
              <button onClick={() => { setSelectorOpen(false); setSearch(""); }} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                Done ({picked.size})
              </button>
            )}
          </div>
          <div className="px-4 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input type="search" placeholder="Search by name, email, roll no…" autoFocus
                className="w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {studentsLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading students…</p>}
            {!studentsLoading && filtered.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No students match your search.</p>}
            <ul>
              {filtered.map((s: any) => {
                const isSelected = picked.has(s.id);
                return (
                  <li key={s.id}>
                    <button onClick={() => toggle(s.id)}
                      className={["w-full flex items-center gap-4 px-4 py-3.5 border-b border-border/50 text-left transition-colors", isSelected ? "bg-primary/5" : "hover:bg-muted/30"].join(" ")}
                      style={{ minHeight: "60px" }}>
                      <span className={["flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors", isSelected ? "bg-primary border-primary" : "border-border bg-background"].join(" ")}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight line-clamp-1">{s.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {[s.primary_domain, s.roll_no].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

// ─── View JD ──────────────────────────────────────────────────────────────────

function ViewJdView() {
  const [searchParams] = useSearchParams();
  const { pocFilters } = useQuickMode();
  const [lmpId, setLmpId] = useState<string | null>(searchParams.get("lmp"));
  const [jd, setJd] = useState<JdData | null | "loading" | "none">("none");

  const handleSelectLmp = useCallback(async (id: string) => {
    if (!id) { setLmpId(null); setJd("none"); return; }
    setLmpId(id);
    const cached = getJd(id);
    if (cached) { setJd(cached); return; }
    setJd("loading");
    const fromDb = await fetchJdFromDb(id);
    setJd(fromDb ?? "none");
  }, []);

  // Auto-load if lmp param set
  useEffect(() => {
    const lmpParam = searchParams.get("lmp");
    if (lmpParam) handleSelectLmp(lmpParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QuickMobileShell title="View JD" back>
      <div className="space-y-5">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">LMP Process</label>
          <QuickLmpPicker value={lmpId} onChange={(id) => handleSelectLmp(id)} filters={pocFilters} />
        </div>

        {jd === "loading" && <p className="text-sm text-muted-foreground py-6 text-center">Loading JD…</p>}

        {jd === "none" && lmpId && (
          <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No JD attached</p>
            <p className="text-xs text-muted-foreground mt-1">No job description has been uploaded for this LMP.</p>
          </div>
        )}

        {jd && jd !== "loading" && jd !== "none" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight line-clamp-2">{jd.fileName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {jd.source === "paste" ? "Pasted" : jd.source === "link" ? "Link" : "Uploaded"} ·{" "}
                    {new Date(jd.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold">
                  JD Attached
                </span>
              </div>
            </div>
            {jd.link && (
              <a href={jd.link} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3.5 text-sm font-medium text-primary">
                <ExternalLink className="h-4 w-4 shrink-0" /> Open JD Link
              </a>
            )}
            <div className="grid grid-cols-2 gap-2">
              {[{ label: "Role", value: jd.role }, { label: "Seniority", value: jd.seniority }].map((f) =>
                f.value ? (
                  <div key={f.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{f.label}</p>
                    <p className="text-sm font-medium mt-0.5 leading-tight">{f.value}</p>
                  </div>
                ) : null
              )}
            </div>
            {jd.skills.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Extracted Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {jd.skills.map((s) => (
                    <span key={s} className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {jd.rawText && jd.source !== "link" && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Job Description</p>
                <div className="rounded-2xl border border-border bg-card px-4 py-3.5 max-h-96 overflow-y-auto">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{jd.rawText}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── LMP Summary ──────────────────────────────────────────────────────────────

function LmpSummaryView() {
  const [searchParams] = useSearchParams();
  const { pocFilters } = useQuickMode();
  const [lmpId, setLmpId] = useState<string | null>(searchParams.get("lmp"));
  const { data: lmpRow } = useLmpProcessById(lmpId ?? "");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const handleSelectLmp = useCallback(async (id: string) => {
    setLmpId(id || null);
    if (!id) { setCandidates([]); return; }
    setCandidatesLoading(true);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("lmp_candidates").select("*").eq("lmp_id", id);
      setCandidates(data ?? []);
    } finally { setCandidatesLoading(false); }
  }, []);

  // Auto-load if lmp param set
  useEffect(() => {
    const lmpParam = searchParams.get("lmp");
    if (lmpParam) handleSelectLmp(lmpParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lmp = lmpRow as any;

  return (
    <QuickMobileShell title="LMP Summary" back>
      <div className="space-y-5">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">LMP Process</label>
          <QuickLmpPicker value={lmpId} onChange={(id) => handleSelectLmp(id)} filters={pocFilters} />
        </div>
        {lmpId && !lmpRow && <p className="text-sm text-muted-foreground py-6 text-center">Loading summary…</p>}
        {lmp && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold line-clamp-1">{lmp.company}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{lmp.role}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
                  {String(lmp.status ?? "").replace(/-/g, " ")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: "Prep POC", value: lmp.prep_poc },
                  { label: "Support POC", value: lmp.support_poc },
                  { label: "Candidates", value: candidatesLoading ? "…" : String(candidates.length) },
                  { label: "Converted", value: lmp.final_converted_numbers ?? "0" },
                ].map((f) => (
                  <div key={f.label} className="rounded-xl bg-muted/50 px-3 py-2.5">
                    <p className="text-muted-foreground text-[10px] font-semibold uppercase tracking-widest">{f.label}</p>
                    <p className="font-medium mt-0.5 text-sm leading-tight">{f.value || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            {candidates.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Candidates ({candidates.length})</p>
                <ul className="space-y-1.5">
                  {candidates.slice(0, 25).map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2.5">
                      <span className="text-sm font-medium leading-tight">{c.student_name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize rounded-full bg-muted/50 px-2 py-0.5">{c.pipeline_stage ?? "pool"}</span>
                    </li>
                  ))}
                  {candidates.length > 25 && <li className="text-xs text-muted-foreground text-center py-1">+{candidates.length - 25} more</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── Assign POC ───────────────────────────────────────────────────────────────

function AssignPocView() {
  const { canAllocatePoc } = usePermission();
  const { isReadOnly, setMode } = useQuickMode();
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [prepPoc, setPrepPoc] = useState("");
  const [supportPoc, setSupportPoc] = useState("");
  const [pocOptions, setPocOptions] = useState<string[]>([]);
  const { update } = useLmpMutation();

  const fetchPocOptions = useCallback(async () => {
    if (pocOptions.length) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.from("poc_profiles").select("name").order("name");
    setPocOptions((data ?? []).map((p: any) => p.name).filter(Boolean));
  }, [pocOptions.length]);

  const handleSave = useCallback(() => {
    if (!lmpId || !canAllocatePoc || isReadOnly) return;
    const patch: Record<string, string> = {};
    if (prepPoc) patch.prepPoc = prepPoc;
    if (supportPoc) patch.supportPoc = supportPoc;
    if (!Object.keys(patch).length) return;
    update.mutate({ id: lmpId, patch }, {
      onSuccess: () => {
        toast({ title: "POC assigned", description: lmpLabel });
        setPrepPoc(""); setSupportPoc(""); setLmpId(null); setLmpLabel("");
      },
    });
  }, [lmpId, prepPoc, supportPoc, lmpLabel, canAllocatePoc, update, isReadOnly]);

  if (!canAllocatePoc) {
    return (
      <QuickMobileShell title="Assign POC" back>
        <p className="text-sm text-muted-foreground py-8 text-center">You do not have permission to assign POCs.</p>
      </QuickMobileShell>
    );
  }

  return (
    <QuickMobileShell
      title="Assign POC"
      back
      footer={
        !isReadOnly ? (
          <QuickBottomBar>
            <QuickSubmitButton label="Save Assignment" onClick={handleSave} loading={update.isPending} disabled={!lmpId || (!prepPoc && !supportPoc)} />
          </QuickBottomBar>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {isReadOnly && <ReadOnlyBanner onSwitch={() => setMode("my-poc-actions")} />}
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">LMP Process</label>
          <QuickLmpPicker
            value={lmpId}
            onChange={(id, label) => { setLmpId(id || null); setLmpLabel(label); fetchPocOptions(); }}
          />
        </div>
        {lmpId && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Prep POC</label>
              <select className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" value={prepPoc} onChange={(e) => setPrepPoc(e.target.value)} disabled={isReadOnly}>
                <option value="">— select —</option>
                {pocOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Support POC</label>
              <select className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" value={supportPoc} onChange={(e) => setSupportPoc(e.target.value)} disabled={isReadOnly}>
                <option value="">— select —</option>
                {pocOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          </>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── POC Load ─────────────────────────────────────────────────────────────────

function PocLoadView() {
  const { data, isLoading } = usePocLiveLoads();
  const byPoc = data?.byPoc ?? {};
  const sorted = Object.entries(byPoc).sort((a, b) => b[1].total - a[1].total);

  return (
    <QuickMobileShell title="POC Load" back>
      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
      {!isLoading && sorted.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No POC data available.</p>
      )}
      <ul className="space-y-2">
        {sorted.map(([name, b]) => (
          <li key={name} className="rounded-2xl border border-border bg-card px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold leading-tight">{name}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{b.total} active</span>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              <span>Prep {b.prep}</span>
              <span>Support {b.support}</span>
              {b.outreach > 0 && <span>Outreach {b.outreach}</span>}
              <span className="ml-auto">All-time {b.historicalTotal}</span>
            </div>
          </li>
        ))}
      </ul>
    </QuickMobileShell>
  );
}

// ─── Root with mode context ───────────────────────────────────────────────────

function QuickModeProvider({ children }: { children: ReactNode }) {
  const { role, user } = useRole();
  const pocId = useCurrentPocId();
  const isPrivileged = role === "admin" || role === "allocator";

  const storageKey = `quick-mode-${user.email}`;
  const [mode, setModeState] = useState<QuickMode>(() => {
    if (!isPrivileged) return "my-poc-actions";
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "admin-summary" || stored === "my-poc-actions") return stored;
    } catch { /* ignore */ }
    return "admin-summary";
  });

  const setMode = useCallback((m: QuickMode) => {
    setModeState(m);
    try { localStorage.setItem(storageKey, m); } catch { /* ignore */ }
  }, [storageKey]);

  const pocFilters = useMemo(() => {
    if (mode === "my-poc-actions") {
      return buildAssignedPocFilter(pocId, user.pocProfileName);
    }
    return undefined;
  }, [mode, pocId, user.pocProfileName]);

  const value = useMemo<QuickModeCtx>(
    () => ({ mode, setMode, isPrivileged, pocFilters, isReadOnly: isPrivileged && mode === "admin-summary" }),
    [mode, setMode, isPrivileged, pocFilters]
  );

  return (
    <QuickModeContext.Provider value={value}>
      {children}
    </QuickModeContext.Provider>
  );
}

export default function QuickActionsPage() {
  return (
    <QuickModeProvider>
      <Routes>
        <Route index element={<QuickHome />} />
        <Route path="my-lmps" element={<MyLmpsView />} />
        <Route path="pending" element={<PendingUpdatesView />} />
        <Route path="progress" element={<DailyProgressView />} />
        <Route path="next-progress" element={<NextProgressView />} />
        <Route path="status" element={<ChangeStatusView />} />
        <Route path="checklist" element={<ChecklistView />} />
        <Route path="add-candidate" element={<AddCandidateView />} />
        <Route path="view-jd" element={<ViewJdView />} />
        <Route path="summary" element={<LmpSummaryView />} />
        <Route path="assign-poc" element={<AssignPocView />} />
        <Route path="poc-load" element={<PocLoadView />} />
        <Route path="admin-summary" element={<AdminSummaryView />} />
        <Route path="copilot" element={<QuickCopilotView />} />
        <Route path="create-lmp" element={<QuickCreateLmpView />} />
      </Routes>
    </QuickModeProvider>
  );
}
