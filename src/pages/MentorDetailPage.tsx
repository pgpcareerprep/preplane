import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Star, MessageSquare, TrendingUp, TrendingDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SOURCE_META, type Mentor, type MentorSource } from "@/lib/mentor";
import { useLmpRows } from "@/lib/sheets/hooks";
import { DEFAULT_ROUNDS } from "@/lib/lmpProcessMutations";
import { useLmpCandidatesLive } from "@/lib/hooks/useLmpCandidatesLive";
import { AssignMentorModal, type AssignmentDraft } from "@/components/lmp/detail/mentors/AssignMentorModal";
// Note: persisted sessions use the Tables<"sessions"> type from "@/integrations/supabase/types".
// The in-memory draft below is unused (legacy) and intentionally untyped.
import { useMentorById } from "@/lib/hooks/useDbData";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import {
  useMentorPerformance,
  type LiveMentorSession,
  type LivePipelineRow,
  type ReqLabelMap,
} from "@/lib/hooks/useMentorPerformance";
import { useMentorLiveScores } from "@/lib/hooks/useMentorLiveScores";
import { useMentorGoalMet } from "@/lib/hooks/useMentorGoalMet";
import { toast } from "sonner";


type MentorDomain = "Product" | "Engineering" | "Data" | "Design" | "Growth";
type MentorRecord = Mentor & { domain: MentorDomain; baseCost: number };

let CURRENT_REQ_LABELS: ReqLabelMap = {};
function reqLabel(id: string) {
  return CURRENT_REQ_LABELS[id] ?? { role: "—", company: id };
}

type Tab = "overview" | "sessions" | "pipeline" | "feedback";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

const SOURCE_COLORS: Record<MentorSource, string> = {
  MU: "bg-teal-100 text-teal-700",
  ALU: "bg-violet-100 text-violet-700",
  EXT: "bg-orange-100 text-orange-700",
};

/** Adapt a live `mentors` row into the MentorRecord shape the page UI expects. */
function dbRowToMentorRecord(row: any): MentorRecord {
  const source: MentorSource = (row.source === "MU" || row.source === "ALU" || row.source === "EXT")
    ? row.source
    : "EXT";
  const domain = (row.functional_domain || row.industry || "Product") as MentorDomain;
  const seniorityRaw = (row.seniority || "Mid") as string;
  const seniority = (["Mid", "Senior", "Lead", "Staff"].includes(seniorityRaw) ? seniorityRaw : "Mid") as MentorRecord["seniority"];
  return {
    id: row.id,
    name: row.name ?? "Unnamed mentor",
    initials: initialsOf(row.name ?? ""),
    color: SOURCE_COLORS[source],
    role: row.designation || row.role || "—",
    company: row.company || "—",
    source,
    score: Number(row.overall_score ?? 0),
    scores: {
      role: Number(row.score_role ?? 0),
      skills: Number(row.score_skills ?? 0),
      company: Number(row.score_company ?? 0),
      industry: Number(row.score_industry ?? 0),
      seniority: Number(row.score_seniority ?? 0),
    },
    layer: row.layer || "",
    decisionTags: Array.isArray(row.decision_tags) ? row.decision_tags : [],
    rating: Number(row.rating ?? 0),
    reviews: Number(row.reviews ?? 0),
    outcome: Number(row.outcome_pct ?? 0),
    availability: (row.availability === "busy" ? "busy" : "available"),
    email: row.email ?? "",
    phone: row.phone ?? "",
    seniority,
    linkedin: row.linkedin ?? undefined,
    mentorUnion: !!row.mentor_union,
    remunerationInr: Number(row.remuneration_inr ?? row.rate ?? 0),
    domain,
    baseCost: Number(row.remuneration_inr ?? row.rate ?? 4000),
  };
}

