/**
 * useMentorPerformance
 * --------------------
 * Live replacement for `mockMentorPerformance` for a single mentor's detail
 * page. Aggregates Supabase `sessions` + `lmp_mentors` + `lmp_processes` +
 * `lmp_candidates` into the same shapes the page UI expects.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_WINDOW_DAYS } from "@/lib/config/thresholds";

export type SessionCandidate = { id: string; name: string; initials: string };

export type LiveMentorSession = {
  session_id: string;
  mentor_id: string;
  req_id: string;
  candidate_id: string;
  candidate_name: string;
  candidates: SessionCandidate[];
  sessionMode: "1:1" | "group";
  company: string;
  role: string;
  stage: string;
  date: string;
  status: "active" | "past";
  feedback_score?: number;
  rating?: number;
  cost: number;
  outcome: "converted" | "not-converted" | "ongoing";
  conversion: "converted" | "not-converted" | "ongoing";
};

export type LiveMentorMetrics = {
  totalSessions: number;
  activeReqs: number;
  avgRating: number;
  costPerSession: number;
  conversionImpactPct: number;
  lastActive: string | null;
  isActive: boolean;
};

export type LivePipelineRow = {
  reqId: string;
  lmpCode: string | null;
  role: string;
  company: string;
  domain: string | null;
  sessionCount: number;
  candidatesTotal: number;
  candidatesConverted: number;
  impactPct: number;
  mentorRating: number;
  mentorRatingCount: number;
  assignmentStatus: string | null;
  outcome: "converted" | "not-converted" | "ongoing" | "closed";
};

export type ReqLabelMap = Record<string, { role: string; company: string }>;

export type MentorPerformanceBundle = {
  metrics: LiveMentorMetrics;
  sessions: LiveMentorSession[];
  pipeline: LivePipelineRow[];
  reqLabels: ReqLabelMap;
};



function classifyOutcome(status: string | null): LivePipelineRow["outcome"] {
  if (!status) return "ongoing";
  const s = status.toLowerCase();
  if (s.includes("converted")) return "converted";
  if (s.includes("not converted") || s.includes("rejected")) return "not-converted";
  if (s.includes("closed") || s.includes("dormant")) return "closed";
  return "ongoing";
}

export function useMentorPerformance(mentorId: string | undefined, baseCost = 4000) {
  return useQuery({
    enabled: !!mentorId,
    queryKey: ["mentor-perf", mentorId] as const,
    staleTime: 30_000,
    queryFn: async (): Promise<MentorPerformanceBundle> => {
      if (!mentorId) throw new Error("missing mentor id");

      // 1) sessions for this mentor
      const { data: sessRows, error: sessErr } = await supabase
        .from("sessions")
        .select("id,mentor_id,student_id,candidate_ids,lmp_id,scheduled_at,completed_at,status,session_type,mentor_rating,student_rating,student_feedback,duration_min,notes")
        .eq("mentor_id", mentorId);
      if (sessErr) throw sessErr;
      const sessions = sessRows ?? [];

      // 2) lmp_mentors links (covers active assignments even without a session yet)
      const { data: linkRows } = await supabase
        .from("lmp_mentors")
        .select("lmp_id,status,session_count,feedback_avg,feedback_count")
        .eq("mentor_id", mentorId);
      const linkedLmpIds = new Set((linkRows ?? []).map((r: any) => r.lmp_id));
      const linkByLmp = new Map<string, any>((linkRows ?? []).map((r: any) => [r.lmp_id, r]));

      // 3) Resolve referenced lmp + candidate ids (single + grouped)
      const lmpIds = Array.from(new Set([
        ...sessions.map((s: any) => s.lmp_id).filter(Boolean),
        ...linkedLmpIds,
      ]));
      const candidateIds = Array.from(new Set(
        sessions.flatMap((s: any) => [
          s.student_id,
          ...((Array.isArray(s.candidate_ids) ? s.candidate_ids : []) as string[]),
        ]).filter(Boolean),
      ));

      const [procRes, candRes] = await Promise.all([
        lmpIds.length
          ? supabase.from("lmp_processes").select("id,company,role,status,lmp_code,domain_raw,domain_id").in("id", lmpIds)
          : Promise.resolve({ data: [], error: null } as any),
        candidateIds.length
          ? supabase.from("lmp_candidates").select("id,student_name,pipeline_stage,offer_status,r3_status,r2_status,r1_status,lmp_id").in("id", candidateIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (procRes.error) throw procRes.error;
      if (candRes.error) throw candRes.error;

      const procById = new Map<string, any>((procRes.data ?? []).map((p: any) => [p.id, p]));
      const candById = new Map<string, any>((candRes.data ?? []).map((c: any) => [c.id, c]));

      // Resolve domain names from domain_id
      const domainIds: string[] = Array.from(new Set(
        (procRes.data ?? []).map((p: any) => p.domain_id).filter(Boolean) as string[],
      ));
      const domainNameById = new Map<string, string>();
      if (domainIds.length) {
        const { data: domRows } = await supabase
          .from("domains")
          .select("id,name")
          .in("id", domainIds);
        (domRows ?? []).forEach((d: any) => domainNameById.set(d.id, d.name));
      }

      const reqLabels: ReqLabelMap = {};
      procById.forEach((p, id) => {
        reqLabels[id] = { role: p.role || "—", company: p.company || id };
      });

      // ── Map sessions → UI shape ──
      const initials = (n: string) =>
        n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
      const candOutcome = (c: any): "converted" | "not-converted" | "ongoing" =>
        c?.pipeline_stage === "converted" || c?.offer_status === "accepted"
          ? "converted"
          : c?.pipeline_stage === "rejected" || c?.offer_status === "rejected"
            ? "not-converted"
            : "ongoing";

      // A session is considered "active" only when the mentor is still
      // assigned to that LMP (lmp_mentors link exists and isn't removed) AND
      // the LMP itself isn't in a terminal status. Otherwise it falls into
      // Past sessions. This mirrors the Active-processes count and prevents
      // orphan / stale sessions from inflating the Active list.
      const TERMINAL_LMP = new Set(["converted", "closed", "not converted", "dormant"]);
      const REMOVED_LINK = new Set(["removed", "ended", "dropped", "inactive", "cancelled", "canceled"]);
      const activeLinkLmpIds = new Set<string>(
        (linkRows ?? [])
          .filter((r: any) => !REMOVED_LINK.has(String(r.status ?? "").toLowerCase()))
          .map((r: any) => r.lmp_id),
      );

      const liveSessions: LiveMentorSession[] = sessions.map((s: any) => {
        const proc = procById.get(s.lmp_id);
        const dateIso = s.completed_at || s.scheduled_at || s.created_at || new Date().toISOString();
        const isCompleted = !!s.completed_at || s.status === "completed";
        const lmpTerminal = TERMINAL_LMP.has(String(proc?.status ?? "").toLowerCase());
        const mentorStillAssigned = s.lmp_id ? activeLinkLmpIds.has(s.lmp_id) : false;
        const isActive = !isCompleted && mentorStillAssigned && !lmpTerminal;

        // Resolve candidate list: prefer candidate_ids[] (group), else fall back to student_id
        const idList: string[] = Array.isArray(s.candidate_ids) && s.candidate_ids.length
          ? s.candidate_ids
          : (s.student_id ? [s.student_id] : []);
        const candidates: SessionCandidate[] = idList.map((cid) => {
          const c = candById.get(cid);
          const name = c?.student_name || "—";
          return { id: cid, name, initials: initials(name) };
        });
        const primary = candById.get(s.student_id) || (idList[0] ? candById.get(idList[0]) : null);
        const stage = primary?.pipeline_stage || s.session_type || "session";

        // Group conversion: converted if ANY converted; not-converted only if ALL rejected; else ongoing
        const outcomes = idList.map((cid) => candOutcome(candById.get(cid)));
        const conversion: "converted" | "not-converted" | "ongoing" =
          outcomes.some((o) => o === "converted")
            ? "converted"
            : outcomes.length > 0 && outcomes.every((o) => o === "not-converted")
              ? "not-converted"
              : "ongoing";

        const sessionMode: "1:1" | "group" = candidates.length > 1 ? "group" : "1:1";
        // Mirror the DB trigger's coalesce so every rated session surfaces in the
        // mentor's feedback list, not just POC-rated ones.
        const sfRating = (() => {
          const r = (s.student_feedback as any)?.rating;
          const n = r != null ? Number(r) : NaN;
          return Number.isFinite(n) && n > 0 ? n : undefined;
        })();
        const ratingNum: number | undefined =
          (typeof s.mentor_rating === "number" ? s.mentor_rating : undefined) ??
          (typeof s.student_rating === "number" ? s.student_rating : undefined) ??
          sfRating;
        const rating = ratingNum;

        return {
          session_id: s.id,
          mentor_id: s.mentor_id,
          req_id: s.lmp_id || "",
          candidate_id: s.student_id || idList[0] || "",
          candidate_name: candidates[0]?.name || "—",
          candidates,
          sessionMode,
          company: proc?.company || "—",
          role: proc?.role || "—",
          stage,
          date: dateIso,
          status: isActive ? "active" : "past",
          feedback_score: rating,
          rating,
          cost: baseCost,
          outcome: conversion,
          conversion,
        };
      });

      // ── Pipeline impact: union of sessioned LMPs + linked LMPs ──
      const pipeline: LivePipelineRow[] = lmpIds.map((id) => {
        const proc = procById.get(id);
        const link = linkByLmp.get(id);
        const reqSessions = liveSessions.filter((s) => s.req_id === id);

        // Candidates touched by this mentor on this req
        const candIds = new Set<string>();
        reqSessions.forEach((s) => s.candidates.forEach((c) => candIds.add(c.id)));
        const candArr = Array.from(candIds).map((cid) => candById.get(cid)).filter(Boolean);
        const candidatesTotal = candArr.length;
        const candidatesConverted = candArr.filter((c) => candOutcome(c) === "converted").length;
        const impactPct = candidatesTotal > 0 ? Math.round((candidatesConverted / candidatesTotal) * 100) : 0;

        // Rating: prefer lmp_mentors.feedback_avg, else avg of session ratings on this req
        const sessRatings = reqSessions
          .map((s) => s.feedback_score)
          .filter((n): n is number => typeof n === "number");
        const sessAvg = sessRatings.length ? sessRatings.reduce((a, b) => a + b, 0) / sessRatings.length : 0;
        const linkAvg = Number(link?.feedback_avg ?? 0);
        const linkCount = Number(link?.feedback_count ?? 0);
        const mentorRating = linkAvg > 0 ? linkAvg : sessAvg;
        const mentorRatingCount = linkCount > 0 ? linkCount : sessRatings.length;

        const sessionCount = Number(link?.session_count ?? 0) || reqSessions.length;

        const domain = proc?.domain_id
          ? (domainNameById.get(proc.domain_id) ?? proc?.domain_raw ?? null)
          : (proc?.domain_raw ?? null);

        return {
          reqId: id,
          lmpCode: proc?.lmp_code ?? null,
          role: proc?.role || "—",
          company: proc?.company || id,
          domain,
          sessionCount,
          candidatesTotal,
          candidatesConverted,
          impactPct,
          mentorRating,
          mentorRatingCount,
          assignmentStatus: link?.status ?? null,
          outcome: classifyOutcome(proc?.status),
        };
      });

      // ── Metrics ──
      const totalSessions = liveSessions.length;
      const activeReqs = pipeline.filter(
        (p) => p.outcome !== "converted" && p.outcome !== "not-converted" && p.outcome !== "closed",
      ).length;
      const ratings = liveSessions
        .map((x) => x.feedback_score)
        .filter((n): n is number => typeof n === "number");
      const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      const costPerSession = baseCost;
      const touched = pipeline.length;
      const converted = pipeline.filter((p) => p.outcome === "converted").length;
      const conversionImpactPct = touched > 0 ? Math.round((converted / touched) * 100) : 0;
      const lastActive = liveSessions.length
        ? liveSessions.map((x) => x.date).sort().slice(-1)[0]
        : null;
      const isActive = lastActive
        ? (Date.now() - new Date(lastActive).getTime()) / 86_400_000 <= ACTIVE_WINDOW_DAYS
        : false;

      return {
        metrics: {
          totalSessions,
          activeReqs,
          avgRating,
          costPerSession,
          conversionImpactPct,
          lastActive,
          isActive,
        },
        sessions: liveSessions,
        pipeline,
        reqLabels,
      };
    },
  });
}
