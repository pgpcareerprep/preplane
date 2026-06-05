import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Star, ArrowUpDown, UserPlus, Sparkles } from "lucide-react";
import { RunMentorModal } from "@/components/mentors/RunMentorModal";
import { cn } from "@/lib/utils";
import { SOURCE_META, type MentorSource } from "@/lib/mentor";
import { useAllMentors, type DbMentorRow } from "@/lib/hooks/useDbData";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { PillSelect } from "@/components/ui/pill-select";
import {
  DataTableShell,
  Th,
  Td,
  TABLE_THEAD_CLASS,
  TABLE_ROW_HOVER,
} from "@/components/ui/data-table-shell";

const AVATAR_COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-sage-200 text-sage-600",
  "bg-sky-200 text-sky-600",
  "bg-purple-200 text-purple-600",
  "bg-pink-200 text-pink-600",
];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function primaryDomain(fd: string | null): string {
  if (!fd) return "—";
  return fd.split("|")[0].trim();
}

/** Strip placeholder annotations like "(Fictional - Assuming ...)" from sheet data. */
function cleanText(value?: string | null): string {
  if (!value) return "";
  return value
    .replace(/\s*\([^)]*\b(fictional|assuming|hypothetical|placeholder|example|n\/a|tbd)\b[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Render "Role @ Company" while collapsing duplicates like "Bain @ Bain & Co.". */
function roleAtCompany(role?: string | null, company?: string | null): string {
  const r = cleanText(role);
  const c = cleanText(company);
  if (r && c) {
    const rl = r.toLowerCase();
    const cl = c.toLowerCase();
    if (rl === cl || rl.includes(cl) || cl.includes(rl)) return r || c;
    return `${r} @ ${c}`;
  }
  return r || c || "—";
}

type SortKey = "name" | "rating" | "rate" | "domain";

export default function MentorsPage() {
  const navigate = useNavigate();
  const { data: allMentors = [], isLoading } = useAllMentors();

  // Live LMP assignments to scope the list
  const { data: assignments = [] } = useQuery({
    queryKey: ["mentors-with-lmp-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_mentors")
        .select("mentor_id, lmp_id, status, session_count, feedback_avg, assigned_at, lmp_processes(company, role)")
        .order("assigned_at", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // Per-mentor session format counts (1:1 vs 1:many)
  const { data: mentorSessions = [] } = useQuery({
    queryKey: ["mentor-session-formats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("mentor_id, candidate_ids")
        .not("mentor_id", "is", null)
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const formatMap = useMemo(() => {
    const m = new Map<string, { oneToOne: number; oneToMany: number }>();
    for (const s of mentorSessions as any[]) {
      if (!s.mentor_id) continue;
      const n = Array.isArray(s.candidate_ids) ? s.candidate_ids.length : 0;
      const cur = m.get(s.mentor_id) ?? { oneToOne: 0, oneToMany: 0 };
      if (n <= 1) cur.oneToOne += 1;
      else cur.oneToMany += 1;
      m.set(s.mentor_id, cur);
    }
    return m;
  }, [mentorSessions]);

  const assignmentMap = useMemo(() => {
    const m = new Map<string, {
      count: number;
      sessions: number;
      feedbackAvg: number;
      latestLmpLabel: string;
      latestStatus: string;
    }>();
    for (const a of assignments as any[]) {
      if (!a.mentor_id) continue;
      const sc = Number(a.session_count ?? 0);
      const label = a.lmp_processes
        ? [a.lmp_processes.company, a.lmp_processes.role].filter(Boolean).join(" · ")
        : "";
      const fb = Number(a.feedback_avg ?? 0);
      const cur = m.get(a.mentor_id);
      if (!cur) {
        m.set(a.mentor_id, {
          count: 1, sessions: sc,
          feedbackAvg: fb,
          latestLmpLabel: label,
          latestStatus: a.status ?? "",
        });
      } else {
        cur.count += 1;
        cur.sessions += sc;
        if (fb > cur.feedbackAvg) cur.feedbackAvg = fb;
      }
    }
    return m;
  }, [assignments]);


  const [q, setQ] = useState("");
  const [source, setSource] = useState<MentorSource | "all">("all");
  const [ratingMin, setRatingMin] = useState<string>("0");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [runOpen, setRunOpen] = useState(false);

  const mentors = useMemo(
    () => allMentors.filter((m) => assignmentMap.has(m.id)),
    [allMentors, assignmentMap],
  );

  // Realtime: mentor edits + assignments + sessions (so feedback ratings flow
  // back instantly) + alumni mirror updates.
  useRealtimeInvalidate("mentors", [["db-all-mentors"], ["db-mentor-stats"], ["db-mentor-preview"]]);
  useRealtimeInvalidate("lmp_mentors", [["mentors-with-lmp-assignment"]]);
  useRealtimeInvalidate("sessions", [["mentors-with-lmp-assignment"], ["db-all-mentors"]]);
  useRealtimeInvalidate("alumni_records", [["db-all-mentors"], ["db-all-alumni"]]);

  // Derive unique domains from data
  const domainOptions = useMemo(() => {
    const set = new Set<string>();
    mentors.forEach((m) => {
      const d = primaryDomain(m.functional_domain);
      if (d !== "—") set.add(d);
    });
    return Array.from(set).sort();
  }, [mentors]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const min = parseFloat(ratingMin);
    const filtered = mentors.filter((m) => {
      if (source !== "all" && m.source !== source) return false;
      if (Number(m.rating) < min) return false;
      if (domainFilter !== "all" && primaryDomain(m.functional_domain) !== domainFilter) return false;
      if (ql) {
        const hay = `${m.name} ${m.designation ?? ""} ${m.company ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
    const sorters: Record<SortKey, (a: DbMentorRow, b: DbMentorRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      rating: (a, b) => Number(b.rating) - Number(a.rating),
      rate: (a, b) => Number(a.rate) - Number(b.rate),
      domain: (a, b) => primaryDomain(a.functional_domain).localeCompare(primaryDomain(b.functional_domain)),
    };
    return [...filtered].sort(sorters[sort]);
  }, [mentors, q, source, ratingMin, domainFilter, sort]);

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-[400px] w-full rounded-2xl" />
      </div>
    );
  }




  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Mentors"
        subtitle="Aligned mentors across all live LMP processes — feedback updates in real time."
        right={
          <button
            onClick={() => setRunOpen(true)}
            className="inline-flex items-center gap-2 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 text-white px-3.5 text-[13px] font-medium shadow-sm transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Run Mentor
          </button>
        }
      />
      <RunMentorModal open={runOpen} onOpenChange={setRunOpen} />

      {/* Filters */}
      <div className="rounded-2xl border border-n200 bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, role, company…"
          />
          <PillSelect value={domainFilter} onChange={setDomainFilter}
            options={[{ value: "all", label: "All domains" }, ...domainOptions.map((d) => ({ value: d, label: d }))]} />
          <PillSelect value={source} onChange={(v) => setSource(v as MentorSource | "all")}
            options={[
              { value: "all", label: "All sources" },
              { value: "ALU", label: "Alumni" },
              { value: "EXT", label: "External" },
            ]} />
          <PillSelect value={ratingMin} onChange={setRatingMin}
            options={[{ value: "0", label: "Any rating" }, { value: "4", label: "Rating 4.0+" }, { value: "4.5", label: "Rating 4.5+" }]} />
          
          <PillSelect value={sort} onChange={(v) => setSort(v as SortKey)} prefix="Sort"
            icon={<ArrowUpDown className="h-3.5 w-3.5 text-n500" />}
            options={[
              { value: "name", label: "Name" },
              { value: "rating", label: "Avg rating" },
              { value: "rate", label: "Rate" },
              { value: "domain", label: "Domain" },
            ]} />
        </div>
      </div>

      {/* Table */}
      <DataTableShell footer={`Showing ${rows.length} of ${mentors.length} mentors with LMP assignments`}>
        <table className="w-full text-[13px]">
          <thead className={TABLE_THEAD_CLASS}>
            <tr>
              <Th>Mentor</Th>
              <Th>Domain</Th>
              <Th>Source</Th>
              <Th>Seniority</Th>
              <Th align="right">Avg rating</Th>
              <Th>LMPs</Th>
              <Th>Industry</Th>
              <Th>Session format</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
              {rows.map((m) => {
                const src = (["MU", "ALU", "EXT"].includes(m.source) ? m.source : "EXT") as MentorSource;
                const meta = SOURCE_META[src];
                return (
                  <tr
                    key={m.id}
                    onClick={() => navigate(`/mentors/${m.id}`)}
                    className="border-t border-n100 hover:bg-orange-50/50 cursor-pointer transition-colors"
                  >
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className={cn("h-9 w-9 rounded-full grid place-items-center text-[12px] font-semibold shrink-0", avatarColor(m.name))}>
                          {initials(m.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-n900 font-medium truncate">{cleanText(m.name) || m.name}</div>
                          <div className="text-n500 text-[12px] truncate">{roleAtCompany(m.designation, m.company)}</div>

                        </div>
                      </div>
                    </Td>
                    <Td><span className="text-n700">{primaryDomain(m.functional_domain)}</span></Td>
                    <Td>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.5px]", meta.chip)}>
                        {src}
                      </span>
                    </Td>
                    <Td className="text-n700">{m.seniority ?? "—"}</Td>
                    <Td align="right">
                      {(() => {
                        const a = assignmentMap.get(m.id);
                        const r = Number(m.rating) > 0 ? Number(m.rating) : (a?.feedbackAvg ?? 0);
                        return r > 0 ? (
                          <span className="inline-flex items-center gap-1 tabular-nums text-n800">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {r.toFixed(1)}
                          </span>
                        ) : <span className="text-n400">—</span>;
                      })()}
                    </Td>
                    <Td>
                      {(() => {
                        const a = assignmentMap.get(m.id);
                        if (!a) return <span className="text-n400">—</span>;
                        return (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-semibold">
                              {a.count}
                            </span>
                            {a.latestLmpLabel && (
                              <span className="text-[12px] text-n600 truncate max-w-[180px]">{a.latestLmpLabel}</span>
                            )}
                          </div>
                        );
                      })()}
                    </Td>
                    <Td className="text-n600 max-w-[160px] truncate">{cleanText(m.industry) || "—"}</Td>
                    <Td>
                      {(() => {
                        const f = formatMap.get(m.id);
                        if (!f || (f.oneToOne === 0 && f.oneToMany === 0)) {
                          return <span className="text-n400">—</span>;
                        }
                        return (
                          <div className="flex flex-wrap gap-1">
                            {f.oneToOne > 0 && (
                              <span
                                title={`${f.oneToOne} one-on-one session${f.oneToOne > 1 ? "s" : ""}`}
                                className="text-[10px] uppercase tracking-[0.5px] font-semibold bg-sage-50 text-sage-700 border border-sage-200 rounded-full px-1.5 py-[1px]"
                              >
                                1:1
                              </span>
                            )}
                            {f.oneToMany > 0 && (
                              <span
                                title={`${f.oneToMany} group session${f.oneToMany > 1 ? "s" : ""}`}
                                className="text-[10px] uppercase tracking-[0.5px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 rounded-full px-1.5 py-[1px]"
                              >
                                1:many
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </Td>
                    <Td align="right">
                      <button
                        onClick={(e) => { e.stopPropagation(); }}
                        className="inline-flex items-center gap-1.5 h-8 rounded-md bg-orange-500 hover:bg-orange-600 text-white px-3 text-[12px] font-medium shadow-sm transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Match
                      </button>
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-n500 text-[13px]">No mentors match your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
      </DataTableShell>
    </div>
  );
}


