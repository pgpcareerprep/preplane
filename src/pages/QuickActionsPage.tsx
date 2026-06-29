import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  ListChecks,
  TrendingUp,
  CalendarClock,
  RefreshCw,
  CheckSquare,
  UserPlus,
  FileText,
  BarChart2,
  Plus,
  Users,
  Layers,
  LogOut,
} from "lucide-react";

import { useRole, usePermission } from "@/lib/rolesContext";
import { useLmpProcesses, useAddLmpCandidates, usePocLiveLoads } from "@/lib/hooks/useDbData";
import { useAddProgressLog } from "@/lib/hooks/useLmpDailyLogs";
import { ACTIVE_LMP_STATUSES } from "@/lib/config/lmpStatus";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

import { QuickMobileShell } from "@/components/quick/QuickMobileShell";
import { QuickActionCard } from "@/components/quick/QuickActionCard";
import { QuickLmpPicker } from "@/components/quick/QuickLmpPicker";
import { QuickBottomBar, QuickSubmitButton } from "@/components/quick/QuickBottomBar";
import { QuickInstallPrompt } from "@/components/quick/QuickInstallPrompt";
import { DEFAULT_CHIPS } from "@/lib/lmpExecutionEngine";

// ─── Home ───────────────────────────────────────────────────────────────────

