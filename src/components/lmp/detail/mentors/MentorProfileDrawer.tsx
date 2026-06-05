import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Check, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { type Mentor, SOURCE_META, SCORE_DIM_COLORS, SCORE_DIM_MAX } from "@/lib/mentor";
import { useMentorGoalMet } from "@/lib/hooks/useMentorGoalMet";

const TABS = [
  "Overview", "Experience", "Match Analysis", "Decision Insights",
  "Remunerations", "Feedback & Ratings", "LMP History", "Interaction Log",
] as const;
type Tab = typeof TABS[number];

type Enrichment = {
  overview: string;
  experience: { role: string; company: string; years: string }[];
  languages: string[];
  decisionRationale: { rationale: string; tags: string[] };
  remuneration: { min_inr: number | null; max_inr: number | null; notes: string };
  sources: string[];
  fetched_at: string;
};

function useMentorSkills(mentorId: string | undefined) {
  return useQuery({
    enabled: !!mentorId,
    queryKey: ["mentor-skills", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentors")
        .select("skill_tags")
        .eq("id", mentorId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.skill_tags ?? []) as string[];
    },
  });
}

function useMentorReviews(mentorId: string | undefined) {
  return useQuery({
    enabled: !!mentorId,
    queryKey: ["mentor-reviews", mentorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, student_rating, mentor_rating, student_feedback, completed_at, students:students(name)")
        .eq("mentor_id", mentorId!)
        .or("student_rating.not.is.null,mentor_rating.not.is.null,student_feedback.not.is.null")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

function useMentorSessionsCount(mentorId: string | undefined) {
  return useQuery({
    enabled: !!mentorId,
    queryKey: ["mentor-sessions-count", mentorId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("mentor_id", mentorId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function useMentorEnrichment(mentor: Mentor | null, refreshKey: number) {
  return useQuery({
    enabled: !!mentor,
    queryKey: ["mentor-enrichment", mentor?.id, refreshKey],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("mentor-profile-enrich", {
        body: {
          mentorId: mentor!.id,
          name: mentor!.name,
          role: mentor!.role,
          company: mentor!.company,
          linkedin: mentor!.linkedin ?? mentor!.external_links?.linkedin ?? null,
          refresh: refreshKey > 0,
        },
      });
      if (error) throw error;
      return (data?.enrichment ?? null) as Enrichment | null;
    },
  });
}

export function MentorProfileDrawer({
  mentor, open, onOpenChange,
}: { mentor: Mentor | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const enrichmentQ = useMentorEnrichment(mentor, refreshKey);
  if (!mentor) return null;
  const meta = SOURCE_META[mentor.source];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[720px] sm:max-w-[720px] p-0 flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-n200">
          <div className="flex items-start gap-4">
            <div className={cn("h-14 w-14 rounded-full flex items-center justify-center text-[16px] font-semibold", mentor.color)}>
              {mentor.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[20px] font-semibold text-n900 truncate">{mentor.name}</div>
              <div className="text-[14px] text-n500 truncate">{mentor.role} @ {mentor.company}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px]", meta.chip)}>
                  {mentor.source}
                </span>
                <span className="text-[12px] text-n500">{mentor.seniority}</span>
                <button
                  onClick={() => setRefreshKey((k) => k + 1)}
                  className="ml-auto inline-flex items-center gap-1 text-[11px] text-n500 hover:text-n800"
                  title="Refresh live profile data"
                >
                  <RefreshCcw className={cn("h-3 w-3", enrichmentQ.isFetching && "animate-spin")} />
                  {enrichmentQ.isFetching ? "Fetching…" : "Refresh"}
                </button>
              </div>
            </div>
            <div className="h-14 w-14 rounded-full bg-orange-50 border border-orange-200 flex flex-col items-center justify-center">
              <span className="text-[22px] font-bold text-orange-500 leading-none">{mentor.score}</span>
              <span className="text-[10px] text-orange-500/70">/ 45</span>
            </div>
          </div>
        </div>

        <div className="border-b border-n200 overflow-x-auto">
          <nav className="flex items-center gap-1 px-6">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors duration-150 whitespace-nowrap",
                  tab === t ? "text-orange-600 border-orange-500" : "text-n500 hover:text-n800 border-transparent",
                )}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === "Overview" && <OverviewBody mentor={mentor} enrichmentQ={enrichmentQ} />}
          {tab === "Experience" && <ExperienceBody mentor={mentor} enrichmentQ={enrichmentQ} />}
          {tab === "Match Analysis" && <MatchAnalysisBody mentor={mentor} />}
          {tab === "Decision Insights" && <DecisionInsightsBody mentor={mentor} enrichmentQ={enrichmentQ} />}
          {tab === "Remunerations" && <RemunerationsBody mentor={mentor} enrichmentQ={enrichmentQ} />}
          {tab === "Feedback & Ratings" && <RatingsBody mentor={mentor} />}
          {(tab === "LMP History" || tab === "Interaction Log") && <ComingSoon name={tab} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

type EnrichmentQ = ReturnType<typeof useMentorEnrichment>;

function LoadingLine() {
  return <div className="h-3 w-2/3 rounded bg-n100 animate-pulse" />;
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-n500 rounded-xl border border-dashed border-n200 p-4 text-center">{children}</div>;
}

function OverviewBody({ mentor, enrichmentQ }: { mentor: Mentor; enrichmentQ: EnrichmentQ }) {
  const { data: sessionsCount } = useMentorSessionsCount(mentor.id);
  const e = enrichmentQ.data;
  return (
    <div className="space-y-4 text-[14px] text-n700 leading-[1.6]">
      {enrichmentQ.isLoading ? (
        <div className="space-y-2"><LoadingLine /><LoadingLine /></div>
      ) : e?.overview ? (
        <p>{e.overview}</p>
      ) : (
        <EmptyHint>No public profile information available yet. Try Refresh to pull live data.</EmptyHint>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sessions Done" value={sessionsCount != null ? String(sessionsCount) : "—"} />
        <Stat label="Avg Rating" value={mentor.rating != null && mentor.rating > 0 ? `${mentor.rating.toFixed(1)} / 5` : "—"} />
        <Stat label="Goal Met" value={mentor.outcome > 0 ? `${mentor.outcome}%` : "—"} />
        <Stat label="Languages" value={e?.languages?.length ? e.languages.join(" · ") : "—"} />
      </div>
    </div>
  );
}

function ExperienceBody({ mentor, enrichmentQ }: { mentor: Mentor; enrichmentQ: EnrichmentQ }) {
  const e = enrichmentQ.data;
  // Prefer DB past_experience for internal mentors, fallback to live enrichment.
  const items = (mentor.pastExperience && mentor.pastExperience.length > 0)
    ? mentor.pastExperience
    : (e?.experience ?? []);
  if (enrichmentQ.isLoading && items.length === 0) {
    return <div className="space-y-2"><LoadingLine /><LoadingLine /><LoadingLine /></div>;
  }
  if (items.length === 0) {
    return <EmptyHint>No experience data found from public sources.</EmptyHint>;
  }
  return (
    <ul className="space-y-2">
      {items.map((ex, i) => (
        <li key={i} className="rounded-xl border border-n200 bg-card p-3">
          <div className="text-[13px] font-medium text-n800">{ex.role || "—"}</div>
          <div className="text-[12px] text-n500">{ex.company || "—"}{ex.years ? ` · ${ex.years}` : ""}</div>
        </li>
      ))}
    </ul>
  );
}

function MatchAnalysisBody({ mentor }: { mentor: Mentor }) {
  const { data: skills = [], isLoading } = useMentorSkills(mentor.id);
  const dims = (Object.keys(mentor.scores) as (keyof Mentor["scores"])[]);
  return (
    <div className="space-y-6">
      <div>
        <h5 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px] mb-2">5-Dimension Score</h5>
        <table className="w-full text-[13px]">
          <tbody>
            {dims.map((d) => (
              <tr key={d} className="border-b border-n100 last:border-0">
                <td className="py-2 capitalize text-n600 w-32">{d}</td>
                <td className="py-2 w-full">
                  <div className="h-1.5 rounded-full bg-n100 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", SCORE_DIM_COLORS[d])}
                      style={{ width: `${(mentor.scores[d] / SCORE_DIM_MAX[d]) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="py-2 pl-3 text-right tabular-nums text-n700 font-medium w-16">
                  {mentor.scores[d]}/{SCORE_DIM_MAX[d]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h5 className="text-[13px] font-semibold text-n900 uppercase tracking-[0.5px] mb-2">Mentor Skills</h5>
        {isLoading ? (
          <div className="text-[12px] text-n500">Loading skills…</div>
        ) : skills.length === 0 ? (
          <div className="text-[12px] text-n500">No skills tagged for this mentor.</div>
        ) : (
          <ul className="grid grid-cols-2 gap-2 text-[13px]">
            {skills.map((s) => (
              <li key={s} className="flex items-center gap-2 rounded-lg bg-n50 border border-n200 px-3 py-2">
                <Check className="h-3.5 w-3.5 text-sage-600" strokeWidth={2.5} />
                <span className="text-n800">{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DecisionInsightsBody({ mentor, enrichmentQ }: { mentor: Mentor; enrichmentQ: EnrichmentQ }) {
  const e = enrichmentQ.data;
  const tags = e?.decisionRationale?.tags ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {mentor.decisionTags.map((t) => (
          <span key={t.label} className="rounded-full bg-orange-50 border border-orange-200 text-orange-700 px-2.5 py-0.5 text-[12px] font-medium">
            {t.emoji} {t.label}
          </span>
        ))}
        {tags.map((t) => (
          <span key={t} className="rounded-full bg-teal-50 border border-teal-200 text-teal-600 px-2.5 py-0.5 text-[12px] font-medium">
            {t}
          </span>
        ))}
      </div>
      {enrichmentQ.isLoading ? (
        <div className="space-y-2"><LoadingLine /><LoadingLine /></div>
      ) : e?.decisionRationale?.rationale ? (
        <div className="rounded-xl bg-n100 border border-n200 border-l-[3px] border-l-orange-500 p-4">
          <p className="text-[13px] text-n700 leading-[1.65]">{e.decisionRationale.rationale}</p>
        </div>
      ) : (
        <EmptyHint>No rationale could be derived from public sources. Try Refresh.</EmptyHint>
      )}
    </div>
  );
}

function RemunerationsBody({ mentor, enrichmentQ }: { mentor: Mentor; enrichmentQ: EnrichmentQ }) {
  const e = enrichmentQ.data;
  const r = e?.remuneration;
  const sessionInr = mentor.remunerationInr;
  if (enrichmentQ.isLoading && !r) {
    return <div className="space-y-2"><LoadingLine /><LoadingLine /></div>;
  }
  const fmt = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? `₹${Math.round(n).toLocaleString("en-IN")}` : null;
  const range = r && (fmt(r.min_inr) || fmt(r.max_inr))
    ? `${fmt(r.min_inr) ?? "—"} – ${fmt(r.max_inr) ?? "—"}`
    : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Per-Session Rate" value={sessionInr ? `₹${sessionInr.toLocaleString("en-IN")}` : "—"} />
        <Stat label="Estimated Annual" value={range ?? "—"} />
      </div>
      {r?.notes ? (
        <div className="rounded-xl border border-n200 bg-card p-4 text-[13px] text-n700 leading-[1.6]">
          {r.notes}
        </div>
      ) : !range ? (
        <EmptyHint>No public remuneration signal found.</EmptyHint>
      ) : null}
    </div>
  );
}

function RatingsBody({ mentor }: { mentor: Mentor }) {
  const { data: reviews = [], isLoading } = useMentorReviews(mentor.id);
  const { data: goal } = useMentorGoalMet(mentor.id);
  const goalPct = goal?.goalMetPct;
  const data = goalPct != null
    ? [
        { name: "Goal Met", value: goalPct },
        { name: "Goal Missed", value: 100 - goalPct },
      ]
    : [{ name: "No data", value: 1 }];
  const COLORS = goalPct != null
    ? ["hsl(var(--sage-400))", "hsl(var(--n200))"]
    : ["hsl(var(--n200))"];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-[28px] font-bold text-orange-500 tabular-nums">{mentor.rating != null ? mentor.rating.toFixed(1) : "—"}</div>
          <div className="text-[11px] text-n500">{mentor.reviews != null ? `${mentor.reviews} reviews` : "No reviews"}</div>
        </div>
        <div className="h-24 w-24">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={28} outerRadius={42} startAngle={90} endAngle={-270}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-[12px]">
          {goalPct != null ? (
            <>
              <div className="text-sage-600 font-medium">{goalPct}% Goal Met</div>
              <div className="text-n500 mt-1">{goal?.met}/{goal?.total} completed sessions</div>
            </>
          ) : (
            <>
              <div className="text-n500 font-medium">No goal-met data</div>
              <div className="text-n500 mt-1">No completed sessions yet</div>
            </>
          )}
        </div>
      </div>


      {isLoading ? (
        <div className="text-[12px] text-n500">Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div className="text-[12px] text-n500 rounded-xl border border-dashed border-n200 p-4 text-center">No feedback yet.</div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r: any) => {
            const rating = Number(
              r.student_rating ?? r.mentor_rating ?? r.student_feedback?.rating ?? 0
            );
            const text = r.student_feedback?.notes || r.student_feedback?.comments || r.student_feedback?.text || "";
            const author = r.students?.name || "Anonymous";
            const stars = Math.max(0, Math.min(5, Math.round(rating)));
            return (
              <li key={r.id} className="rounded-xl border border-n200 bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-n800">{author}</div>
                  <div className="text-yellow-500 text-[12px]">{"★".repeat(stars)}{"☆".repeat(5 - stars)}</div>
                </div>
                {text && <p className="mt-1 text-[13px] text-n600 leading-[1.6]">{text}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-n50 border border-n200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">{label}</div>
      <div className="text-[15px] font-semibold text-n900 tabular-nums">{value}</div>
    </div>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="text-center py-12">
      <h4 className="text-[16px] font-semibold text-n800">{name}</h4>
      <p className="text-[13px] text-n500 mt-1">Wired up in a later prompt.</p>
    </div>
  );
}
