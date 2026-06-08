import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { rowToALUMentor, type ALUMentor } from "@/lib/alumniStore";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { PillSelect } from "@/components/ui/pill-select";
import {
  DataTableShell,
  Th,
  Td,
  TABLE_THEAD_CLASS,
} from "@/components/ui/data-table-shell";

const AVATAR_COLORS = [
  "bg-sage-200 text-sage-600",
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
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

type SortKey = "name" | "company" | "domain" | "cohort";

const SORT_COL: Record<SortKey, string> = {
  name: "student_name",
  company: "current_company",
  domain: "domain_1",
  cohort: "cohort",
};

const PAGE_SIZE = 50;

function escapeIlike(s: string) {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function useAlumniPaged(opts: { search: string; domain: string; sort: SortKey; page: number }) {
  return useQuery({
    queryKey: ["alumni-paged", opts],
    queryFn: async () => {
      let q = (supabase.from("alumni_records") as any).select("*", { count: "exact" });
      const s = opts.search.trim();
      if (s) {
        const es = escapeIlike(s);
        q = q.or(
          `student_name.ilike.%${es}%,current_company.ilike.%${es}%,current_role_title.ilike.%${es}%,domain_1.ilike.%${es}%,domain_2.ilike.%${es}%`,
        );
      }
      if (opts.domain !== "all") {
        q = q.or(`domain_1.eq.${opts.domain},domain_2.eq.${opts.domain}`);
      }
      q = q.order(SORT_COL[opts.sort], { ascending: true, nullsFirst: false });
      const from = (opts.page - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []).map(rowToALUMentor) as ALUMentor[], total: (count as number) ?? 0 };
    },
    staleTime: 30_000,
    placeholderData: (prev: any) => prev,
  });
}

function useAlumniDomains() {
  return useQuery({
    queryKey: ["alumni-domains"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alumni_records")
        .select("domain_1,domain_2")
        .not("domain_1", "is", null);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => {
        if (r.domain_1) set.add(r.domain_1);
        if (r.domain_2) set.add(r.domain_2);
      });
      return Array.from(set).sort();
    },
    staleTime: 300_000,
  });
}

export default function AlumniPage() {
  const [q, setQ] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);

  useRealtimeInvalidate("alumni_records", [["alumni-paged"], ["alumni-domains"]]);

  const { data, isLoading } = useAlumniPaged({ search: q, domain: domainFilter, sort, page });
  const { data: domainOptions = [] } = useAlumniDomains();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Alumni"
        subtitle="Browse all alumni from the uploaded database."
      />

      {/* Filters */}
      <div className="rounded-2xl border border-n200 bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={q}
            onChange={(e) => resetPage(() => setQ(e.target.value))}
            placeholder="Search name, role, company, skill…"
          />
          <PillSelect
            value={domainFilter}
            onChange={(v) => resetPage(() => setDomainFilter(v))}
            options={[{ value: "all", label: "All domains" }, ...domainOptions.map((d) => ({ value: d, label: d }))]}
          />
          <PillSelect
            value={sort}
            onChange={(v) => resetPage(() => setSort(v as SortKey))}
            prefix="Sort"
            icon={<ArrowUpDown className="h-3.5 w-3.5 text-n500" />}
            options={[
              { value: "name", label: "Name" },
              { value: "company", label: "Company" },
              { value: "domain", label: "Domain" },
              { value: "cohort", label: "Cohort" },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <DataTableShell footer={`Showing ${rows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–${Math.min(page * PAGE_SIZE, total)} of ${total} alumni`}>
        <table className="w-full text-[13px]">
          <thead className={TABLE_THEAD_CLASS}>
            <tr>
              <Th>Alumni</Th>
              <Th>Cohort</Th>
              <Th>Domain</Th>
              <Th>Industry</Th>
              <Th>Past Companies</Th>
              <Th>Skills</Th>
              <Th>LinkedIn</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-n400 text-[13px]">
                  Loading alumni…
                </td>
              </tr>
            )}
            {!isLoading && rows.map((a) => (
              <tr key={a.id} className="border-t border-n100 hover:bg-orange-50/40 transition-colors">
                <Td>
                  <div className="flex items-center gap-3">
                    <div className={cn("h-9 w-9 rounded-full grid place-items-center text-[12px] font-semibold shrink-0", avatarColor(a.name))}>
                      {initials(a.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-n900 font-medium truncate">{a.name}</div>
                      <div className="text-n500 text-[12px] truncate">
                        {a.currentRole ?? "—"} {a.currentCompany ? `@ ${a.currentCompany}` : ""}
                      </div>
                    </div>
                  </div>
                </Td>
                <Td className="text-n700">{a.cohort || "—"}</Td>
                <Td className="text-n700">{[a.domain1, a.domain2].filter(Boolean).join(", ") || "—"}</Td>
                <Td className="text-n600 max-w-[160px] truncate">{a.industry || "—"}</Td>
                <Td className="text-n500 max-w-[180px] truncate">
                  {a.allCompanies.slice(1).join(", ") || "—"}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {a.skills.slice(0, 3).map((s) => (
                      <span key={s} className="text-[10px] uppercase tracking-[0.5px] font-medium bg-n100 text-n600 border border-n200 rounded-full px-1.5 py-[1px] truncate max-w-[100px]">
                        {s}
                      </span>
                    ))}
                    {a.skills.length > 3 && (
                      <span className="text-[10px] text-n400">+{a.skills.length - 3}</span>
                    )}
                    {a.skills.length === 0 && <span className="text-n400">—</span>}
                  </div>
                </Td>
                <Td>
                  {a.linkedin ? (
                    <a
                      href={a.linkedin.startsWith("http") ? a.linkedin : `https://${a.linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 hover:underline inline-flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : <span className="text-n400">—</span>}
                </Td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-n500 text-[13px]">
                  {total === 0 && !q && domainFilter === "all" ? "No alumni data uploaded yet." : "No alumni match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-n100 text-[12px] text-n500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-n200 hover:bg-n50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-n200 hover:bg-n50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </DataTableShell>
    </div>
  );
}