function QuickHome() {
  const { role, user, logout } = useRole();
  const { canCreateLmp } = usePermission();
  const { data: allLmps = [] } = useLmpProcesses(
    role === "poc" && user.pocProfileName
      ? { pocName: user.pocProfileName }
      : undefined
  );

  const myLmpCount = (allLmps as any[]).filter((r) =>
    ACTIVE_LMP_STATUSES.includes(String(r.status ?? ""))
  ).length;

  return (
    <div
      className="flex flex-col bg-background text-foreground"
      style={{ minHeight: "100dvh" }}
    >
      {/* Header */}
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

        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide px-1">
          {role === "poc" ? "My Actions" : "Operations"}
        </p>

        {/* POC actions */}
        <QuickActionCard
          icon={ClipboardList}
          label="My LMPs"
          description="Active LMP processes assigned to you"
          to="/quick/my-lmps"
          badge={myLmpCount > 0 ? myLmpCount : undefined}
        />
        <QuickActionCard
          icon={ListChecks}
          label="Pending Updates"
          description="LMPs waiting for a progress log today"
          to="/quick/pending"
        />
        <QuickActionCard
          icon={TrendingUp}
          label="Daily Progress"
          description="Add a progress note to an LMP"
          to="/quick/progress"
        />
        <QuickActionCard
          icon={CalendarClock}
          label="Next Progress"
          description="Log 'no update' with next expected date"
          to="/quick/next-progress"
        />
        <QuickActionCard
          icon={RefreshCw}
          label="Change Status"
          description="Update the current status of an LMP"
          to="/quick/status"
        />
        <QuickActionCard
          icon={CheckSquare}
          label="Checklist"
          description="Add a checklist note to an LMP"
          to="/quick/checklist"
        />
        <QuickActionCard
          icon={UserPlus}
          label="Add Candidate"
          description="Link a student to an LMP process"
          to="/quick/add-candidate"
        />
        <QuickActionCard
          icon={FileText}
          label="View JD"
          description="See the job description for an LMP"
          to="/quick/view-jd"
        />
        <QuickActionCard
          icon={BarChart2}
          label="LMP Summary"
          description="Snapshot of pipeline and candidates"
          to="/quick/summary"
        />

        {/* Allocator / Admin only */}
        {canCreateLmp && (
          <>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide px-1 pt-2">
              Admin / Allocator
            </p>
            <QuickActionCard
              icon={Plus}
              label="Create LMP"
              description="Open the full LMP creation wizard"
              onClick={() => window.open("/processes/new", "_self")}
            />
            <QuickActionCard
              icon={Users}
              label="Assign POC"
              description="Edit POC assignment on an LMP"
              to="/quick/assign-poc"
            />
            <QuickActionCard
              icon={Layers}
              label="POC Load"
              description="View workload across all POCs"
              to="/quick/poc-load"
            />
          </>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}

// ─── My LMPs ────────────────────────────────────────────────────────────────

function MyLmpsView() {
  const { user } = useRole();
  const navigate = useNavigate();
  const { data: lmps = [], isLoading } = useLmpProcesses(
    user.pocProfileName ? { pocName: user.pocProfileName } : undefined
  );

  const active = (lmps as any[]).filter((r) =>
    ACTIVE_LMP_STATUSES.includes(String(r.status ?? ""))
  );

  return (
    <QuickMobileShell title="My LMPs" back>
      {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && active.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No active LMPs assigned to you.</p>
      )}
      <ul className="space-y-2">
        {active.map((r: any) => (
          <li key={r.id}>
            <button
              className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40 active:bg-muted/60 transition-colors"
              style={{ minHeight: "60px" }}
              onClick={() => navigate(`/lmp/${r.id}`)}
            >
              <span className="block text-sm font-semibold leading-tight">{r.company}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{r.role}</span>
              <span className="inline-block mt-1 text-xs bg-muted rounded-full px-2 py-0.5 capitalize">{r.status ?? "—"}</span>
            </button>
          </li>
        ))}
      </ul>
    </QuickMobileShell>
  );
}

// ─── Pending Updates ────────────────────────────────────────────────────────

function PendingUpdatesView() {
  const { user } = useRole();
  const navigate = useNavigate();
  const { data: lmps = [], isLoading } = useLmpProcesses(
    user.pocProfileName ? { pocName: user.pocProfileName } : undefined
  );

  const active = (lmps as any[]).filter((r) =>
    ACTIVE_LMP_STATUSES.includes(String(r.status ?? ""))
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const pending = active.filter((r: any) => {
    const last = r.last_progress_updated_at
      ? String(r.last_progress_updated_at).slice(0, 10)
      : null;
    return !last || last < todayStr;
  });

  return (
    <QuickMobileShell title="Pending Updates" back>
      {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && pending.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">All LMPs have been updated today.</p>
      )}
      <ul className="space-y-2">
        {pending.map((r: any) => (
          <li key={r.id}>
            <button
              className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
              style={{ minHeight: "60px" }}
              onClick={() => navigate(`/quick/progress?lmp=${r.id}`)}
            >
              <span className="block text-sm font-semibold leading-tight">{r.company}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{r.role}</span>
              {r.last_progress_updated_at && (
                <span className="block text-xs text-orange-500 mt-0.5">
                  Last: {new Date(r.last_progress_updated_at).toLocaleDateString()}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </QuickMobileShell>
  );
}

// ─── Daily Progress ──────────────────────────────────────────────────────────

function DailyProgressView() {
  const { user } = useRole();
  const [lmpId, setLmpId] = useState<string | null>(null);
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
        <QuickBottomBar>
          <QuickSubmitButton
            label="Save Progress"
            onClick={handleSubmit}
            loading={addLog.isPending}
            disabled={!lmpId || !text.trim()}
          />
        </QuickBottomBar>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id, label) => { setLmpId(id); setLmpLabel(label); }}
              pocFilter={user.pocProfileName ?? null}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Progress Note</label>
          <textarea
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
            rows={4}
            placeholder="Summarise today's progress, updates, or blockers…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEFAULT_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => toggleChip(chip)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  selectedChips.includes(chip)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </QuickMobileShell>
  );
}

// ─── Next Progress ───────────────────────────────────────────────────────────

function NextProgressView() {
  const { user } = useRole();
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

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <QuickMobileShell
      title="Next Progress"
      back
      footer={
        <QuickBottomBar>
          <QuickSubmitButton
            label="Log No Update"
            onClick={handleSubmit}
            loading={addLog.isPending}
            disabled={!lmpId || !nextDate}
          />
        </QuickBottomBar>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id, label) => { setLmpId(id); setLmpLabel(label); }}
              pocFilter={user.pocProfileName ?? null}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next Expected Update</label>
          <input
            type="date"
            min={todayStr}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reason (optional)</label>
          <textarea
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
            rows={3}
            placeholder="Why no update today?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </QuickMobileShell>
  );
}

// ─── Change Status ───────────────────────────────────────────────────────────

const LMP_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "ongoing", label: "Ongoing" },
  { value: "prep-ongoing", label: "Prep Ongoing" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "dormant", label: "Dormant" },
];

