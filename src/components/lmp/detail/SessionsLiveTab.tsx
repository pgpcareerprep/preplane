import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar, Star, Loader2, MessageCircle, Mail, Copy, Users, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CreateSessionDialog } from "./sessions/CreateSessionDialog";
import { EditSessionDialog } from "./sessions/EditSessionDialog";
import { POCFeedbackModal } from "./sessions/POCFeedbackModal";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Session as MockSession } from "@/lib/session";

const STATUS_CLS: Record<string, string> = {
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  completed: "bg-sage-50 text-sage-700 border-sage-200",
  cancelled: "bg-n100 text-n600 border-n200",
  "no-show": "bg-coral-50 text-coral-600 border-coral-200",
  rescheduled: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

const TYPE_LABEL: Record<string, string> = {
  mock: "Mock interview",
  prep: "Prep session",
  feedback: "Feedback",
  other: "Other",
};

type Row = any;

export function SessionsLiveTab({ lmpId, readOnly = false }: { lmpId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [feedbackRow, setFeedbackRow] = useState<{ row: Row; candidates: { id: string | null; name: string }[] } | null>(null);
  const [shareRow, setShareRow] = useState<Row | null>(null);
  const [reschedRow, setReschedRow] = useState<Row | null>(null);
  const [reschedAt, setReschedAt] = useState("");
  const [groupModal, setGroupModal] = useState<GroupedSession | null>(null);
  const [editGroup, setEditGroup] = useState<GroupedSession | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    enabled: !!lmpId,
    queryKey: ["lmp-sessions", lmpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, lmp_id, session_type, status, scheduled_at, duration_min, notes, mentor_rating, student_rating, mentor_id, student_id, candidate_ids, poc_feedback, student_feedback, student_feedback_token")
        .eq("lmp_id", lmpId)
        .order("scheduled_at", { ascending: false, nullsFirst: false });
      if (error) {
        console.error("[SessionsLiveTab] sessions query error:", error);
        throw error;
      }
      return data ?? [];
    },
  });

  // Resolve mentor names separately to avoid FK dependency on mentors table
  const allMentorIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) { if (s.mentor_id) set.add(s.mentor_id); }
    return Array.from(set);
  }, [sessions]);

  const { data: mentorMap = {} as Record<string, string> } = useQuery({
    enabled: allMentorIds.length > 0,
    queryKey: ["lmp-sessions-mentors", allMentorIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase.from("mentors").select("id,name").in("id", allMentorIds);
      const m: Record<string, string> = {};
      for (const r of data ?? []) m[r.id] = r.name;
      return m;
    },
  });

  // Collect all IDs from candidate_ids (lmp_candidate IDs for new sessions) +
  // student_id (students.id FK) for name resolution.
  const allCandidateIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.student_id) set.add(s.student_id);
      for (const cid of (s.candidate_ids ?? [])) if (cid) set.add(cid);
    }
    return Array.from(set);
  }, [sessions]);

  // Primary: lmp_candidates.id → student_name (works for new sessions)
  const { data: lmpCandRows = [] } = useQuery({
    enabled: allCandidateIds.length > 0,
    queryKey: ["sessions-lmp-candidates", allCandidateIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("lmp_candidates").select("id,student_name").in("id", allCandidateIds);
      return (data ?? []) as { id: string; student_name: string | null }[];
    },
  });

  // Fallback: students.id → name (works for old sessions with student UUIDs)
  const { data: studentRows = [] } = useQuery({
    enabled: allCandidateIds.length > 0,
    queryKey: ["sessions-students", allCandidateIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("students").select("id,name,email").in("id", allCandidateIds);
      return (data ?? []) as { id: string; name: string; email?: string | null }[];
    },
  });

  const studentMap = useMemo(() => {
    const m: Record<string, { name: string; email?: string | null }> = {};
    for (const r of studentRows) m[r.id] = { name: r.name, email: r.email };
    for (const c of lmpCandRows) if (c.student_name) m[c.id] = { name: c.student_name };
    return m;
  }, [studentRows, lmpCandRows]);

  // Group sessions: explicit (candidate_ids.length > 1) OR legacy duplicates
  // sharing (mentor_id, scheduled_at, session_type).
  const grouped: GroupedSession[] = useMemo(() => buildGroups(sessions, studentMap), [sessions, studentMap]);

  const updateStatus = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Record<string, any> }) => {
      const { error } = await supabase.from("sessions").update(patch as any).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lmp-sessions", lmpId] });
      qc.invalidateQueries({ queryKey: ["poc-pending-feedback"] });
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const deleteSessions = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("sessions").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lmp-sessions", lmpId] });
      qc.invalidateQueries({ queryKey: ["poc-pending-feedback"] });
      toast.success("Session deleted");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const handleDelete = (g: GroupedSession) => {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    deleteSessions.mutate(g.sessionIds);
  };

  const handleMarkComplete = (g: GroupedSession) => {
    // Auto-generate a student feedback token if the session doesn't have one.
    // This enables the copy-link feature in the Feedback tab immediately.
    const feedbackToken = g.primary.student_feedback_token
      ?? crypto.randomUUID().replace(/-/g, "");
    updateStatus.mutate(
      {
        ids: g.sessionIds,
        patch: {
          status: "completed",
          completed_at: new Date().toISOString(),
          student_feedback_token: feedbackToken,
        },
      },
      {
        onSuccess: () => {
          toast.success("Session marked complete — fill POC feedback");
          setFeedbackRow({ row: { ...g.primary, status: "completed", student_feedback_token: feedbackToken }, candidates: g.candidates });
        },
      },
    );
  };
  const handleNoShow = (g: GroupedSession) => {
    updateStatus.mutate({ ids: g.sessionIds, patch: { status: "no-show" } }, { onSuccess: () => toast.success("Marked as no-show") });
  };
  const handleCancel = (g: GroupedSession) => {
    if (!confirm("Cancel this session?")) return;
    updateStatus.mutate({ ids: g.sessionIds, patch: { status: "cancelled" } }, { onSuccess: () => toast.success("Session cancelled") });
  };
  const openReschedule = (g: GroupedSession) => {
    setReschedRow({ ...g.primary, __ids: g.sessionIds });
    setReschedAt(g.primary.scheduled_at ? new Date(g.primary.scheduled_at).toISOString().slice(0, 16) : "");
  };
  const confirmReschedule = () => {
    if (!reschedRow || !reschedAt) return;
    const oldLabel = reschedRow.scheduled_at ? new Date(reschedRow.scheduled_at).toLocaleString() : "unscheduled";
    const ids: string[] = reschedRow.__ids ?? [reschedRow.id];
    updateStatus.mutate(
      {
        ids,
        patch: {
          status: "rescheduled",
          scheduled_at: new Date(reschedAt).toISOString(),
          notes: [reschedRow.notes, `Rescheduled from ${oldLabel}`].filter(Boolean).join(" · "),
        },
      },
      { onSuccess: () => { toast.success("Session rescheduled"); setReschedRow(null); } },
    );
  };

  const toMockSession = (s: Row): MockSession => {
    const mentorName = (s.mentor_id ? mentorMap[s.mentor_id] : null) || "Unassigned mentor";
    const studentName = (s.student_id ? studentMap[s.student_id]?.name : null) || "Unassigned candidate";
    const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "·";
    return {
      id: s.id,
      reqId: s.lmp_id,
      mentor: { name: mentorName, initials: initials(mentorName), color: "bg-teal-200 text-teal-600" },
      candidate: { name: studentName, initials: initials(studentName), color: "bg-orange-200 text-orange-600" },
      date: s.scheduled_at || "",
      dateLabel: s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : "",
      round: s.session_type || "session",
      status: "completed",
    };
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[18px] font-semibold text-n900">Sessions</h3>
          <span className="rounded-full bg-n100 text-n700 text-[11px] font-medium px-2 py-0.5 tabular-nums">
            {grouped.length}
          </span>
        </div>
        <Button onClick={() => setOpen(true)} size="sm" disabled={readOnly} title={readOnly ? "Read-only — you are not a POC on this LMP" : undefined} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50">
          + Schedule session
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-n200 p-8 text-center text-[13px] text-n500">Loading…</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-n300 bg-card p-12 text-center text-[13px] text-n500">
          No sessions scheduled for this LMP process yet.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => {
            const s = g.primary;
            const mentorName = (s.mentor_id ? mentorMap[s.mentor_id] : null) || "Unassigned mentor";
            const isGroup = g.candidates.length > 1;
            const studentName = isGroup
              ? "Group Session"
              : (g.candidates[0]?.name || "Unassigned candidate");
            const date = s.scheduled_at ? new Date(s.scheduled_at) : null;
            const hasPocFeedback = !!s.poc_feedback;
            const hasStudentFeedback = !!s.student_feedback;
            return (
              <div key={g.key} className="rounded-xl border border-n200 bg-card p-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg grid place-items-center bg-orange-50 text-orange-600 shrink-0">
                    {isGroup ? <Users className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-n900 text-[14px] truncate">{mentorName}</span>
                      <span className="text-n400 text-[12px]">→</span>
                      <span className="text-n700 text-[13px] truncate">{studentName}</span>
                      {isGroup && (
                        <button
                          onClick={() => setGroupModal(g)}
                          className="text-[11px] font-medium text-orange-600 hover:text-orange-700 hover:underline tabular-nums"
                        >
                          {g.candidates.length} candidates
                        </button>
                      )}
                    </div>
                    <div className="text-[11.5px] text-n500 mt-0.5">
                      {date ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Unscheduled"}
                      {s.duration_min ? ` · ${s.duration_min}m` : ""}
                      {s.session_type ? ` · ${TYPE_LABEL[s.session_type] || s.session_type}` : ""}
                    </div>
                    {s.notes ? (
                      <div className="text-[12px] text-n600 mt-1 line-clamp-1 italic">"{s.notes}"</div>
                    ) : null}
                  </div>
                  {s.mentor_rating ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-n700">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {Number(s.mentor_rating).toFixed(1)}
                    </span>
                  ) : null}
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_CLS[s.status] || "bg-n100 text-n600 border-n200")}>
                    {s.status}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md text-n500 hover:text-n800 hover:bg-n100"
                        aria-label="Session actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onClick={() => setEditGroup(g)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit session
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(g)}
                        className="text-coral-600 focus:text-coral-700"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete session
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Action row */}
                <div className="mt-3 flex flex-wrap gap-2 pl-14">
                  {s.status === "scheduled" && (
                    <>
                      <ActBtn variant="primary" onClick={() => handleMarkComplete(g)} disabled={updateStatus.isPending}>Mark Complete</ActBtn>
                      <ActBtn variant="ghost-coral" onClick={() => handleNoShow(g)}>No-show</ActBtn>
                      <ActBtn variant="secondary" onClick={() => openReschedule(g)}>Reschedule</ActBtn>
                      <ActBtn variant="danger" onClick={() => handleCancel(g)}>Cancel</ActBtn>
                    </>
                  )}
                  {s.status === "completed" && !hasPocFeedback && (
                    <ActBtn variant="primary" onClick={() => setFeedbackRow({ row: s, candidates: g.candidates })}>Fill POC feedback →</ActBtn>
                  )}
                  {s.status === "completed" && hasPocFeedback && !hasStudentFeedback && !isGroup && (
                    <ActBtn variant="secondary" onClick={() => setShareRow(s)}>Share student link</ActBtn>
                  )}
                  {s.status === "completed" && hasStudentFeedback && (
                    <span className="text-[12px] text-sage-600">✓ All feedback collected</span>
                  )}
                  {(s.status === "no-show" || s.status === "cancelled") && (
                    <ActBtn variant="secondary" onClick={() => openReschedule(g)}>Reschedule</ActBtn>
                  )}
                  {s.status === "rescheduled" && (
                    <span className="text-[12px] text-n500">Awaiting new session start</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Group candidates modal */}
      <Dialog open={!!groupModal} onOpenChange={(o) => !o && setGroupModal(null)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader><DialogTitle>Group Session Candidates</DialogTitle></DialogHeader>
          {groupModal && (
            <div className="space-y-3">
              <div className="text-[12.5px] text-n600 space-y-0.5">
                <div><span className="text-n500">Mentor:</span> <span className="text-n800 font-medium">{(groupModal.primary.mentor_id ? mentorMap[groupModal.primary.mentor_id] : null) || "Unassigned"}</span></div>
                <div><span className="text-n500">When:</span> {groupModal.primary.scheduled_at ? new Date(groupModal.primary.scheduled_at).toLocaleString() : "Unscheduled"}</div>
                <div><span className="text-n500">Type:</span> {TYPE_LABEL[groupModal.primary.session_type] || groupModal.primary.session_type || "session"}</div>
              </div>
              <div className="rounded-md border border-n200 divide-y divide-n100">
                {groupModal.candidates.map((c, i) => {
                  const ids = c.sessionIds && c.sessionIds.length > 0 ? c.sessionIds : groupModal.sessionIds;
                  const canAct = !readOnly && groupModal.primary.status === "scheduled";
                  return (
                    <div key={c.id || i} className="px-3 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-n800 truncate">{c.name}</div>
                        {c.email && <div className="text-[11.5px] text-n500 truncate">{c.email}</div>}
                      </div>
                      {canAct ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => updateStatus.mutate(
                              { ids, patch: { status: "completed", completed_at: new Date().toISOString() } },
                              { onSuccess: () => toast.success(`${c.name} marked complete`) },
                            )}
                            disabled={updateStatus.isPending}
                            className="h-7 px-2.5 rounded-md text-[11.5px] font-medium bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => updateStatus.mutate(
                              { ids, patch: { status: "no-show" } },
                              { onSuccess: () => toast.success(`${c.name} marked no-show`) },
                            )}
                            disabled={updateStatus.isPending}
                            className="h-7 px-2.5 rounded-md text-[11.5px] font-medium text-coral-600 hover:bg-coral-50"
                          >
                            No-show
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-n500 capitalize">{c.attendance || groupModal.primary.status || "scheduled"}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CreateSessionDialog open={open} onOpenChange={setOpen} lmpId={lmpId} />

      <EditSessionDialog
        open={!!editGroup}
        onOpenChange={(o) => !o && setEditGroup(null)}
        lmpId={lmpId}
        group={editGroup}
      />

      {/* POC Feedback Modal */}
      <POCFeedbackModal
        open={!!feedbackRow}
        onOpenChange={(o) => !o && setFeedbackRow(null)}
        session={feedbackRow ? toMockSession(feedbackRow.row) : null}
        dbSessionId={feedbackRow?.row.id}
        candidates={feedbackRow?.candidates}
        onComplete={() => {
          qc.invalidateQueries({ queryKey: ["lmp-sessions", lmpId] });
          qc.invalidateQueries({ queryKey: ["poc-pending-feedback"] });
        }}
      />

      {/* Share student link modal (re-uses POCFeedbackModal success state semantics) */}
      <Dialog open={!!shareRow} onOpenChange={(o) => !o && setShareRow(null)}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader><DialogTitle>Share student feedback link</DialogTitle></DialogHeader>
          {shareRow?.student_feedback_token ? (
            <ShareLinkBlock
              link={`${window.location.origin}/feedback/${shareRow.student_feedback_token}`}
              candidateName={(shareRow.student_id ? studentMap[shareRow.student_id]?.name : null) || "the candidate"}
            />
          ) : (
            <p className="text-[13px] text-n500">No student token on this session.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule modal */}
      <Dialog open={!!reschedRow} onOpenChange={(o) => !o && setReschedRow(null)}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader><DialogTitle>Reschedule session</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>New date & time</Label>
            <Input type="datetime-local" value={reschedAt} onChange={(e) => setReschedAt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedRow(null)}>Cancel</Button>
            <Button onClick={confirmReschedule} disabled={!reschedAt || updateStatus.isPending}>
              {updateStatus.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActBtn({
  children, onClick, variant, disabled,
}: {
  children: React.ReactNode; onClick: () => void;
  variant: "primary" | "secondary" | "ghost-coral" | "danger";
  disabled?: boolean;
}) {
  const cls = {
    primary:      "bg-orange-500 hover:bg-orange-600 text-white",
    secondary:    "bg-card border border-n300 text-n700 hover:bg-n100",
    "ghost-coral":"text-coral-600 hover:bg-coral-50",
    danger:       "text-coral-600 hover:bg-coral-50 border border-transparent",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("h-8 px-3 rounded-md text-[12px] font-medium transition-colors disabled:opacity-50", cls)}
    >
      {children}
    </button>
  );
}

function ShareLinkBlock({ link, candidateName }: { link: string; candidateName: string }) {
  const wa = `https://wa.me/?text=${encodeURIComponent(`Hi ${candidateName}, please share your session feedback: ${link}`)}`;
  const mail = `mailto:?subject=${encodeURIComponent("Your session feedback")}&body=${encodeURIComponent(`Hi ${candidateName},\n\nPlease share your session feedback here: ${link}\n\nThank you!`)}`;
  return (
    <div>
      <p className="text-[13px] text-n600 mb-2">Share this link with {candidateName}:</p>
      <div className="flex items-center gap-2 rounded-lg bg-n100 border border-n200 p-3">
        <code className="flex-1 truncate text-left text-[12px] font-mono text-n700">{link}</code>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copied"); }}
          className="h-10 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium inline-flex items-center justify-center gap-1.5"
        >
          <Copy className="h-3.5 w-3.5" /> Copy Link
        </button>
        <a href={wa} target="_blank" rel="noreferrer" className="h-10 rounded-md bg-sage-500 hover:bg-sage-600 text-white text-[12px] font-medium inline-flex items-center justify-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
        </a>
        <a href={mail} className="h-10 rounded-md bg-card border border-n300 hover:bg-n100 text-n700 text-[12px] font-medium inline-flex items-center justify-center gap-1.5">
          <Mail className="h-3.5 w-3.5" /> Email
        </a>
      </div>
    </div>
  );
}

// ─── Session grouping helpers ────────────────────────────────────────────────

type CandidateInfo = { id: string | null; name: string; email?: string | null; attendance?: string | null; sessionIds?: string[] };
type GroupedSession = {
  key: string;
  primary: Row;
  sessionIds: string[];
  candidates: CandidateInfo[];
};

function buildGroups(
  sessions: Row[],
  studentMap: Record<string, { name: string; email?: string | null }>,
): GroupedSession[] {
  const out: GroupedSession[] = [];
  // Bucket EVERY session by (mentor_id|scheduled_at|session_type) so that
  // duplicate group-session rows (one DB row per candidate) collapse into a
  // single card, and explicit candidate_ids[] sessions don't get rendered N
  // times when the scheduler created N copies at the same slot.
  const buckets = new Map<string, Row[]>();
  for (const s of sessions) {
    const k = `${s.mentor_id || "_"}|${s.scheduled_at || "_"}|${s.session_type || "_"}`;
    const list = buckets.get(k) ?? [];
    list.push(s);
    buckets.set(k, list);
  }

  for (const list of buckets.values()) {
    const primary = list[0];
    // Union all candidate refs across the rows: explicit candidate_ids[] +
    // legacy student_id (one row per candidate).
    const candById = new Map<string, CandidateInfo & { sessionIds: string[] }>();
    const anonRows: { row: Row; cand: CandidateInfo }[] = [];
    for (const r of list) {
      const explicit: string[] = Array.isArray(r.candidate_ids)
        ? r.candidate_ids.filter(Boolean)
        : [];
      const ids = explicit.length > 0
        ? explicit
        : (r.student_id ? [r.student_id] : []);
      if (ids.length === 0) {
        anonRows.push({
          row: r,
          cand: { id: null, name: "Unassigned candidate" },
        });
        continue;
      }
      for (const id of ids) {
        const existing = candById.get(id);
        if (existing) {
          if (!existing.sessionIds.includes(r.id)) existing.sessionIds.push(r.id);
        } else {
          candById.set(id, {
            id,
            name: studentMap[id]?.name || "Unknown candidate",
            email: studentMap[id]?.email ?? null,
            sessionIds: [r.id],
          });
        }
      }
    }
    const candidates: CandidateInfo[] = [
      ...Array.from(candById.values()),
      ...anonRows.map((a) => a.cand),
    ];
    const sessionIds = Array.from(new Set(list.map((r) => r.id)));
    out.push({
      key: list.length > 1 || candidates.length > 1
        ? `g:${primary.mentor_id}:${primary.scheduled_at}:${primary.session_type}`
        : `s:${primary.id}`,
      primary,
      sessionIds,
      candidates,
    });
  }

  out.sort((a, b) => {
    const da = a.primary.scheduled_at ? Date.parse(a.primary.scheduled_at) : 0;
    const db = b.primary.scheduled_at ? Date.parse(b.primary.scheduled_at) : 0;
    return db - da;
  });
  return out;
}
