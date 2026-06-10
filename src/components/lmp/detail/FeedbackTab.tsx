import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { motion } from "framer-motion";
import { Loader2, Star, Copy, RefreshCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { StudentFeedbackDrawer } from "./feedback/StudentFeedbackDrawer";
import { copySessionFeedbackLink, issueSessionFeedbackToken } from "@/lib/feedbackTokens";

type Row = {
  id: string;
  session_type: string | null;
  status: string;
  scheduled_at: string | null;
  mentor_rating: number | null;
  student_rating: number | null;
  poc_feedback: string | null;
  student_feedback: any | null;
  student_feedback_token: string | null;
  mentor_id: string | null;
  student_id: string | null;
  candidate_ids: string[] | null;
};

function studentRating(s: Row): number | null {
  if (s.student_rating != null) return Number(s.student_rating);
  const r = s.student_feedback?.rating;
  return r != null && !isNaN(Number(r)) ? Number(r) : null;
}

function pocRating(s: Row): number | null {
  if (s.mentor_rating != null && !isNaN(Number(s.mentor_rating))) return Number(s.mentor_rating);
  // Fallback: derive from poc_feedback JSON (form values keyed by field id).
  const raw = s.poc_feedback;
  if (!raw) return null;
  let parsed: any = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const ratings: number[] = [];
  for (const v of Object.values(parsed)) {
    if (typeof v === "number" && v >= 1 && v <= 5) ratings.push(v);
    else if (v && typeof v === "object") {
      for (const inner of Object.values(v as any)) {
        const n = Number(inner);
        if (!isNaN(n) && n >= 1 && n <= 5) ratings.push(n);
      }
    }
  }
  return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
}

/**
 * Combined per-session mentor rating: average of POC's mentor_rating and the
 * student-submitted rating when both exist; otherwise whichever is present.
 * Returns null when neither side has rated.
 */
function combinedSessionRating(s: Row): number | null {
  const parts = [pocRating(s), studentRating(s)].filter((r): r is number => r != null);
  if (!parts.length) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// Kept for the per-row "Student Feedback" cell which shows only the student's stars.
const ratingFromFeedback = studentRating;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function FeedbackTab({ reqId: lmpId, readOnly = false }: { reqId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [regenId, setRegenId] = useState<string | null>(null);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    enabled: !!lmpId,
    queryKey: ["lmp-sessions", lmpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, session_type, status, scheduled_at, mentor_rating, student_rating, poc_feedback, student_feedback, student_feedback_token, mentor_id, student_id, candidate_ids")
        .eq("lmp_id", lmpId)
        .order("scheduled_at", { ascending: false, nullsFirst: false });
      if (error) {
        console.error("[FeedbackTab] sessions query error:", error);
        throw error;
      }
      return (data ?? []) as Row[];
    },
  });

  // Fetch mentor names separately (no FK dependency on mentors table)
  const allMentorIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) { if (s.mentor_id) set.add(s.mentor_id); }
    return Array.from(set);
  }, [sessions]);

  const { data: mentorNameMap = {} as Record<string, string> } = useQuery({
    enabled: allMentorIds.length > 0,
    queryKey: ["feedback-mentors", allMentorIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase.from("mentors").select("id,name").in("id", allMentorIds);
      const m: Record<string, string> = {};
      for (const r of data ?? []) m[r.id] = r.name;
      return m;
    },
  });

  const mentorName = useCallback((s: Row) => (s.mentor_id ? mentorNameMap[s.mentor_id] : null) ?? "Unassigned mentor", [mentorNameMap]);

  // Realtime: refresh when sessions or student feedbacks change for this LMP
  useRealtimeInvalidate("sessions", [["lmp-sessions", lmpId]], {
    filter: `lmp_id=eq.${lmpId}`,
    enabled: !!lmpId,
  });

  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  useRealtimeInvalidate("session_student_feedbacks", [
    ["lmp-session-student-feedbacks", lmpId, sessionIds],
    ["lmp-sessions", lmpId],
  ], { enabled: !!lmpId });

  const { data: studentFeedbacks = [] } = useQuery({
    enabled: sessionIds.length > 0,
    queryKey: ["lmp-session-student-feedbacks", lmpId, sessionIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_student_feedbacks")
        .select("session_id, student_id, student_rating, mentor_rating")
        .in("session_id", sessionIds);
      if (error) throw error;
      return (data ?? []) as { session_id: string; student_id: string; student_rating: number | null; mentor_rating: number | null }[];
    },
  });

  const submittedBySession = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const f of studentFeedbacks) {
      if (!map.has(f.session_id)) map.set(f.session_id, new Set());
      map.get(f.session_id)!.add(f.student_id);
    }
    return map;
  }, [studentFeedbacks]);

  const candidateCount = (s: Row): number => {
    const ids = (s.candidate_ids?.length ? s.candidate_ids : (s.student_id ? [s.student_id] : []));
    return ids.length;
  };

  // All candidate IDs across every session. candidate_ids stores lmp_candidates.id
  // values (for sessions created after the June 2026 fix); older sessions may store
  // student.id values or be empty. student_id is always a students.id FK when set.
  const allCandidateIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      for (const id of s.candidate_ids ?? []) if (id) set.add(id);
      if (s.student_id) set.add(s.student_id);
    }
    return Array.from(set);
  }, [sessions]);

  // Primary lookup: lmp_candidates.id → student_name (canonical for new sessions)
  const { data: lmpCandidateNames = [] } = useQuery({
    enabled: allCandidateIds.length > 0,
    queryKey: ["feedback-lmp-candidates", allCandidateIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("lmp_candidates")
        .select("id, student_name")
        .in("id", allCandidateIds);
      return (data ?? []) as { id: string; student_name: string | null }[];
    },
  });

  // Fallback lookup: students.id → name (for older sessions that stored student UUIDs)
  const { data: studentNames = [] } = useQuery({
    enabled: allCandidateIds.length > 0,
    queryKey: ["feedback-students", allCandidateIds.sort().join(",")],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, name")
        .in("id", allCandidateIds);
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const studentsById = useMemo(() => {
    const map = new Map<string, string>();
    // Students fallback first (lower priority)
    for (const s of studentNames) if (s.name) map.set(s.id, s.name);
    // lmp_candidates takes priority (has student_name even without students FK)
    for (const c of lmpCandidateNames) if (c.student_name) map.set(c.id, c.student_name);
    return map;
  }, [lmpCandidateNames, studentNames]);

  const candidateNames = (s: Row): string[] => {
    const ids = (s.candidate_ids?.length ? s.candidate_ids : (s.student_id ? [s.student_id] : []));
    return ids.map((id) => studentsById.get(id) ?? "Unknown").filter(Boolean);
  };

  // Collapse duplicate rows that share (mentor + scheduled_at + session_type).
  // The scheduler can create N copies for a group session (one per candidate);
  // we merge them so each card / row represents a single session.
  const collapsedSessions = useMemo(() => {
    const buckets = new Map<string, Row[]>();
    for (const s of sessions) {
      const k = `${s.mentor_id || "_"}|${s.scheduled_at || "_"}|${s.session_type || "_"}`;
      const list = buckets.get(k) ?? [];
      list.push(s);
      buckets.set(k, list);
    }
    const merged: (Row & { __mergedIds: string[] })[] = [];
    for (const list of buckets.values()) {
      const primary = list[0];
      // Union candidate_ids + each row's student_id across duplicates.
      const candSet = new Set<string>();
      for (const r of list) {
        if (Array.isArray(r.candidate_ids)) for (const id of r.candidate_ids) if (id) candSet.add(id);
        if (r.student_id) candSet.add(r.student_id);
      }
      // Prefer any row that has poc_feedback / student_feedback when picking primary.
      const withPoc = list.find((r) => r.poc_feedback) ?? primary;
      const withStudent = list.find((r) => r.student_feedback) ?? primary;
      merged.push({
        ...primary,
        poc_feedback: withPoc.poc_feedback,
        mentor_rating: withPoc.mentor_rating ?? primary.mentor_rating,
        student_feedback: withStudent.student_feedback,
        student_rating: withStudent.student_rating ?? primary.student_rating,
        candidate_ids: Array.from(candSet),
        __mergedIds: list.map((r) => r.id),
      });
    }
    merged.sort((a, b) => {
      const da = a.scheduled_at ? Date.parse(a.scheduled_at) : 0;
      const db = b.scheduled_at ? Date.parse(b.scheduled_at) : 0;
      return db - da;
    });
    return merged;
  }, [sessions]);

  // Aggregate "student submitted" by counting unique (session_id within the
  // merged group, student_id) pairs.
  const submittedForMerged = (m: { __mergedIds: string[] }): Set<string> => {
    const out = new Set<string>();
    for (const sid of m.__mergedIds) {
      const set = submittedBySession.get(sid);
      if (set) for (const v of set) out.add(v);
    }
    return out;
  };

  const totals = useMemo(() => {
    const total = collapsedSessions.length;
    const poc = collapsedSessions.filter((s) => !!s.poc_feedback).length;
    const totalSlots = collapsedSessions.reduce((acc, s) => acc + candidateCount(s), 0);
    const studentSubmitted = collapsedSessions.reduce((acc, s) => {
      const submitted = submittedForMerged(s).size;
      if (submitted === 0 && s.student_feedback && candidateCount(s) <= 1) return acc + 1;
      return acc + submitted;
    }, 0);
    const ratings = collapsedSessions.map(combinedSessionRating).filter((r): r is number => r != null);
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    return { total, poc, studentSubmitted, totalSlots, avg, ratingsCount: ratings.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedSessions, submittedBySession]);

  const groups = useMemo(() => {
    const map = new Map<string, { mentorId: string | null; mentorName: string; rows: (Row & { __mergedIds: string[] })[] }>();
    for (const s of collapsedSessions) {
      const key = s.mentor_id ?? "unassigned";
      const name = mentorName(s);
      if (!map.has(key)) map.set(key, { mentorId: s.mentor_id, mentorName: name, rows: [] });
      map.get(key)!.rows.push(s);
    }
    return Array.from(map.values()).map((g) => {
      const ratings = g.rows.map(combinedSessionRating).filter((r): r is number => r != null);
      return {
        ...g,
        avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
        submitted: ratings.length,
      };
    });
  }, [collapsedSessions, mentorName]);

  const copyLink = async (sessionId: string) => {
    try {
      await copySessionFeedbackLink(sessionId);
      toast.success("Fresh student feedback link copied");
    } catch (error) {
      toast.error(`Failed: ${(error as Error).message}`);
    }
  };

  const regenerate = async () => {
    if (!regenId) return;
    try {
      await issueSessionFeedbackToken(regenId);
      toast.success("Feedback link rotated");
    } catch (error) {
      toast.error(`Failed: ${(error as Error).message}`);
      return;
    }
    qc.invalidateQueries({ queryKey: ["lmp-sessions", lmpId] });
    setRegenId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-n500 text-[13px]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading feedback…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div>
        <h3 className="text-[18px] font-semibold text-n900 mb-3">Feedback Tracker</h3>
        <div className="rounded-2xl bg-card border border-dashed border-n300 p-12 text-center text-[13px] text-n500">
          No sessions scheduled for this LMP process yet. Once the POC fills mentor feedback or the student submits via their link, it will appear here.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[18px] font-semibold text-n900">Feedback Tracker</h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Stat label="Total sessions" value={totals.total} tone="n" />
        <Stat label="POC submitted" value={`${totals.poc}/${totals.total}`} tone="sage" />
        <Stat label="Student submitted" value={`${totals.studentSubmitted}/${totals.totalSlots}`} tone="orange" />
        <Stat
          label={`Avg mentor rating${totals.ratingsCount ? ` (${totals.ratingsCount})` : ""}`}
          value={totals.ratingsCount ? totals.avg.toFixed(2) : "—"}
          tone="amber"
          title="Average of POC and student ratings per session. Sessions where only the POC has rated still contribute the POC's score."
        />
      </div>

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.mentorId ?? "unassigned"} className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-n50 border-b border-n100">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold text-n800">{g.mentorName}</span>
                <span className="text-[11px] text-n500">{g.rows.length} session{g.rows.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[12px] text-amber-600">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span className="tabular-nums font-medium">
                  {g.submitted ? g.avg.toFixed(2) : "—"}
                </span>
                <span className="text-n400">({g.submitted} feedback{g.submitted !== 1 ? "s" : ""})</span>
              </div>
            </div>

            <table className="w-full text-[13px]">
              <thead className="text-n500 text-[11px] uppercase tracking-[0.5px] border-b border-n100">
                <tr>
                  <Th>Session</Th>
                  <Th>Candidate</Th>
                  <Th>Date</Th>
                  <Th>POC Feedback</Th>
                  <Th>Student Feedback</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((s, i) => {
                  const hasPoc = !!s.poc_feedback;
                  const submittedSet = submittedForMerged(s);
                  const candidateIds = (s.candidate_ids?.length ? s.candidate_ids : (s.student_id ? [s.student_id] : [])) as string[];
                  const submittedCount = submittedSet.size || (s.student_feedback && candidateIds.length <= 1 ? 1 : 0);
                  const totalCands = candidateIds.length || 1;
                  const allStudentSubmitted = submittedCount >= totalCands;
                  const hasAnyStudent = submittedCount > 0;
                  const rating = ratingFromFeedback(s);
                  const names = candidateNames(s);
                  const isGroup = names.length > 1;
                  return (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-t border-n100 hover:bg-n50/60 transition-colors"
                    >
                      <Td className="font-medium text-n800">
                        {(s.session_type ?? "session").replace(/^./, c => c.toUpperCase())}
                        {isGroup && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 text-[10px] font-semibold">
                            Group · {names.length}
                          </span>
                        )}
                      </Td>
                      <Td title={isGroup ? names.join(", ") : undefined}>
                        {names.length === 0 ? "—" : isGroup ? (
                          <div className="flex flex-col gap-0.5">
                            {names.slice(0, 3).map((n, idx) => (
                              <span key={idx} className="text-n700">{n}</span>
                            ))}
                            {names.length > 3 && (
                              <span className="text-n500 text-[11.5px]">+{names.length - 3} more</span>
                            )}
                          </div>
                        ) : names[0]}
                      </Td>
                      <Td className="text-n600 whitespace-nowrap">{fmtDate(s.scheduled_at)}</Td>
                      <Td>
                        {hasPoc ? (
                          <span className="inline-flex items-center gap-1.5 text-sage-600">
                            ✓ Submitted
                            {s.mentor_rating != null && (
                              <span className="inline-flex items-center gap-0.5 text-amber-600 ml-1">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                <span className="tabular-nums">{Number(s.mentor_rating).toFixed(1)}</span>
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-yellow-600">⏳ Pending</span>
                        )}
                      </Td>
                      <Td>
                        {isGroup ? (
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "inline-flex items-center gap-1 text-[12.5px]",
                              allStudentSubmitted ? "text-sage-600" : "text-n600",
                            )}>
                              {allStudentSubmitted ? "✓" : "⏳"} {submittedCount}/{totalCands} submitted
                            </span>
                            <button
                              onClick={() => setDrawerKey(s.id)}
                              className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 text-[12px] font-medium"
                            >
                              <Eye className="h-3 w-3" /> View
                            </button>
                          </div>
                        ) : allStudentSubmitted ? (
                          <span className="inline-flex items-center gap-1.5 text-sage-600">
                            ✓ Submitted
                            {rating != null && (
                              <span className="inline-flex items-center gap-0.5 text-amber-600 ml-1">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                <span className="tabular-nums">{rating.toFixed(1)}</span>
                              </span>
                            )}
                          </span>
                        ) : !readOnly ? (
                          <span className="inline-flex items-center gap-2 text-n500">
                            ⏳ Waiting
                            <button
                              onClick={() => copyLink(s.id)}
                              className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium"
                            >
                              <Copy className="h-3 w-3" /> Copy link
                            </button>
                            <button
                              onClick={() => setRegenId(s.id)}
                              className="inline-flex items-center gap-1 text-coral-600 hover:text-coral-700 font-medium"
                            >
                              <RefreshCcw className="h-3 w-3" /> Rotate
                            </button>
                          </span>
                        ) : (
                          <span className="text-n400">— Link available to assigned POC</span>
                        )}
                      </Td>
                      <Td>
                        {hasPoc && allStudentSubmitted ? (
                          <Pill tone="sage">Closed</Pill>
                        ) : hasPoc || hasAnyStudent ? (
                          <Pill tone="yellow">In progress</Pill>
                        ) : (
                          <Pill tone="n">Pending</Pill>
                        )}
                      </Td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <Dialog open={!!regenId} onOpenChange={(o) => !o && setRegenId(null)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-semibold text-n900">Regenerate token?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-n600">
            The previous link will stop working and the student will need the new one.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={regenerate}
              className="flex-1 h-10 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors"
            >
              Yes, regenerate
            </button>
            <button onClick={() => setRegenId(null)} className="h-10 px-4 text-[13px] text-n500 hover:text-n800 font-medium">
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {(() => {
        const row = drawerKey ? collapsedSessions.find((r) => r.id === drawerKey) : null;
        if (!row) return null;
        const ids = (row.candidate_ids?.length ? row.candidate_ids : (row.student_id ? [row.student_id] : [])) as string[];
        const cands = ids.map((id) => ({ id, name: studentsById.get(id) ?? "Unknown" }));
        return (
          <StudentFeedbackDrawer
            open={!!drawerKey}
            onClose={() => setDrawerKey(null)}
            sessionIds={row.__mergedIds}
            candidates={cands}
            sessionLabel={(row.session_type ?? "session").replace(/^./, (c) => c.toUpperCase())}
            mentorName={mentorName(row)}
            scheduledAt={row.scheduled_at}
            token={row.student_feedback_token}
          />
        );
      })()}
    </div>
  );
}

function Stat({ label, value, tone, title }: { label: string; value: number | string; tone: "n" | "sage" | "orange" | "amber"; title?: string }) {
  const cls = {
    n:      "bg-n100 text-n700 border-n200",
    sage:   "bg-sage-50 text-sage-700 border-sage-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    amber:  "bg-amber-50 text-amber-700 border-amber-200",
  }[tone];
  return (
    <span title={title} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium", title ? "cursor-help" : "", cls)}>
      <span className="tabular-nums font-bold">{value}</span>
      <span>{label}</span>
    </span>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "sage" | "yellow" | "n" }) {
  const cls = {
    sage:   "bg-sage-50 text-sage-600 border-sage-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    n:      "bg-n100 text-n600 border-n200",
  }[tone];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", cls)}>
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-4 py-2.5">{children}</th>;
}
function Td({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td title={title} className={cn("px-4 py-3 text-n700", className)}>{children}</td>;
}