function ChangeStatusView() {
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const handleSave = async () => {
    if (!lmpId || !status) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("lmp_processes")
        .update({ status })
        .eq("id", lmpId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-process", lmpId] });
      toast({ title: "Status updated", description: `${lmpLabel} → ${status}` });
      setLmpId(null);
      setLmpLabel("");
      setStatus("");
    } catch (e: any) {
      toast({ title: "Failed to update status", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <QuickMobileShell
      title="Change Status"
      back
      footer={
        <QuickBottomBar>
          <QuickSubmitButton
            label="Update Status"
            onClick={handleSave}
            loading={saving}
            disabled={!lmpId || !status}
          />
        </QuickBottomBar>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id, label) => { setLmpId(id); setLmpLabel(label); }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New Status</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {LMP_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatus(opt.value)}
                className={`rounded-xl border px-3 py-3 text-sm font-medium text-left transition-colors ${
                  status === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground"
                }`}
                style={{ minHeight: "48px" }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </QuickMobileShell>
  );
}

// ─── Checklist ───────────────────────────────────────────────────────────────

function ChecklistView() {
  const { user } = useRole();
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [note, setNote] = useState("");
  const addLog = useAddProgressLog(lmpId ?? "");

  const handleSubmit = async () => {
    if (!lmpId || !note.trim()) return;
    await addLog.mutateAsync({
      text: note.trim(),
      entry_type: "checklist",
      author_name: user.pocProfileName ?? user.name,
      author_email: user.email,
    });
    setNote("");
    toast({ title: "Checklist note added", description: lmpLabel });
  };

  return (
    <QuickMobileShell
      title="Checklist"
      back
      footer={
        <QuickBottomBar>
          <QuickSubmitButton
            label="Add Note"
            onClick={handleSubmit}
            loading={addLog.isPending}
            disabled={!lmpId || !note.trim()}
          />
        </QuickBottomBar>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id, label) => { setLmpId(id); setLmpLabel(label); }}
              pocFilter={user.pocProfileName ?? null}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checklist Note</label>
          <textarea
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
            rows={4}
            placeholder="What checklist item did you complete or note?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </QuickMobileShell>
  );
}

// ─── Add Candidate ───────────────────────────────────────────────────────────

function AddCandidateView() {
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [names, setNames] = useState("");
  const addCandidates = useAddLmpCandidates();

  const handleSubmit = async () => {
    if (!lmpId || !names.trim()) return;
    const parsed = names
      .split(/[\n,]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (!parsed.length) return;
    await addCandidates.mutateAsync(
      parsed.map((student_name) => ({ lmp_id: lmpId, student_name }))
    );
    setNames("");
  };

  return (
    <QuickMobileShell
      title="Add Candidate"
      back
      footer={
        <QuickBottomBar>
          <QuickSubmitButton
            label="Add Candidates"
            onClick={handleSubmit}
            loading={addCandidates.isPending}
            disabled={!lmpId || !names.trim()}
          />
        </QuickBottomBar>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id, label) => { setLmpId(id); setLmpLabel(label); }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Student Names
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">One per line or comma-separated</p>
          <textarea
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
            rows={5}
            placeholder={"Rahul Sharma\nPriya Patel, Aman Singh"}
            value={names}
            onChange={(e) => setNames(e.target.value)}
          />
        </div>
      </div>
    </QuickMobileShell>
  );
}

// ─── View JD ─────────────────────────────────────────────────────────────────

function ViewJdView() {
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [jdText, setJdText] = useState<string | null>(null);
  const [jdUrl, setJdUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchJd = async (id: string) => {
    setLoading(true);
    setJdText(null);
    setJdUrl(null);
    try {
      const { data } = await supabase
        .from("lmp_jd_versions" as any)
        .select("text, url")
        .eq("lmp_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setJdText((data as any).text ?? null);
        setJdUrl((data as any).url ?? null);
      } else {
        setJdText("No JD found for this LMP.");
      }
    } catch {
      setJdText("Failed to load JD.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <QuickMobileShell title="View JD" back>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id) => { setLmpId(id); fetchJd(id); }}
            />
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading JD…</p>}

        {jdUrl && (
          <a
            href={jdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-primary"
          >
            Open JD Link →
          </a>
        )}

        {jdText && jdText !== "No JD found for this LMP." && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">
            {jdText}
          </div>
        )}

        {jdText === "No JD found for this LMP." && (
          <p className="text-sm text-muted-foreground py-4 text-center">{jdText}</p>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── LMP Summary ─────────────────────────────────────────────────────────────

function LmpSummaryView() {
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSummary = async (id: string) => {
    setLoading(true);
    setSummary(null);
    try {
      const [lmpRes, candidatesRes] = await Promise.all([
        supabase.from("lmp_processes").select("*").eq("id", id).maybeSingle(),
        supabase.from("lmp_candidates").select("*").eq("lmp_id", id),
      ]);
      setSummary({ lmp: lmpRes.data, candidates: candidatesRes.data ?? [] });
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const lmp = summary?.lmp;
  const candidates: any[] = summary?.candidates ?? [];

  return (
    <QuickMobileShell title="LMP Summary" back>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id) => { setLmpId(id); fetchSummary(id); }}
            />
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading summary…</p>}

        {lmp && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold">{lmp.company}</p>
                  <p className="text-sm text-muted-foreground">{lmp.role}</p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{lmp.status ?? "—"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-muted/50 px-2 py-2">
                  <p className="text-muted-foreground">Prep POC</p>
                  <p className="font-medium mt-0.5">{lmp.prep_poc ?? "—"}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-2">
                  <p className="text-muted-foreground">Support POC</p>
                  <p className="font-medium mt-0.5">{lmp.support_poc ?? "—"}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-2">
                  <p className="text-muted-foreground">Candidates</p>
                  <p className="font-medium mt-0.5">{candidates.length}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-2">
                  <p className="text-muted-foreground">Converted</p>
                  <p className="font-medium mt-0.5">{lmp.final_converted_numbers ?? "0"}</p>
                </div>
              </div>
            </div>

            {candidates.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Candidates</p>
                <ul className="space-y-1.5">
                  {candidates.slice(0, 20).map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
                      <span className="font-medium">{c.student_name}</span>
                      <span className="text-xs text-muted-foreground capitalize">{c.pipeline_stage ?? "pool"}</span>
                    </li>
                  ))}
                  {candidates.length > 20 && (
                    <li className="text-xs text-muted-foreground text-center py-1">+{candidates.length - 20} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── Assign POC ──────────────────────────────────────────────────────────────

function AssignPocView() {
  const [lmpId, setLmpId] = useState<string | null>(null);
  const [lmpLabel, setLmpLabel] = useState("");
  const [prepPoc, setPrepPoc] = useState("");
  const [supportPoc, setSupportPoc] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const [pocOptions, setPocOptions] = useState<string[]>([]);

  const fetchPocOptions = async () => {
    const { data } = await supabase.from("poc_profiles").select("name").order("name");
    setPocOptions((data ?? []).map((p: any) => p.name).filter(Boolean));
  };

  const handleSave = async () => {
    if (!lmpId) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (prepPoc) updates.prep_poc = prepPoc;
      if (supportPoc) updates.support_poc = supportPoc;
      if (Object.keys(updates).length === 0) return;
      const { error } = await (supabase as any)
        .from("lmp_processes")
        .update(updates)
        .eq("id", lmpId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-process", lmpId] });
      toast({ title: "POC assigned", description: lmpLabel });
      setPrepPoc("");
      setSupportPoc("");
      setLmpId(null);
      setLmpLabel("");
    } catch (e: any) {
      toast({ title: "Failed to assign POC", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <QuickMobileShell
      title="Assign POC"
      back
      footer={
        <QuickBottomBar>
          <QuickSubmitButton
            label="Save Assignment"
            onClick={handleSave}
            loading={saving}
            disabled={!lmpId || (!prepPoc && !supportPoc)}
          />
        </QuickBottomBar>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">LMP Process</label>
          <div className="mt-1.5">
            <QuickLmpPicker
              value={lmpId}
              onChange={(id, label) => { setLmpId(id); setLmpLabel(label); fetchPocOptions(); }}
            />
          </div>
        </div>

        {lmpId && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prep POC</label>
              <select
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={prepPoc}
                onChange={(e) => setPrepPoc(e.target.value)}
              >
                <option value="">— select prep POC —</option>
                {pocOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Support POC</label>
              <select
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={supportPoc}
                onChange={(e) => setSupportPoc(e.target.value)}
              >
                <option value="">— select support POC —</option>
                {pocOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </QuickMobileShell>
  );
}

// ─── POC Load ────────────────────────────────────────────────────────────────

function PocLoadView() {
  const { data, isLoading } = usePocLiveLoads();
  const byPoc = data?.byPoc ?? {};

  const sorted = Object.entries(byPoc).sort((a, b) => b[1].total - a[1].total);

  return (
    <QuickMobileShell title="POC Load" back>
      {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>}
      {!isLoading && sorted.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">No POC data available.</p>
      )}
      <ul className="space-y-2">
        {sorted.map(([name, b]) => (
          <li key={name} className="rounded-xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold leading-tight">{name}</span>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {b.total} active
              </span>
            </div>
            <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
              <span>Prep: {b.prep}</span>
              <span>Support: {b.support}</span>
              {b.outreach > 0 && <span>Outreach: {b.outreach}</span>}
              <span className="ml-auto text-foreground/60">Hist: {b.historicalTotal}</span>
            </div>
          </li>
        ))}
      </ul>
    </QuickMobileShell>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function QuickActionsPage() {
  return (
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
    </Routes>
  );
}