export default function MentorDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [assignOpen, setAssignOpen] = useState(false);

  // 1) Try live DB lookup first; fall back to undefined.
  const { data: dbRow, isLoading } = useMentorById(id);
  // Realtime: this mentor row + sessions/assignments touching them.
  useRealtimeInvalidate("mentors", [["db-mentor", id], ["db-all-mentors"]], { enabled: !!id });
  useRealtimeInvalidate("sessions", [["sessions-live"], ["mentor-performance", id]], { enabled: !!id });
  useRealtimeInvalidate("lmp_mentors", [["lmp-mentors-live"], ["mentor-performance", id]], { enabled: !!id });
  const mentor = useMemo<MentorRecord | undefined>(() => {
    if (dbRow) return dbRowToMentorRecord(dbRow);
    return undefined;
  }, [dbRow, id]);

  const { data: perf } = useMentorPerformance(mentor?.id);
  const { data: goalMet } = useMentorGoalMet(mentor?.id);
  const m = perf?.metrics ?? null;
  const sessions: LiveMentorSession[] = perf?.sessions ?? [];
  const pipeline: LivePipelineRow[] = perf?.pipeline ?? [];
  const reqLabels: ReqLabelMap = perf?.reqLabels ?? {};
  CURRENT_REQ_LABELS = reqLabels;
  const { data: lmpRecords = [] } = useLmpRows();
  const { data: liveCandidates = [] } = useLmpCandidatesLive(null);
  const processOptions = useMemo(
    () => lmpRecords.map((r) => ({ id: r.reqId, label: `${r.id} · ${r.role} @ ${r.company}` })),
    [lmpRecords],
  );

  // ── Live match-breakdown: pick a context LMP from this mentor's assignments ──
  const [activeLmpId, setActiveLmpId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!activeLmpId && pipeline.length > 0) {
      setActiveLmpId(pipeline[0].reqId);
    }
    if (activeLmpId && !pipeline.some((p) => p.reqId === activeLmpId)) {
      setActiveLmpId(pipeline[0]?.reqId);
    }
  }, [pipeline, activeLmpId]);
  const { data: liveScores, isLoading: liveScoresLoading } = useMentorLiveScores({
    mentorDbRow: dbRow,
    source: mentor?.source,
    lmpId: activeLmpId,
  });
  const activeLmp = pipeline.find((p) => p.reqId === activeLmpId);


  if (isLoading && !mentor) {
    return (
      <div className="w-full">
        <div className="h-6 w-40 bg-n100 rounded animate-pulse mb-4" />
        <div className="h-32 w-full bg-n100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!mentor || !m) {
    return (
      <div className="w-full">
        <p className="text-n600">Mentor not found.</p>
        <Link to="/mentors" className="text-orange-600 text-[13px]">Back to mentors</Link>
      </div>
    );
  }

  const meta = SOURCE_META[mentor.source];

  const onConfirmAssign = (draft: AssignmentDraft) => {
    const round = DEFAULT_ROUNDS.find((r) => r.id === draft.roundId);
    const picked = draft.candidateIds
      .map((id) => liveCandidates.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (!round || picked.length === 0 || !draft.processId) return;
    const sessionDateObj = new Date(`${draft.sessionDate}T${draft.sessionTime}`);
    const dateLabel =
      sessionDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " · " +
      sessionDateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const isGroup = draft.mode === "group" && picked.length > 1;
    const groupId = isGroup ? `G-${Date.now()}` : undefined;
    // Sessions are persisted via SessionsLiveTab against the public.sessions table
    // (see Tables<"sessions"> in supabase types). This in-memory shape is legacy and unused.
    const newSessions = picked.map((candidate, i) => ({
      id: `S-${Date.now()}-${i}`,
      reqId: draft.processId!,
      mentor: {
        name: mentor.name, initials: mentor.initials, color: mentor.color,
        role: mentor.role, company: mentor.company,
      },
      candidate: { name: candidate.name, initials: candidate.initials, color: candidate.color },
      date: sessionDateObj.toISOString(),
      dateLabel,
      round: round.name,
      status: "scheduled",
      ...(groupId ? { groupId, groupSize: picked.length } : {}),
    }));
    void newSessions; // Sessions are persisted via SessionsLiveTab → sessions table; legacy in-memory store removed.
    setAssignOpen(false);
    const proc = processOptions.find((p) => p.id === draft.processId);
    toast.success(
      draft.mode === "group" && picked.length > 1
        ? `${mentor.name} matched to ${picked.length} candidates on ${proc?.label ?? draft.processId}`
        : `${mentor.name} matched on ${proc?.label ?? draft.processId}`,
    );
  };

  return (
    <div className="w-full space-y-5">
      {/* Breadcrumbs */}
      <button
        onClick={() => navigate("/mentors")}
        className="inline-flex items-center gap-1 text-[12px] text-n500 hover:text-n800"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Mentors
      </button>

      {/* Header card */}
      <div className="rounded-2xl border border-n200 bg-card shadow-sm p-6">
        <div className="flex items-start gap-5">
          <div className={cn("h-16 w-16 rounded-full grid place-items-center text-[18px] font-semibold shrink-0", mentor.color)}>
            {mentor.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[22px] font-semibold text-n900 tracking-tight">{mentor.name}</h1>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px]", meta.chip)}>
                {mentor.source}
              </span>
              <span className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.5px]",
                mentor.availability === "available"
                  ? "bg-sage-50 text-sage-700 border-sage-200"
                  : "bg-yellow-50 text-yellow-700 border-yellow-200",
              )}>
                {mentor.availability === "available" ? "Active" : "Busy"}
              </span>
            </div>
            <div className="text-[13px] text-n500 mt-1">{mentor.role} @ {mentor.company} · {mentor.domain}</div>
            <div className="mt-2 flex items-center gap-4 text-[12px] text-n600">
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="font-medium text-n800 tabular-nums">{m.avgRating ? m.avgRating.toFixed(1) : "—"}</span>
                <span className="text-n500">avg rating</span>
              </span>
              <span>·</span>
              <span><span className="font-medium text-n800 tabular-nums">{m.totalSessions}</span> sessions</span>
              <span>·</span>
              <span>₹{m.costPerSession.toLocaleString("en-IN")} / session</span>
            </div>
          </div>
          <button
            onClick={() => setAssignOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 h-9 rounded-md bg-orange-500 hover:bg-orange-600 text-white px-3.5 text-[13px] font-medium shadow-sm transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Match to process
          </button>
        </div>

        {/* Metrics strip */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Total sessions" value={String(m.totalSessions)} />
          <Metric label="Active processes" value={String(m.activeReqs)} />
          <Metric label="Conversion impact" value={`${m.conversionImpactPct}%`} accent />
          <Metric label="Avg rating" value={m.avgRating ? m.avgRating.toFixed(1) : "—"} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-n200">
        <nav className="flex items-center gap-1">
          {(["overview", "sessions", "pipeline", "feedback"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors capitalize",
                tab === t ? "text-orange-600 border-orange-500" : "text-n500 hover:text-n800 border-transparent",
              )}
            >
              {t === "pipeline" ? "Pipeline impact" : t}
            </button>
          ))}
        </nav>
      </div>

      {tab === "overview" && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-2xl border border-n200 bg-card shadow-sm p-5 space-y-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px]">Match breakdown</h3>
              {activeLmp && (
                <div className="text-[11px] text-n500">
                  Scored against{" "}
                  <span className="font-medium text-n700">
                    {activeLmp.role} @ {activeLmp.company}
                    {activeLmp.lmpCode ? ` · ${activeLmp.lmpCode}` : ""}
                  </span>
                  {liveScores?.ext_stale && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.4px]">
                      external snapshot
                    </span>
                  )}
                </div>
              )}
            </div>

            {pipeline.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {pipeline.map((p) => {
                  const selected = p.reqId === activeLmpId;
                  return (
                    <button
                      key={p.reqId}
                      onClick={() => setActiveLmpId(p.reqId)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        selected
                          ? "bg-orange-50 text-orange-700 border-orange-200"
                          : "bg-card text-n600 border-n200 hover:text-n800 hover:border-n300",
                      )}
                      title={`${p.role} @ ${p.company}`}
                    >
                      {p.lmpCode ?? p.reqId.slice(0, 6)} · {p.role}
                    </button>
                  );
                })}
              </div>
            )}

            {pipeline.length === 0 ? (
              <div className="rounded-xl border border-dashed border-n200 bg-n50/40 p-4 text-[13px] text-n600">
                No LMP assignment yet. Run Mentor Match from an{" "}
                <Link to="/lmp" className="text-orange-600 hover:underline">LMP process</Link>{" "}
                to see the per-dimension breakdown.
              </div>
            ) : (
              <div className="space-y-2">
                {(["role", "skills", "company", "industry", "seniority"] as const).map((k) => {
                  const max = ({ role: 35, skills: 25, company: 20, industry: 15, seniority: 10 } as const)[k];
                  const val = liveScores?.[k] ?? 0;
                  const showVal = !liveScoresLoading;
                  return (
                    <div key={k} className="flex items-center gap-3 text-[13px]">
                      <div className="w-24 capitalize text-n600">{k}</div>
                      <div className="flex-1 h-1.5 rounded-full bg-n100 overflow-hidden">
                        <div
                          className={cn(
                            "h-full bg-orange-500 rounded-full transition-all duration-300",
                            liveScoresLoading && "animate-pulse",
                          )}
                          style={{ width: `${Math.min(100, (val / max) * 100)}%` }}
                        />
                      </div>
                      <div className="w-14 text-right tabular-nums text-n700">
                        {showVal ? val : "—"}/{max}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[13px] text-n600 leading-[1.6] pt-2 border-t border-n100">
              {activeLmp ? (
                <>
                  Scored against{" "}
                  <strong className="text-n800">
                    {activeLmp.role} @ {activeLmp.company}
                  </strong>
                  {" — "}
                </>
              ) : null}
              {mentor.name.split(" ")[0]} has run <strong className="text-n800">{m.totalSessions}</strong> sessions
              across <strong className="text-n800">{pipeline.length} LMP processes</strong>,
              with a <strong className="text-n800">{m.conversionImpactPct}% conversion impact</strong> and an
              average rating of <strong className="text-n800">{m.avgRating ? m.avgRating.toFixed(1) : "—"}</strong>.
            </p>
          </div>


          <div className="rounded-2xl border border-n200 bg-card shadow-sm p-5 space-y-3">
            <h3 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px]">Outcome</h3>
            <div>
              <div className="text-[36px] font-bold text-orange-500 tabular-nums leading-none">{m.conversionImpactPct}%</div>
              <div className="text-[12px] text-n500 mt-1">of touched processes converted</div>
            </div>
            <div className="text-[13px] text-n600 pt-3 border-t border-n100">
              Goal-met:{" "}
              <span className="font-medium text-n800">
                {goalMet?.goalMetPct != null
                  ? `${goalMet.goalMetPct}% (${goalMet.met}/${goalMet.total})`
                  : "No completed sessions"}
              </span>
            </div>
          </div>
        </section>
      )}

      {tab === "sessions" && (
        <section className="space-y-5">
          <SessionsBlock title="Active sessions" sessions={sessions.filter((s) => s.status === "active")} />
          <SessionsBlock title="Past sessions" sessions={sessions.filter((s) => s.status === "past")} />
        </section>
      )}

      {tab === "pipeline" && <PipelineImpact rows={pipeline} sessions={sessions} />}

      {tab === "feedback" && <FeedbackTab sessions={sessions} avgRating={m.avgRating} />}

      <AssignMentorModal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        mentor={mentor}
        candidates={liveCandidates}
        rounds={DEFAULT_ROUNDS}
        role={mentor.role}
        processes={processOptions}
        onConfirm={onConfirmAssign}
      />
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-n200 bg-n50 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.5px] text-n500 font-medium">{label}</div>
      <div className={cn("text-[20px] font-semibold tabular-nums mt-0.5", accent ? "text-orange-600" : "text-n900")}>
        {value}
      </div>
    </div>
  );
}

