import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/ui/empty-state";

const PAGE_SIZE = 50;

type Row = {
  id: string;
  lmp_id: string;
  mentor_id: string;
  student_id: string | null;
  status: string;
  match_score: number | null;
  mentor_source: string | null;
  session_count: number;
  feedback_avg: number | null;
  assigned_by: string | null;
  notes: string | null;
  assigned_at: string | null;
  mentor_name?: string | null;
  mentor_role?: string | null;
  mentor_company?: string | null;
  mentor_rating?: number | null;
  source?: string | null;
  lmp_label?: string | null;
  student_count?: number;
  mode?: "1:1" | "Group";
  sessions_count?: number;
};

const sourceStyle = (src?: string | null) => {
  const s = (src || "").toUpperCase();
  if (s === "MU") return "bg-teal-50 text-teal-700 border-teal-200";
  if (s === "ALU") return "bg-violet-50 text-violet-700 border-violet-200";
  if (s === "EXT") return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-n50 text-n600 border-n200";
};

const cleanMentorText = (value?: string | null): string | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s*\([^)]*\b(fictional|assuming|hypothetical|placeholder|example|n\/a|tbd)\b[^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
};

export function LmpMentorAssignmentsModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["lmp-mentor-assignments-all"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("lmp_mentors")
        .select("id, lmp_id, mentor_id, student_id, status, match_score, mentor_source, session_count, feedback_avg, assigned_by, notes, assigned_at")
        .order("assigned_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      const base = (data ?? []) as Row[];

      const mentorIds = Array.from(new Set(base.map(r => r.mentor_id).filter(Boolean)));
      const lmpIds = Array.from(new Set(base.map(r => r.lmp_id).filter(Boolean)));

      const [mentors, lmps, sessions] = await Promise.all([
        mentorIds.length
          ? supabase.from("mentors").select("id, name, role, company, designation, source, rating")
              .in("id", mentorIds)
          : Promise.resolve({ data: [], error: null } as any),
        lmpIds.length
          ? supabase.from("lmp_processes").select("id, company, role").in("id", lmpIds)
          : Promise.resolve({ data: [], error: null } as any),
        mentorIds.length && lmpIds.length
          ? supabase.from("sessions")
              .select("id, mentor_id, lmp_id, candidate_ids, student_id")
              .in("mentor_id", mentorIds)
              .in("lmp_id", lmpIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const mMap = new Map<string, any>((mentors.data ?? []).map((m: any) => [m.id, m]));
      const lMap = new Map<string, string>(
        (lmps.data ?? []).map((l: any) => [l.id, [l.company, l.role].filter(Boolean).join(" · ")]),
      );

      // Bucket sessions by mentor+lmp
      const sessionBuckets = new Map<string, any[]>();
      for (const s of (sessions.data ?? []) as any[]) {
        const k = `${s.mentor_id}::${s.lmp_id}`;
        if (!sessionBuckets.has(k)) sessionBuckets.set(k, []);
        sessionBuckets.get(k)!.push(s);
      }

      // Group lmp_mentors rows by mentor+lmp to estimate students assigned
      const assignBuckets = new Map<string, Row[]>();
      for (const r of base) {
        const k = `${r.mentor_id}::${r.lmp_id}`;
        if (!assignBuckets.has(k)) assignBuckets.set(k, []);
        assignBuckets.get(k)!.push(r);
      }

      return base.map(r => {
        const m = mMap.get(r.mentor_id);
        const key = `${r.mentor_id}::${r.lmp_id}`;
        const sList = sessionBuckets.get(key) ?? [];
        const assigns = assignBuckets.get(key) ?? [];

        const studentSet = new Set<string>();
        let anyGroupSession = false;
        for (const s of sList) {
          const ids: string[] = Array.isArray(s.candidate_ids) ? s.candidate_ids : [];
          ids.forEach(id => id && studentSet.add(id));
          if (s.student_id) studentSet.add(s.student_id);
          if (ids.length > 1) anyGroupSession = true;
        }
        for (const a of assigns) {
          if (a.student_id) studentSet.add(a.student_id);
        }
        const studentCount = studentSet.size || (r.student_id ? 1 : assigns.length || 0);
        const mode: "1:1" | "Group" = (anyGroupSession || studentCount > 1) ? "Group" : "1:1";
        const sessionsCount = sList.length || (r.session_count ?? 0);
        const rating = (m?.rating && m.rating > 0) ? Number(m.rating) : (r.feedback_avg ?? 0);

        return {
          ...r,
          mentor_name: m?.name ?? null,
          mentor_role: cleanMentorText(m?.designation || m?.role),
          mentor_company: cleanMentorText(m?.company),
          mentor_rating: rating || null,
          source: m?.source ?? r.mentor_source ?? null,
          lmp_label: lMap.get(r.lmp_id) ?? null,
          student_count: studentCount,
          mode,
          sessions_count: sessionsCount,
        };
      });
    },
    enabled: open,
    staleTime: 30_000,
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(r =>
      (r.mentor_name || "").toLowerCase().includes(q) ||
      (r.mentor_role || "").toLowerCase().includes(q) ||
      (r.mentor_company || "").toLowerCase().includes(q) ||
      (r.lmp_label || "").toLowerCase().includes(q) ||
      (r.status || "").toLowerCase().includes(q) ||
      (r.source || "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1280px] max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-n200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-[16px] font-semibold text-n900">LMP Mentor Assignments</DialogTitle>
              <p className="text-[12px] text-n500 mt-0.5">
                Showing {filtered.length} of {rows.length} assignments
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-n200 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search mentor, role, company, LMP, status, source…"
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-n200 rounded-md focus:outline-none focus:border-orange-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="text-center text-[13px] text-n500 py-8">Loading…</div>
          ) : pageRows.length === 0 ? (
            <EmptyState icon={Users} title="No assignments" description="Mentor assignments will appear here once mentors are matched to LMP candidates." />
          ) : (
            <table className="w-full text-[13px]">
              <thead className="text-left text-n500 text-[11px] uppercase tracking-wide">
                <tr className="border-b border-n100">
                  <th className="py-2 pr-3 font-medium">Mentor</th>
                  <th className="py-2 pr-3 font-medium">Role @ Company</th>
                  <th className="py-2 pr-3 font-medium">LMP Process</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium text-right">Students</th>
                  <th className="py-2 pr-3 font-medium">Mode</th>
                  <th className="py-2 pr-3 font-medium text-right">Rating</th>
                  <th className="py-2 pr-3 font-medium text-right">Sessions</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Assigned</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(r => (
                  <tr key={r.id} className="border-b border-n100/60 hover:bg-n50/50">
                    <td className="py-2 pr-3 text-n900">{r.mentor_name || r.mentor_id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-n700">
                      {r.mentor_role || r.mentor_company
                        ? `${r.mentor_role || "—"}${r.mentor_company ? " @ " + r.mentor_company : ""}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-n700">{r.lmp_label || r.lmp_id.slice(0, 8)}</td>
                    <td className="py-2 pr-3">
                      {r.source ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${sourceStyle(r.source)}`}>
                          {r.source.toUpperCase()}
                        </span>
                      ) : <span className="text-n400">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-n700 tabular-nums text-right">{r.student_count ?? 0}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        r.mode === "Group"
                          ? "bg-orange-50 text-orange-700 border-orange-200"
                          : "bg-teal-50 text-teal-700 border-teal-200"
                      }`}>
                        {r.mode === "Group" ? `Group · ${r.student_count}` : "1:1"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-n700 tabular-nums text-right">
                      {r.mentor_rating ? (
                        <span className="inline-flex items-center gap-1 justify-end">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {r.mentor_rating.toFixed(1)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-n700 tabular-nums text-right">{r.sessions_count ?? 0}</td>
                    <td className="py-2 pr-3 text-n700">{r.status}</td>
                    <td className="py-2 pr-3 text-n500">
                      {r.assigned_at ? new Date(r.assigned_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-n200 flex items-center justify-between text-[12px] text-n500 shrink-0">
            <div>Page {page} of {totalPages}</div>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 border border-n200 rounded-md disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 border border-n200 rounded-md disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
