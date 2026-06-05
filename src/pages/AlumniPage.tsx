import { useMemo, useState } from "react";
import { ExternalLink, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ALUMentor } from "@/lib/alumniStore";
import { useAlumniMentors } from "@/lib/hooks/useDbData";
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

export default function AlumniPage() {
  const { mentors: allAlumni } = useAlumniMentors();
  useRealtimeInvalidate("alumni_records", [["db-all-alumni"], ["db-all-mentors"]]);

  const [q, setQ] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");

  const domainOptions = useMemo(() => {
    const set = new Set<string>();
    allAlumni.forEach((a) => {
      if (a.domain1) set.add(a.domain1);
      if (a.domain2) set.add(a.domain2);
    });
    return Array.from(set).sort();
  }, [allAlumni]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = allAlumni.filter((a) => {
      if (domainFilter !== "all") {
        if (a.domain1 !== domainFilter && a.domain2 !== domainFilter) return false;
      }
      if (ql) {
        const hay = `${a.name} ${a.currentRole ?? ""} ${a.currentCompany ?? ""} ${a.domain1 ?? ""} ${a.domain2 ?? ""} ${a.skills.join(" ")}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
    const sorters: Record<SortKey, (a: ALUMentor, b: ALUMentor) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      company: (a, b) => (a.currentCompany ?? "").localeCompare(b.currentCompany ?? ""),
      domain: (a, b) => (a.domain1 ?? "").localeCompare(b.domain1 ?? ""),
      cohort: (a, b) => (a.cohort ?? "").localeCompare(b.cohort ?? ""),
    };
    return [...filtered].sort(sorters[sort]);
  }, [allAlumni, q, domainFilter, sort]);

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
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, role, company, skill…"
          />
          <PillSelect
            value={domainFilter}
            onChange={setDomainFilter}
            options={[{ value: "all", label: "All domains" }, ...domainOptions.map((d) => ({ value: d, label: d }))]}
          />
          <PillSelect
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
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
      <DataTableShell footer={`Showing ${rows.length} of ${allAlumni.length} alumni`}>
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
            {rows.map((a) => (
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-n500 text-[13px]">
                  {allAlumni.length === 0 ? "No alumni data uploaded yet." : "No alumni match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}