function SessionsBlock({
  title, sessions,
}: { title: string; sessions: LiveMentorSession[] }) {
  return (
    <div className="rounded-2xl border border-n200 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-n100 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px]">{title}</h3>
        <span className="text-[11px] text-n500">{sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
      </div>
      {sessions.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-n500">No {title.toLowerCase()}.</div>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="bg-n50 text-n500 uppercase tracking-[0.5px] text-[11px]">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">Company</th>
              <th className="px-5 py-2.5 text-left font-medium">Role</th>
              <th className="px-5 py-2.5 text-left font-medium">Candidates</th>
              <th className="px-5 py-2.5 text-left font-medium">Type</th>
              <th className="px-5 py-2.5 text-left font-medium">Date</th>
              <th className="px-5 py-2.5 text-right font-medium">Rating</th>
              <th className="px-5 py-2.5 text-left font-medium">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {sessions
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((s) => (
                <SessionRow key={s.session_id} s={s} />
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SessionRow({ s }: { s: LiveMentorSession }) {
  const cands = s.candidates && s.candidates.length ? s.candidates : [{ id: s.candidate_id, name: s.candidate_name, initials: (s.candidate_name?.[0] ?? "?").toUpperCase() }];
  const visible = cands.slice(0, 3);
  const overflow = cands.length - visible.length;
  const isGroup = s.sessionMode === "group";
  return (
    <tr className="border-t border-n100 hover:bg-n50/60">
      <td className="px-5 py-3">
        <Link to={`/processes/${s.req_id}`} className="text-orange-600 hover:text-orange-700 font-medium">
          {s.company}
        </Link>
      </td>
      <td className="px-5 py-3 text-n800">{s.role}</td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex -space-x-1.5 shrink-0">
            {visible.map((c) => (
              <div
                key={c.id}
                title={c.name}
                className="h-6 w-6 rounded-full grid place-items-center text-[10px] font-semibold bg-orange-100 text-orange-700 ring-2 ring-white"
              >
                {c.initials}
              </div>
            ))}
            {overflow > 0 && (
              <div className="h-6 w-6 rounded-full grid place-items-center text-[10px] font-semibold bg-n100 text-n700 ring-2 ring-white" title={cands.slice(3).map(c => c.name).join(", ")}>
                +{overflow}
              </div>
            )}
          </div>
          <span className="text-n800 truncate">
            {isGroup ? `${cands.length} candidates` : cands[0]?.name}
          </span>
        </div>
      </td>
      <td className="px-5 py-3">
        <span className={cn(
          "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
          isGroup
            ? "bg-orange-50 text-orange-700 border-orange-200"
            : "bg-teal-50 text-teal-700 border-teal-200",
        )}>
          {isGroup ? `Group · ${cands.length}` : "1:1"}
        </span>
      </td>
      <td className="px-5 py-3 text-n600 tabular-nums">{new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
      <td className="px-5 py-3 text-right tabular-nums text-n800">
        {s.feedback_score ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            {s.feedback_score.toFixed(1)}
          </span>
        ) : "—"}
      </td>
      <td className="px-5 py-3">
        <OutcomePill outcome={s.conversion ?? s.outcome ?? "ongoing"} />
      </td>
    </tr>
  );
}

function ReqLink({ reqId }: { reqId: string }) {
  const label = reqLabel(reqId);
  return (
    <Link to={`/processes/${reqId}`} className="text-orange-600 hover:text-orange-700 font-medium">
      {label.role} <span className="text-n500 font-normal">@ {label.company}</span>
    </Link>
  );
}

function OutcomePill({ outcome }: { outcome: "converted" | "not-converted" | "ongoing" }) {
  const map = {
    converted:      { label: "Converted",      cls: "bg-sage-50 text-sage-700 border-sage-200" },
    "not-converted":{ label: "Not converted",  cls: "bg-coral-50 text-coral-600 border-coral-200" },
    ongoing:        { label: "Ongoing",        cls: "bg-n100 text-n600 border-n200" },
  } as const;
  const o = map[outcome];
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", o.cls)}>
      {o.label}
    </span>
  );
}

function PipelineImpact({
  rows,
  sessions,
}: {
  rows: LivePipelineRow[];
  sessions: LiveMentorSession[];
}) {
  const totalReqs = rows.length;
  const converted = rows.filter((r) => r.outcome === "converted").length;
  const ongoing = rows.filter((r) => r.outcome !== "converted" && r.outcome !== "not-converted" && r.outcome !== "closed").length;
  const conversionPct = totalReqs ? Math.round((converted / totalReqs) * 100) : 0;

  return (
    <section className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat label="Processes touched" value={String(totalReqs)} />
        <SummaryStat label="Converted" value={String(converted)} icon={<TrendingUp className="h-3.5 w-3.5 text-sage-600" />} />
        <SummaryStat label="Ongoing" value={String(ongoing)} />
        <SummaryStat label="Conversion rate" value={`${conversionPct}%`} accent />
      </div>

      {/* Per-req impact table */}
      <div className="rounded-2xl border border-n200 bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-n100 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px]">Process impact</h3>
          <span className="text-[11px] text-n500">{totalReqs} req{totalReqs === 1 ? "" : "s"}</span>
        </div>
        {rows.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-n500">No pipeline activity yet.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-n50 text-n500 uppercase tracking-[0.5px] text-[11px]">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Process</th>
                <th className="px-4 py-2.5 text-left font-medium">Role @ Company</th>
                <th className="px-4 py-2.5 text-left font-medium">Domain</th>
                <th className="px-4 py-2.5 text-right font-medium">Sessions</th>
                <th className="px-4 py-2.5 text-left font-medium">Candidates</th>
                <th className="px-4 py-2.5 text-right font-medium">Rating</th>
                <th className="px-4 py-2.5 text-left font-medium">Impact</th>
                <th className="px-4 py-2.5 text-left font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const reqOutcome: "converted" | "not-converted" | "ongoing" =
                  r.outcome === "converted" ? "converted"
                  : r.outcome === "not-converted" ? "not-converted"
                  : "ongoing";
                const procLabel = r.lmpCode ?? r.reqId.slice(0, 8);
                return (
              <tr key={r.reqId} className="border-t border-n100 hover:bg-n50/60">
                <td className="px-4 py-3">
                  <Link to={`/processes/${r.reqId}`} className="text-orange-600 hover:text-orange-700 font-medium tabular-nums">
                    {procLabel}
                  </Link>
                </td>
                    <td className="px-4 py-3 text-n800">{r.role} <span className="text-n500">@ {r.company}</span></td>
                    <td className="px-4 py-3">
                      {r.domain ? (
                        <span className="inline-flex rounded-full bg-n100 border border-n200 text-n700 px-2 py-0.5 text-[11px] font-medium">
                          {r.domain}
                        </span>
                      ) : <span className="text-n400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-n800">{r.sessionCount}</td>
                    <td className="px-4 py-3 text-n800 tabular-nums">
                      <span className="font-medium">{r.candidatesConverted}</span>
                      <span className="text-n400">/{r.candidatesTotal}</span>
                      <span className="text-n500 text-[11px] ml-1">converted</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.mentorRating > 0 ? (
                        <span className="inline-flex items-center gap-1 text-n800">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          {r.mentorRating.toFixed(1)}
                          {r.mentorRatingCount > 0 && (
                            <span className="text-n400 text-[11px]">({r.mentorRatingCount})</span>
                          )}
                        </span>
                      ) : <span className="text-n400">—</span>}
                    </td>
                    <td className="px-4 py-3 min-w-[110px]">
                      <div className="flex items-center gap-2">
                        <span className={cn("tabular-nums font-semibold text-[13px]", r.impactPct > 0 ? "text-orange-600" : "text-n500")}>
                          {r.impactPct}%
                        </span>
                        <div className="flex-1 h-1 rounded-full bg-n100 overflow-hidden min-w-[40px]">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${r.impactPct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><OutcomePill outcome={reqOutcome} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function SummaryStat({ label, value, accent, icon }: { label: string; value: string; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-n200 bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.5px] text-n500 font-medium flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={cn("text-[20px] font-semibold tabular-nums mt-0.5", accent ? "text-orange-600" : "text-n900")}>
        {value}
      </div>
    </div>
  );
}

function FeedbackTab({ sessions, avgRating }: { sessions: LiveMentorSession[]; avgRating: number }) {
  const rated = sessions.filter((s) => typeof s.feedback_score === "number");
  const buckets = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: rated.filter((s) => Math.round(s.feedback_score!) === star).length,
  }));
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const trend5 = rated.filter((s) => (s.feedback_score ?? 0) >= 4.5).length;
  const trendLow = rated.filter((s) => (s.feedback_score ?? 0) < 4).length;

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Left: rating summary + distribution */}
      <div className="md:col-span-1 rounded-2xl border border-n200 bg-card shadow-sm p-5 space-y-4">
        <h3 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px]">Rating summary</h3>
        <div className="flex items-end gap-3">
          <div className="text-[44px] font-bold text-n900 tabular-nums leading-none">
            {avgRating ? avgRating.toFixed(1) : "—"}
          </div>
          <div className="pb-1">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5",
                    avgRating >= i - 0.25 ? "fill-yellow-400 text-yellow-400" : "text-n200",
                  )}
                />
              ))}
            </div>
            <div className="text-[11px] text-n500 mt-1">{rated.length} rated session{rated.length === 1 ? "" : "s"}</div>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-n100">
          {buckets.map((b) => (
            <div key={b.star} className="flex items-center gap-2 text-[12px]">
              <span className="w-6 inline-flex items-center gap-0.5 text-n600 tabular-nums">
                {b.star}<Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-n100 overflow-hidden">
                <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums text-n700">{b.count}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-n100 text-[12px]">
          <div className="rounded-lg bg-sage-50 border border-sage-200 px-3 py-2">
            <div className="inline-flex items-center gap-1 text-sage-700 font-medium">
              <TrendingUp className="h-3 w-3" /> {trend5}
            </div>
            <div className="text-n600 mt-0.5">≥ 4.5 stars</div>
          </div>
          <div className="rounded-lg bg-coral-50 border border-coral-200 px-3 py-2">
            <div className="inline-flex items-center gap-1 text-coral-600 font-medium">
              <TrendingDown className="h-3 w-3" /> {trendLow}
            </div>
            <div className="text-n600 mt-0.5">&lt; 4.0 stars</div>
          </div>
        </div>
      </div>

      {/* Right: per-session feedback list */}
      <div className="md:col-span-2 rounded-2xl border border-n200 bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-n100 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px]">Session feedback</h3>
          <span className="text-[11px] text-n500">{rated.length} of {sessions.length}</span>
        </div>
        {rated.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-n500 inline-flex flex-col items-center w-full gap-2">
            <MessageSquare className="h-5 w-5 text-n400" />
            No feedback recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-n100">
            {rated
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((s) => (
                <li key={s.session_id} className="px-5 py-3 flex items-start gap-4">
                  <div className="flex items-center gap-1 shrink-0 w-12 tabular-nums text-[13px] font-semibold text-n900">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {s.feedback_score!.toFixed(1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-n800">
                      <span className="font-medium">{s.candidate_name}</span>
                      <span className="text-n500"> · {s.stage}</span>
                    </div>
                    <div className="text-[12px] text-n500 mt-0.5">
                      <ReqLink reqId={s.req_id} />
                      <span> · {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                  </div>
                  <OutcomePill outcome={s.outcome ?? "ongoing"} />
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}
